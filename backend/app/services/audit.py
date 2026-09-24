from datetime import datetime
from typing import Optional

from app.models.models import AuditLog, RiskTier, User, Session
from app.db.session import get_session_context
from sqlmodel import select


class AuditLogger:
    async def log(
        self,
        action: str,
        description: str,
        ip_address: str,
        user_agent: str,
        user_id: Optional[int] = None,
        session_id: Optional[int] = None,
        risk_score: float = 0.0,
        risk_tier: RiskTier = RiskTier.LOW,
        metadata: Optional[dict] = None,
    ) -> AuditLog:
        async with get_session_context() as session:
            log = AuditLog(
                user_id=user_id,
                session_id=session_id,
                action=action,
                description=description,
                ip_address=ip_address,
                user_agent=user_agent,
                risk_score=risk_score,
                risk_tier=risk_tier,
                metadata=metadata or {},
                created_at=datetime.utcnow(),
            )
            session.add(log)
            await session.commit()
            await session.refresh(log)
            return log
    
    async def log_login_success(
        self,
        user: User,
        session: Session,
        ip: str,
        user_agent: str,
        risk_score: float,
        risk_tier: RiskTier,
        mfa_used: bool = False,
    ):
        await self.log(
            action="login_success",
            description=f"Successful login{' with MFA' if mfa_used else ''}",
            ip_address=ip,
            user_agent=user_agent,
            user_id=user.id,
            session_id=session.id,
            risk_score=risk_score,
            risk_tier=risk_tier,
            metadata={"mfa_used": mfa_used},
        )
    
    async def log_login_failed(
        self,
        email: str,
        ip: str,
        user_agent: str,
        reason: str,
        user_id: Optional[int] = None,
    ):
        await self.log(
            action="login_failed",
            description=f"Failed login: {reason}",
            ip_address=ip,
            user_agent=user_agent,
            user_id=user_id,
            risk_score=0.5,
            risk_tier=RiskTier.MEDIUM,
            metadata={"email": email, "reason": reason},
        )
    
    async def log_mfa_setup(self, user: User, ip: str, user_agent: str):
        await self.log(
            action="mfa_setup",
            description="MFA enabled",
            ip_address=ip,
            user_agent=user_agent,
            user_id=user.id,
        )
    
    async def log_mfa_verify(self, user: User, session: Session, ip: str, user_agent: str, success: bool):
        await self.log(
            action="mfa_verify" if success else "mfa_failed",
            description="MFA verification " + ("succeeded" if success else "failed"),
            ip_address=ip,
            user_agent=user_agent,
            user_id=user.id,
            session_id=session.id,
            risk_score=0.3 if success else 0.6,
            risk_tier=RiskTier.LOW if success else RiskTier.MEDIUM,
        )
    
    async def log_step_up(
        self,
        user: User,
        session: Session,
        ip: str,
        user_agent: str,
        challenge_type: str,
        success: bool,
    ):
        await self.log(
            action="step_up" + ("_success" if success else "_failed"),
            description=f"Step-up challenge ({challenge_type}) " + ("passed" if success else "failed"),
            ip_address=ip,
            user_agent=user_agent,
            user_id=user.id,
            session_id=session.id,
            risk_score=0.4 if success else 0.7,
            risk_tier=RiskTier.LOW if success else RiskTier.HIGH,
            metadata={"challenge_type": challenge_type},
        )
    
    async def log_session_revoked(
        self,
        user: User,
        session: Session,
        ip: str,
        user_agent: str,
        reason: str,
        revoked_by: Optional[int] = None,
    ):
        await self.log(
            action="session_revoked",
            description=f"Session revoked: {reason}",
            ip_address=ip,
            user_agent=user_agent,
            user_id=user.id,
            session_id=session.id,
            risk_score=0.3,
            risk_tier=RiskTier.LOW,
            metadata={"reason": reason, "revoked_by": revoked_by},
        )
    
    async def log_session_created(self, user: User, session: Session, ip: str, user_agent: str):
        await self.log(
            action="session_created",
            description="New session created",
            ip_address=ip,
            user_agent=user_agent,
            user_id=user.id,
            session_id=session.id,
        )
    
    async def get_user_logs(
        self,
        user_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        async with get_session_context() as session:
            stmt = select(AuditLog).where(
                AuditLog.user_id == user_id
            ).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
            result = await session.exec(stmt)
            return list(result.all())
    
    async def get_all_logs(
        self,
        limit: int = 100,
        offset: int = 0,
        action: Optional[str] = None,
        risk_tier: Optional[RiskTier] = None,
    ) -> list[AuditLog]:
        async with get_session_context() as session:
            stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
            if action:
                stmt = stmt.where(AuditLog.action == action)
            if risk_tier:
                stmt = stmt.where(AuditLog.risk_tier == risk_tier)
            stmt = stmt.limit(limit).offset(offset)
            result = await session.exec(stmt)
            return list(result.all())


audit_logger = AuditLogger()