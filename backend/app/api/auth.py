from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Cookie, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import select

from app.core.config import settings
from app.db.session import get_session, get_session_context
from app.models.models import Session, SessionStatus, User, RiskTier, AuditLog
from app.schemas.schemas import (
    AuditLogResponse,
    DeviceFingerprintCreate,
    LoginRequest,
    MFASetupResponse,
    MFAVerifyRequest,
    RefreshTokenRequest,
    RevokeSessionRequest,
    UserRevokeSessionRequest,
    SessionResponse,
    SessionDetailResponse,
    StepUpChallengeRequest,
    StepUpStatusResponse,
    Token,
    UserCreate,
    UserResponse,
)
from app.services.auth import auth_service
from app.services.audit import audit_logger
from app.services.risk_engine import risk_engine
from app.utils.rate_limit import rate_limiter
from app.utils.security import decode_token, hash_token


router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user_id = payload.get("sub")
    session_id = payload.get("session_id")
    
    async with get_session_context() as session:
        stmt = select(User).where(User.id == int(user_id))
        result = await session.exec(stmt)
        user = result.first()
        
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        
        sess_stmt = select(Session).where(
            Session.id == int(session_id),
            Session.user_id == user.id,
            Session.status == SessionStatus.ACTIVE,
        )
        sess_result = await session.exec(sess_stmt)
        sess = sess_result.first()
        
        if not sess:
            raise HTTPException(status_code=401, detail="Session invalid or revoked")
        
        return user


