from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, func

from app.core.config import settings
from app.db.session import get_session
from app.models.models import AuditLog, RiskTier, Session, SessionStatus, User
from app.schemas.schemas import (
    AuditLogResponse,
    GeoIPResponse,
    RevokeSessionRequest,
    RiskAssessmentResponse,
    SessionDetailResponse,
    SessionResponse,
    UserResponse,
)
from app.services.auth import auth_service
from app.services.audit import audit_logger
from app.services.risk_engine import risk_engine
from app.utils.geo import get_geo_ip
from app.api.auth import require_admin


router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    admin: User = Depends(require_admin),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
):
    async with get_session() as session:
        stmt = select(User)
        if search:
            stmt = stmt.where(User.email.contains(search) | User.full_name.contains(search))
        stmt = stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
        result = await session.exec(stmt)
        users = list(result.all())
    return [UserResponse.model_validate(u) for u in users]


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    admin: User = Depends(require_admin),
    status: Optional[SessionStatus] = None,
    risk_tier: Optional[RiskTier] = None,
    user_id: Optional[int] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    sessions = await auth_service.get_all_sessions(status, risk_tier, limit, offset)
    
    if user_id:
        sessions = [s for s in sessions if s.user_id == user_id]
    
    return [SessionResponse.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(
    session_id: int,
    admin: User = Depends(require_admin),
):
    async with get_session() as session:
        stmt = select(Session).where(Session.id == session_id)
        result = await session.exec(stmt)
        sess = result.first()
        
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        
        user_stmt = select(User).where(User.id == sess.user_id)
        user_result = await session.exec(user_stmt)
        user = user_result.first()
        
        audit_stmt = select(AuditLog).where(AuditLog.session_id == session_id).order_by(AuditLog.created_at.desc())
        audit_result = await session.exec(audit_stmt)
        audits = list(audit_result.all())
        
        detail = SessionDetailResponse.model_validate(sess)
        detail.user = UserResponse.model_validate(user) if user else None
        detail.audit_logs = [AuditLogResponse.model_validate(a) for a in audits]
        
        return detail


@router.post("/sessions/revoke")
async def revoke_sessions(
    request: RevokeSessionRequest,
    admin: User = Depends(require_admin),
):
    revoked = 0
    for session_id in request.session_ids:
        success = await auth_service.revoke_session(
            session_id, 0, request.reason, "admin", "admin"
        )
        if success:
            revoked += 1
    
    return {"revoked": revoked}


@router.post("/users/{user_id}/revoke-all")
async def revoke_all_user_sessions(
    user_id: int,
    reason: str = "Admin revocation",
    admin: User = Depends(require_admin),
):
    count = await auth_service.revoke_all_sessions(user_id, reason, "admin", "admin")
    return {"revoked": count}


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def get_audit_logs(
    admin: User = Depends(require_admin),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = None,
    risk_tier: Optional[RiskTier] = None,
    user_id: Optional[int] = None,
):
    async with get_session() as session:
        stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
        if action:
            stmt = stmt.where(AuditLog.action == action)
        if risk_tier:
            stmt = stmt.where(AuditLog.risk_tier == risk_tier)
        if user_id:
            stmt = stmt.where(AuditLog.user_id == user_id)
        stmt = stmt.limit(limit).offset(offset)
        result = await session.exec(stmt)
        logs = list(result.all())
    return [AuditLogResponse.model_validate(l) for l in logs]


@router.get("/risk/stats")
async def get_risk_stats(
    admin: User = Depends(require_admin),
):
    async with get_session() as session:
        total_stmt = select(func.count(Session.id))
        total_result = await session.exec(total_stmt)
        total = total_result.first() or 0
        
        active_stmt = select(func.count(Session.id)).where(Session.status == SessionStatus.ACTIVE)
        active_result = await session.exec(active_stmt)
        active = active_result.first() or 0
        
        tier_stats = {}
        for tier in RiskTier:
            tier_stmt = select(func.count(Session.id)).where(Session.risk_tier == tier)
            tier_result = await session.exec(tier_stmt)
            tier_stats[tier.value] = tier_result.first() or 0
        
        recent_stmt = select(func.count(AuditLog.id)).where(
            AuditLog.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        )
        recent_result = await session.exec(recent_stmt)
        today_logs = recent_result.first() or 0
        
        return {
            "total_sessions": total,
            "active_sessions": active,
            "risk_distribution": tier_stats,
            "audit_logs_today": today_logs,
        }


@router.get("/geo/{ip}", response_model=GeoIPResponse)
async def lookup_geo(
    ip: str,
    admin: User = Depends(require_admin),
):
    return await get_geo_ip(ip)


@router.post("/risk/assess", response_model=RiskAssessmentResponse)
async def assess_risk(
    user_id: int,
    ip: str,
    user_agent: str,
    device_fingerprint: dict,
    admin: User = Depends(require_admin),
):
    async with get_session() as session:
        stmt = select(User).where(User.id == user_id)
        result = await session.exec(stmt)
        user = result.first()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    
    return await risk_engine.assess_login_risk(user, ip, user_agent, device_fingerprint)