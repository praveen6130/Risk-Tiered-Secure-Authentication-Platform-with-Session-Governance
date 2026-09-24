from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets

from app.core.config import settings
from app.db.session import get_session_context
from app.models.models import RiskTier, Session, SessionStatus, User
from sqlmodel import select
from app.schemas.schemas import DeviceFingerprintCreate, LoginRequest, MFAVerifyRequest, RiskAssessmentResponse, StepUpChallengeRequest, Token
from app.services.audit import audit_logger
from app.services.risk_engine import risk_engine
from app.utils.device import get_or_create_device, is_trusted_device
from app.utils.geo import get_geo_ip
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_backup_code,
    generate_refresh_token,
    generate_session_token,
    hash_backup_codes,
    hash_password,
    hash_token,
    verify_backup_code,
    verify_password,
)
from app.utils.totp import TOTPManager, verify_totp


class AuthService:
    async def register(
        self,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        device_fingerprint: Optional[DeviceFingerprintCreate] = None,
        ip: str = "unknown",
        user_agent: str = "unknown",
    ) -> User:
        async with get_session_context() as session:
            from sqlmodel import select
            stmt = select(User).where(User.email == email)
            result = await session.exec(stmt)
            existing = result.first()
            if existing:
                raise ValueError("Email already registered")
            
            password_hash = hash_password(password)
            user = User(
                email=email,
                password_hash=password_hash,
                full_name=full_name,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            
            if device_fingerprint:
                await get_or_create_device(
                    user.id,
                    device_fingerprint.fingerprint,
                    user_agent,
                )
            
            await audit_logger.log(
                action="register",
                description="User registered",
                ip_address=ip,
                user_agent=user_agent,
                user_id=user.id,
            )
            
            return user
    
    async def login(
        self,
        request: LoginRequest,
        ip: str,
        user_agent: str,
    ) -> Token:
        async with get_session_context() as session:
            from sqlmodel import select
            stmt = select(User).where(User.email == request.email)
            result = await session.exec(stmt)
            user = result.first()
            
            if not user or not user.is_active:
                await audit_logger.log_login_failed(
                    request.email, ip, user_agent, "Invalid credentials"
                )
                raise ValueError("Invalid credentials")
            
            if not verify_password(request.password, user.password_hash):
                await audit_logger.log_login_failed(
                    request.email, ip, user_agent, "Invalid password"
                )
                raise ValueError("Invalid credentials")
            
            geo = await get_geo_ip(ip)
            
            device_fp = None
            if request.device_fingerprint:
                device_fp = request.device_fingerprint.fingerprint
            
            risk_assessment = await risk_engine.assess_login_risk(
                user, ip, user_agent, device_fp or {}, geo
            )
            
            session_token = generate_session_token()
            refresh_token = generate_refresh_token()
            
            device = None
            if request.device_fingerprint:
                device = await get_or_create_device(
                    user.id,
                    request.device_fingerprint.fingerprint,
                    user_agent,
                    "Auto-registered" if request.remember_device else None,
                )
            
            new_session = Session(
                user_id=user.id,
                session_token=hash_token(session_token),
                refresh_token_hash=hash_token(refresh_token),
                device_fingerprint_id=device.id if device else None,
                ip_address=ip,
                user_agent=user_agent,
                country=geo.country,
                city=geo.city,
                risk_score=risk_assessment.risk_score,
                risk_tier=risk_assessment.risk_tier,
                risk_factors=risk_assessment.risk_factors,
                status=SessionStatus.STEP_UP_REQUIRED if risk_assessment.requires_step_up else SessionStatus.ACTIVE,
                mfa_verified=not risk_assessment.requires_step_up and not user.mfa_enabled,
                expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            )
            session.add(new_session)
            
            user.last_login_at = datetime.now(timezone.utc)
            session.add(user)
            
            await session.commit()
            await session.refresh(new_session)
            
            await risk_engine.update_user_profile(user, datetime.now(timezone.utc))
            
            if user.mfa_enabled or risk_assessment.requires_step_up:
                await audit_logger.log_session_created(user, new_session, ip, user_agent)
                return Token(
                    access_token="",
                    refresh_token="",
                    token_type="bearer",
                    expires_in=0,
                    mfa_required=True,
                    session_id=str(new_session.id),
                )
            
            access_token = create_access_token({"sub": str(user.id), "session_id": new_session.id})
            await audit_logger.log_login_success(user, new_session, ip, user_agent, risk_assessment.risk_score, risk_assessment.risk_tier)
            
            return Token(
                access_token=access_token,
                refresh_token=refresh_token,
                token_type="bearer",
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                mfa_required=False,
            )
    
    async def setup_mfa(self, user: User) -> dict:
        totp = TOTPManager()
        secret = totp.get_secret()
        qr_code = totp.get_qr_code(user.email)
        manual_key = secret
        
        backup_codes = [generate_backup_code() for _ in range(settings.BACKUP_CODES_COUNT)]
        backup_codes_hash = hash_backup_codes(backup_codes)
        
        async with get_session_context() as session:
            user.totp_secret = secret
            user.backup_codes_hash = backup_codes_hash
            session.add(user)
            await session.commit()
        
        return {
            "secret": secret,
            "qr_code": qr_code,
            "manual_entry_key": manual_key,
            "backup_codes": backup_codes,
        }
    
    async def verify_mfa_setup(self, user: User, code: str) -> bool:
        if not user.totp_secret:
            return False
        
        if verify_totp(user.totp_secret, code):
            async with get_session_context() as session:
                user.mfa_enabled = True
                session.add(user)
                await session.commit()
            
            await audit_logger.log_mfa_setup(user, "unknown", "unknown")
            return True
        return False
    
    async def disable_mfa(self, user: User, code: str) -> bool:
        if not user.mfa_enabled or not user.totp_secret:
            return False
        
        if verify_totp(user.totp_secret, code) or self._verify_backup_code(user, code):
            async with get_session_context() as session:
                user.mfa_enabled = False
                user.totp_secret = None
                user.backup_codes_hash = None
                session.add(user)
                await session.commit()
            return True
        return False
    
    async def verify_mfa_challenge(
        self,
        session_id: int,
        code: str,
        ip: str,
        user_agent: str,
    ) -> Token:
        async with get_session_context() as session:
            stmt = select(Session).where(Session.id == session_id)
            result = await session.exec(stmt)
            sess = result.first()
            
            if not sess or sess.status != SessionStatus.STEP_UP_REQUIRED:
                raise ValueError("Invalid session")
            
            user_stmt = select(User).where(User.id == sess.user_id)
            user_result = await session.exec(user_stmt)
            user = user_result.first()
            
            if not user or not user.mfa_enabled or not user.totp_secret:
                raise ValueError("MFA not configured")
            
            if verify_totp(user.totp_secret, code):
                sess.mfa_verified = True
                sess.status = SessionStatus.ACTIVE
                sess.step_up_completed = True
                session.add(sess)
                await session.commit()
                await session.refresh(sess)
                
                access_token = create_access_token({"sub": str(user.id), "session_id": sess.id})
                refresh_token = generate_refresh_token()
                sess.refresh_token_hash = hash_token(refresh_token)
                session.add(sess)
                await session.commit()
                
                await audit_logger.log_mfa_verify(user, sess, ip, user_agent, True)
                await audit_logger.log_login_success(user, sess, ip, user_agent, sess.risk_score, sess.risk_tier, True)
                
                return Token(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    token_type="bearer",
                    expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                )
            
            await audit_logger.log_mfa_verify(user, sess, ip, user_agent, False)
            raise ValueError("Invalid MFA code")
    
    async def verify_backup_code(self, user: User, code: str, ip: str, user_agent: str) -> Token:
        if not user.backup_codes_hash:
            raise ValueError("No backup codes available")
        
        valid, remaining = verify_backup_code(code, user.backup_codes_hash)
        if not valid:
            raise ValueError("Invalid backup code")
        
        async with get_session_context() as session:
            user.backup_codes_hash = remaining
            session.add(user)
            await session.commit()
        
        return await self._create_tokens(user, ip, user_agent)
    
    async def refresh_tokens(
        self,
        refresh_token: str,
        ip: str,
        user_agent: str,
    ) -> Token:
        async with get_session_context() as session:
            refresh_hash = hash_token(refresh_token)
            stmt = select(Session).where(Session.refresh_token_hash == refresh_hash)
            result = await session.exec(stmt)
            sess = result.first()
            
            if not sess or sess.status != SessionStatus.ACTIVE:
                raise ValueError("Invalid or revoked refresh token")
            
            expires_at = sess.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                sess.status = SessionStatus.EXPIRED
                session.add(sess)
                await session.commit()
                raise ValueError("Refresh token expired")
            
            user_stmt = select(User).where(User.id == sess.user_id)
            user_result = await session.exec(user_stmt)
            user = user_result.first()
            
            if not user or not user.is_active:
                raise ValueError("User not found or inactive")
            
            new_refresh = generate_refresh_token()
            sess.refresh_token_hash = hash_token(new_refresh)
            sess.last_activity_at = datetime.now(timezone.utc)
            session.add(sess)
            await session.commit()
            
            access_token = create_access_token({"sub": str(user.id), "session_id": sess.id})
            
            return Token(
                access_token=access_token,
                refresh_token=new_refresh,
                token_type="bearer",
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            )
    
    async def revoke_session(self, session_id: int, user_id: int, reason: str, ip: str, user_agent: str) -> bool:
        async with get_session_context() as session:
            stmt = select(Session).where(Session.id == session_id, Session.user_id == user_id)
            result = await session.exec(stmt)
            sess = result.first()
            
            if not sess:
                return False
            
            sess.status = SessionStatus.REVOKED
            sess.revoked_at = datetime.now(timezone.utc)
            sess.revoked_reason = reason
            session.add(sess)
            await session.commit()
            
            user_stmt = select(User).where(User.id == user_id)
            user_result = await session.exec(user_stmt)
            user = user_result.first()
            if user:
                await audit_logger.log_session_revoked(user, sess, ip, user_agent, reason)
            return True
    
    async def revoke_all_sessions(self, user_id: int, reason: str, ip: str, user_agent: str, exclude_session_id: Optional[int] = None) -> int:
        async with get_session_context() as session:
            stmt = select(Session).where(Session.user_id == user_id, Session.status == SessionStatus.ACTIVE)
            if exclude_session_id:
                stmt = stmt.where(Session.id != exclude_session_id)
            result = await session.exec(stmt)
            sessions = list(result.all())
            
            count = 0
            for sess in sessions:
                sess.status = SessionStatus.REVOKED
                sess.revoked_at = datetime.now(timezone.utc)
                sess.revoked_reason = reason
                session.add(sess)
                count += 1
            
            await session.commit()
            
            user_stmt = select(User).where(User.id == user_id)
            user_result = await session.exec(user_stmt)
            user = user_result.first()
            if user:
                for sess in sessions:
                    await audit_logger.log_session_revoked(user, sess, ip, user_agent, reason)
            
            return count
    
    async def get_user_sessions(self, user_id: int) -> list[Session]:
        async with get_session_context() as session:
            stmt = select(Session).where(Session.user_id == user_id).order_by(Session.last_activity_at.desc())
            result = await session.exec(stmt)
            return list(result.all())
    
    async def get_all_sessions(
        self,
        status: Optional[SessionStatus] = None,
        risk_tier: Optional[RiskTier] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Session]:
        async with get_session_context() as session:
            stmt = select(Session).order_by(Session.last_activity_at.desc())
            if status:
                stmt = stmt.where(Session.status == status)
            if risk_tier:
                stmt = stmt.where(Session.risk_tier == risk_tier)
            stmt = stmt.limit(limit).offset(offset)
            result = await session.exec(stmt)
            return list(result.all())
    
    async def step_up_challenge(
        self,
        session_id: int,
        challenge_type: str,
        code: Optional[str],
        ip: str,
        user_agent: str,
    ) -> Token:
        async with get_session_context() as session:
            stmt = select(Session).where(Session.id == session_id)
            result = await session.exec(stmt)
            sess = result.first()
            
            if not sess or sess.status != SessionStatus.STEP_UP_REQUIRED:
                raise ValueError("Invalid session for step-up")
            
            user_stmt = select(User).where(User.id == sess.user_id)
            user_result = await session.exec(user_stmt)
            user = user_result.first()
            
            success = False
            if challenge_type == "totp" and code and user.totp_secret:
                success = verify_totp(user.totp_secret, code)
            elif challenge_type == "email_otp":
                success = True
            elif challenge_type == "device_approval":
                success = True
            
            if success:
                sess.mfa_verified = True
                sess.status = SessionStatus.ACTIVE
                sess.step_up_completed = True
                session.add(sess)
                await session.commit()
                await session.refresh(sess)
                
                access_token = create_access_token({"sub": str(user.id), "session_id": sess.id})
                refresh_token = generate_refresh_token()
                sess.refresh_token_hash = hash_token(refresh_token)
                session.add(sess)
                await session.commit()
                
                await audit_logger.log_step_up(user, sess, ip, user_agent, challenge_type, True)
                await audit_logger.log_login_success(user, sess, ip, user_agent, sess.risk_score, sess.risk_tier, True)
                
                return Token(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    token_type="bearer",
                    expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                )
            
            await audit_logger.log_step_up(user, sess, ip, user_agent, challenge_type, False)
            raise ValueError("Step-up challenge failed")
    
    def _verify_backup_code(self, user: User, code: str) -> bool:
        if not user.backup_codes_hash:
            return False
        valid, _ = verify_backup_code(code, user.backup_codes_hash)
        return valid
    
    async def _create_tokens(self, user: User, ip: str, user_agent: str) -> Token:
        async with get_session_context() as session:
            session_token = generate_session_token()
            refresh_token = generate_refresh_token()
            
            new_session = Session(
                user_id=user.id,
                session_token=hash_token(session_token),
                refresh_token_hash=hash_token(refresh_token),
                ip_address=ip,
                user_agent=user_agent,
                risk_score=0.0,
                risk_tier=RiskTier.LOW,
                status=SessionStatus.ACTIVE,
                mfa_verified=True,
                expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            )
            session.add(new_session)
            await session.commit()
            await session.refresh(new_session)
            
            access_token = create_access_token({"sub": str(user.id), "session_id": new_session.id})
            
            return Token(
                access_token=access_token,
                refresh_token=refresh_token,
                token_type="bearer",
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            )


auth_service = AuthService()