async def get_current_session(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Session:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")
    
    session_id = payload.get("session_id")
    
    async with get_session() as session:
        stmt = select(Session).where(
            Session.id == int(session_id),
            Session.status == SessionStatus.ACTIVE,
        )
        result = await session.exec(stmt)
        sess = result.first()
        
        if not sess:
            raise HTTPException(status_code=401, detail="Session invalid or revoked")
        
        return sess


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    request: Request,
    response: Response,
    user_data: UserCreate,
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    rl_result = await rate_limiter.check_limit(f"register:{client_ip}", settings.RATE_LIMIT_REGISTER)
    if not rl_result.allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded", headers={"Retry-After": str(rl_result.retry_after or 60)})
    
    try:
        user = await auth_service.register(
            email=user_data.email,
            password=user_data.password,
            full_name=user_data.full_name,
            device_fingerprint=user_data.device_fingerprint,
            ip=client_ip,
            user_agent=user_agent,
        )
        return UserResponse.model_validate(user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    response: Response,
    login_data: LoginRequest,
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    rl_result = await rate_limiter.check_limit(f"login:{client_ip}", settings.RATE_LIMIT_LOGIN)
    if not rl_result.allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded", headers={"Retry-After": str(rl_result.retry_after or 60)})
    
    rl_result = await rate_limiter.check_limit(f"login:email:{login_data.email}", settings.RATE_LIMIT_LOGIN)
    if not rl_result.allowed:
        raise HTTPException(status_code=429, detail="Too many login attempts for this email", headers={"Retry-After": str(rl_result.retry_after or 60)})
    
    try:
        token = await auth_service.login(login_data, client_ip, user_agent)
        
        if token.mfa_required:
            response.set_cookie(
                key="mfa_session_id",
                value=token.session_id,
                httponly=True,
                secure=settings.SESSION_COOKIE_SECURE,
                samesite=settings.SESSION_COOKIE_SAMESITE,
                max_age=300,
            )
        
        return token
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(
    user: User = Depends(get_current_user),
):
    if user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA already enabled")
    
    setup_data = await auth_service.setup_mfa(user)
    
    return MFASetupResponse(**setup_data)


@router.post("/mfa/verify")
async def verify_mfa(
    request: MFAVerifyRequest,
    user: User = Depends(get_current_user),
):
    if user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA already enabled")
    
    success = await auth_service.verify_mfa_setup(user, request.code)
    
    if not success:
        raise HTTPException(status_code=400, detail="Invalid MFA code")
    
    return {"message": "MFA enabled successfully"}


@router.post("/mfa/disable")
async def disable_mfa(
    request: MFAVerifyRequest,
    user: User = Depends(get_current_user),
):
    if not user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA not enabled")
    
    success = await auth_service.disable_mfa(user, request.code)
    
    if not success:
        raise HTTPException(status_code=400, detail="Invalid MFA code")
    
    return {"message": "MFA disabled successfully"}


@router.post("/mfa/challenge", response_model=Token)
async def mfa_challenge(
    request: Request,
    response: Response,
    challenge: MFAVerifyRequest,
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    session_id = request.cookies.get("mfa_session_id") or challenge.session_id
    if not session_id:
        raise HTTPException(status_code=400, detail="No MFA session")
    
    try:
        session_id_int = int(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    rl_result = await rate_limiter.check_limit(f"mfa:{session_id}", settings.RATE_LIMIT_MFA)
    if not rl_result.allowed:
        raise HTTPException(status_code=429, detail="Too many MFA attempts", headers={"Retry-After": str(rl_result.retry_after or 60)})
    
    try:
        token = await auth_service.verify_mfa_challenge(
            session_id_int, challenge.code, client_ip, user_agent
        )
        response.delete_cookie("mfa_session_id")
        return token
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/mfa/backup", response_model=Token)
async def backup_code(
    request: Request,
    challenge: MFAVerifyRequest,
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    rl_result = await rate_limiter.check_limit(f"mfa:{client_ip}", settings.RATE_LIMIT_MFA)
    if not rl_result.allowed:
        raise HTTPException(status_code=429, detail="Too many attempts")
    
    from app.db.session import get_session_context
    from sqlmodel import select
    
    async with get_session_context() as session:
        stmt = select(Session).where(Session.id == int(challenge.session_id))
        result = await session.exec(stmt)
        sess = result.first()
        
        if not sess:
            raise HTTPException(status_code=400, detail="Invalid session")
        
        user_stmt = select(User).where(User.id == sess.user_id)
        user_result = await session.exec(user_stmt)
        user = user_result.first()
        
        if not user:
            raise HTTPException(status_code=400, detail="User not found")
    
    try:
        token = await auth_service.verify_backup_code(user, challenge.code, client_ip, user_agent)
        return token
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/refresh", response_model=Token)
async def refresh(
    request: Request,
    refresh_data: RefreshTokenRequest,
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    try:
        token = await auth_service.refresh_tokens(refresh_data.refresh_token, client_ip, user_agent)
        return token
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout(
    response: Response,
    session: Session = Depends(get_current_session),
    user: User = Depends(get_current_user),
):
    client_ip = "unknown"
    user_agent = "unknown"
    
    await auth_service.revoke_session(session.id, user.id, "User logout", client_ip, user_agent)
    
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all(
    request: Request,
    response: Response,
    session: Session = Depends(get_current_session),
    user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    await auth_service.revoke_all_sessions(user.id, "Logout all devices", client_ip, user_agent, session.id)
    
    return {"message": "All sessions revoked"}


@router.get("/sessions", response_model=list[SessionResponse])
async def get_sessions(
    user: User = Depends(get_current_user),
):
    sessions = await auth_service.get_user_sessions(user.id)
    return [SessionResponse.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session_by_id(
    session_id: int,
    user: User = Depends(get_current_user),
):
    sessions = await auth_service.get_user_sessions(user.id)
    sess = next((s for s in sessions if s.id == session_id), None)
    
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionDetailResponse.model_validate(sess)


@router.post("/sessions/{session_id}/revoke")
async def revoke_session_by_id(
    session_id: int,
    request: Request,
    body: UserRevokeSessionRequest = None,
    user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    reason = body.reason if body and body.reason else "User revoked session"
    
    success = await auth_service.revoke_session(
        session_id,
        user.id,
        reason,
        client_ip,
        user_agent,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Session not found or already revoked")
    return {"message": "Session revoked successfully"}


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def get_my_audit_logs(
    user: User = Depends(get_current_user),
    limit: int = 50,
):
    async with get_session_context() as session:
        stmt = (
            select(AuditLog)
            .where(AuditLog.user_id == user.id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        result = await session.exec(stmt)
        logs = list(result.all())
    return [AuditLogResponse.model_validate(l) for l in logs]



@router.post("/step-up", response_model=Token)
async def step_up(
    request: Request,
    challenge: StepUpChallengeRequest,
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    rl_result = await rate_limiter.check_limit(f"stepup:{client_ip}", settings.RATE_LIMIT_MFA)
    if not rl_result.allowed:
        raise HTTPException(status_code=429, detail="Too many step-up attempts")
    
    try:
        token = await auth_service.step_up_challenge(
            challenge.session_id,
            challenge.challenge_type,
            challenge.code,
            client_ip,
            user_agent,
        )
        return token
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/step-up/status/{session_id}", response_model=StepUpStatusResponse)
async def step_up_status(
    session_id: int,
):
    async with get_session_context() as session:
        stmt = select(Session).where(Session.id == session_id)
        result = await session.exec(stmt)
        sess = result.first()
        
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return StepUpStatusResponse(
            session_id=str(sess.id),
            status="pending" if sess.status == SessionStatus.STEP_UP_REQUIRED else "approved",
            challenge_type="unknown",
            expires_at=sess.expires_at,
        )


@router.get("/pending-approvals", response_model=list[SessionResponse])
async def get_pending_approvals(
    user: User = Depends(get_current_user),
):
    async with get_session_context() as session:
        stmt = (
            select(Session)
            .where(
                Session.user_id == user.id,
                Session.status == SessionStatus.STEP_UP_REQUIRED,
            )
            .order_by(Session.created_at.desc())
        )
        result = await session.exec(stmt)
        return list(result.all())


@router.post("/pending-approvals/{session_id}/approve")
async def approve_pending_session(
    session_id: int,
    request: Request,
    user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    async with get_session_context() as session:
        stmt = select(Session).where(
            Session.id == session_id,
            Session.user_id == user.id,
        )
        result = await session.exec(stmt)
        sess = result.first()
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        
        sess.mfa_verified = True
        sess.status = SessionStatus.ACTIVE
        sess.step_up_completed = True
        session.add(sess)
        await session.commit()
        
        await audit_logger.log(
            action="device_approved",
            description=f"Session #{sess.id} approved from trusted device",
            ip_address=client_ip,
            user_agent=user_agent,
            user_id=user.id,
        )
        return {"status": "approved", "session_id": sess.id}


@router.post("/pending-approvals/{session_id}/deny")
async def deny_pending_session(
    session_id: int,
    request: Request,
    user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    async with get_session_context() as session:
        stmt = select(Session).where(
            Session.id == session_id,
            Session.user_id == user.id,
        )
        result = await session.exec(stmt)
        sess = result.first()
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        
        sess.status = SessionStatus.BLOCKED
        sess.revoked_reason = "Denied by user from trusted device"
        session.add(sess)
        await session.commit()
        
        await audit_logger.log(
            action="device_denied",
            description=f"Session #{sess.id} blocked by user",
            ip_address=client_ip,
            user_agent=user_agent,
            user_id=user.id,
            risk_tier=RiskTier.HIGH,
        )
        return {"status": "denied", "session_id": sess.id}


@router.get("/demo-otp")
async def get_demo_otp(
    secret: Optional[str] = "JBSWY3DPEHPK3PXP",
):
    import pyotp
    import time
    sec = secret or "JBSWY3DPEHPK3PXP"
    totp = pyotp.TOTP(sec)
    now = time.time()
    seconds_remaining = 30 - int(now % 30)
    code = totp.now()
    
    from app.utils.totp import print_terminal_otp
    print_terminal_otp(
        email="Live Verification / OTP Platform",
        code=code,
        reason="Active TOTP Sync",
        seconds_remaining=seconds_remaining,
        deduplicate=True,
    )
    
    return {
        "code": code,
        "seconds_remaining": seconds_remaining,
        "secret": sec,
    }


from app.models.models import RiskTier