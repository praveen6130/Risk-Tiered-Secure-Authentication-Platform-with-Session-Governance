from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import settings
from app.models.models import RiskTier, Session, User
from app.schemas.schemas import GeoIPResponse, RiskAssessmentResponse
from app.utils.geo import get_geo_ip, is_impossible_travel
from app.db.session import get_session_context
from sqlmodel import select, func


class RiskEngine:
    def __init__(self):
        self.enabled = settings.RISK_ENABLED
    
    async def assess_login_risk(
        self,
        user: User,
        ip: str,
        user_agent: str,
        device_fingerprint: dict,
        geo: Optional[GeoIPResponse] = None,
    ) -> RiskAssessmentResponse:
        if not self.enabled:
            return RiskAssessmentResponse(
                risk_score=0.0,
                risk_tier=RiskTier.LOW,
                risk_factors={},
                requires_step_up=False,
            )
        
        risk_factors = {}
        risk_score = 0.0
        
        is_known, device = await self._check_device(user.id, device_fingerprint)
        if not is_known:
            risk_score += settings.RISK_NEW_DEVICE_WEIGHT
            risk_factors["new_device"] = {"weight": settings.RISK_NEW_DEVICE_WEIGHT, "description": "Unrecognized device"}
        elif device and not device.is_trusted:
            risk_score += 0.3
            risk_factors["known_untrusted_device"] = {"weight": 0.3, "description": "Known but untrusted device"}
        
        if geo is None:
            geo = await get_geo_ip(ip)
        
        last_session = await self._get_last_successful_session(user.id)
        if last_session and last_session.country and geo.country:
            if last_session.country != geo.country:
                risk_score += settings.RISK_NEW_COUNTRY_WEIGHT
                risk_factors["new_country"] = {
                    "weight": settings.RISK_NEW_COUNTRY_WEIGHT,
                    "description": f"Login from new country: {geo.country}",
                    "last_country": last_session.country,
                    "current_country": geo.country,
                }
            elif last_session.city != geo.city:
                risk_score += settings.RISK_NEW_CITY_WEIGHT
                risk_factors["new_city"] = {
                    "weight": settings.RISK_NEW_CITY_WEIGHT,
                    "description": f"Login from new city: {geo.city}",
                    "last_city": last_session.city,
                    "current_city": geo.city,
                }
        
        if geo.is_vpn or geo.is_proxy:
            risk_score += settings.RISK_VPN_PROXY_WEIGHT
            risk_factors["vpn_proxy"] = {
                "weight": settings.RISK_VPN_PROXY_WEIGHT,
                "description": "VPN or proxy detected",
            }
        
        if geo.is_tor:
            risk_score += settings.RISK_VPN_PROXY_WEIGHT + 0.2
            risk_factors["tor"] = {
                "weight": settings.RISK_VPN_PROXY_WEIGHT + 0.2,
                "description": "Tor network detected",
            }
        
        if last_session and is_impossible_travel(
            last_session.last_activity_at,
            last_session.ip_address,
            ip,
            GeoIPResponse(
                ip=last_session.ip_address,
                country=last_session.country,
                city=last_session.city,
                latitude=0.0,
                longitude=0.0,
            ),
            geo,
        ):
            risk_score += settings.RISK_IMPOSSIBLE_TRAVEL_WEIGHT
            risk_factors["impossible_travel"] = {
                "weight": settings.RISK_IMPOSSIBLE_TRAVEL_WEIGHT,
                "description": "Impossible travel detected",
            }
        
        current_hour = datetime.now(timezone.utc).hour
        typical_hours = user.risk_profile.get("typical_login_hours", [])
        if typical_hours and current_hour not in typical_hours:
            risk_score += settings.RISK_UNUSUAL_HOUR_WEIGHT
            risk_factors["unusual_hour"] = {
                "weight": settings.RISK_UNUSUAL_HOUR_WEIGHT,
                "description": f"Login at unusual hour: {current_hour}:00 UTC",
            }
        
        current_weekday = datetime.now(timezone.utc).weekday()
        typical_days = user.risk_profile.get("typical_login_days", [])
        if typical_days and current_weekday not in typical_days:
            risk_score += settings.RISK_UNUSUAL_DAY_WEIGHT
            risk_factors["unusual_day"] = {
                "weight": settings.RISK_UNUSUAL_DAY_WEIGHT,
                "description": f"Login on unusual day: {current_weekday}",
            }
        
        recent_logins = await self._count_recent_logins(user.id, hours=1)
        if recent_logins >= 3:
            risk_score += settings.RISK_VELOCITY_WEIGHT
            risk_factors["high_velocity"] = {
                "weight": settings.RISK_VELOCITY_WEIGHT,
                "description": f"High login velocity: {recent_logins} logins in last hour",
            }
        
        failed_streak = await self._get_failed_login_streak(user.id)
        if failed_streak >= 5:
            risk_score += settings.RISK_FAILED_STREAK_WEIGHT
            risk_factors["failed_streak"] = {
                "weight": settings.RISK_FAILED_STREAK_WEIGHT,
                "description": f"Recent failed login attempts: {failed_streak}",
            }
        
        risk_score = min(risk_score, 1.0)
        
        if risk_score >= settings.RISK_HIGH_THRESHOLD:
            risk_tier = RiskTier.CRITICAL
        elif risk_score >= settings.RISK_MEDIUM_THRESHOLD:
            risk_tier = RiskTier.HIGH
        elif risk_score >= settings.RISK_LOW_THRESHOLD:
            risk_tier = RiskTier.MEDIUM
        else:
            risk_tier = RiskTier.LOW
        
        requires_step_up = risk_tier in (RiskTier.HIGH, RiskTier.CRITICAL)
        step_up_type = self._determine_step_up_type(risk_tier, user, is_known)
        
        return RiskAssessmentResponse(
            risk_score=risk_score,
            risk_tier=risk_tier,
            risk_factors=risk_factors,
            requires_step_up=requires_step_up,
            step_up_type=step_up_type,
        )
    
    def _determine_step_up_type(
        self,
        tier: RiskTier,
        user: User,
        is_known_device: bool,
    ) -> Optional[str]:
        if tier == RiskTier.CRITICAL:
            return "device_approval"
        elif tier == RiskTier.HIGH:
            if user.mfa_enabled:
                return "totp"
            return "email_otp"
        elif tier == RiskTier.MEDIUM:
            if user.mfa_enabled:
                return "totp"
            return "email_otp"
        return None
    
    async def _check_device(self, user_id: int, fingerprint: dict) -> tuple[bool, Optional]:
        from app.utils.device import is_known_device
        return await is_known_device(user_id, fingerprint)
    
    async def _get_last_successful_session(self, user_id: int) -> Optional[Session]:
        async with get_session_context() as session:
            stmt = select(Session).where(
                Session.user_id == user_id,
                Session.status == "active",
                Session.mfa_verified == True,
            ).order_by(Session.last_activity_at.desc())
            result = await session.exec(stmt)
            return result.first()
    
    async def _count_recent_logins(self, user_id: int, hours: int = 1) -> int:
        async with get_session_context() as session:
            since = datetime.now(timezone.utc) - timedelta(hours=hours)
            stmt = select(func.count(Session.id)).where(
                Session.user_id == user_id,
                Session.created_at >= since,
            )
            result = await session.exec(stmt)
            return result.first() or 0
    
    async def _get_failed_login_streak(self, user_id: int) -> int:
        from app.models.models import AuditLog
        async with get_session_context() as session:
            stmt = select(AuditLog).where(
                AuditLog.user_id == user_id,
                AuditLog.action.in_(["login_failed", "mfa_failed"]),
            ).order_by(AuditLog.created_at.desc()).limit(10)
            result = await session.exec(stmt)
            logs = list(result.all())
            
            streak = 0
            for log in logs:
                if log.action in ("login_failed", "mfa_failed"):
                    streak += 1
                else:
                    break
            return streak
    
    async def update_user_profile(self, user: User, login_time: datetime) -> None:
        profile = user.risk_profile or {}
        
        typical_hours = profile.get("typical_login_hours", [])
        current_hour = login_time.hour
        if current_hour not in typical_hours:
            typical_hours.append(current_hour)
            typical_hours = typical_hours[-24:]
        profile["typical_login_hours"] = typical_hours
        
        typical_days = profile.get("typical_login_days", [])
        current_day = login_time.weekday()
        if current_day not in typical_days:
            typical_days.append(current_day)
        profile["typical_login_days"] = typical_days
        
        user.risk_profile = profile


risk_engine = RiskEngine()