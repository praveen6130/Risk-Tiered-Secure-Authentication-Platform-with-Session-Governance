import enum
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, DateTime, Index
import sqlalchemy as sa


class RiskTier(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SessionStatus(str, enum.Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"
    STEP_UP_REQUIRED = "step_up_required"
    BLOCKED = "blocked"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    password_hash: str = Field(max_length=255)
    full_name: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    mfa_enabled: bool = Field(default=False)
    totp_secret: Optional[str] = Field(default=None, max_length=32)
    backup_codes_hash: Optional[str] = Field(default=None, max_length=1000)
    risk_profile: dict = Field(default_factory=dict, sa_column=Column(sa.JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow))
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow))
    last_login_at: Optional[datetime] = Field(default=None)

    sessions: list["Session"] = Relationship(back_populates="user")
    devices: list["DeviceFingerprint"] = Relationship(back_populates="user")
    audit_logs: list["AuditLog"] = Relationship(back_populates="user")


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    session_token: str = Field(unique=True, index=True, max_length=255)
    refresh_token_hash: str = Field(max_length=255)
    device_fingerprint_id: Optional[int] = Field(default=None, foreign_key="device_fingerprints.id")
    ip_address: str = Field(max_length=45)
    user_agent: str = Field(max_length=500)
    country: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    risk_score: float = Field(default=0.0)
    risk_tier: RiskTier = Field(default=RiskTier.LOW)
    risk_factors: dict = Field(default_factory=dict, sa_column=Column(sa.JSON))
    status: SessionStatus = Field(default=SessionStatus.ACTIVE)
    mfa_verified: bool = Field(default=False)
    step_up_completed: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow))
    last_activity_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow))
    expires_at: datetime = Field(sa_column=Column(DateTime))
    revoked_at: Optional[datetime] = Field(default=None)
    revoked_reason: Optional[str] = Field(default=None, max_length=255)

    user: Optional[User] = Relationship(back_populates="sessions")
    device_fingerprint: Optional["DeviceFingerprint"] = Relationship(back_populates="sessions")

    __table_args__ = (
        Index("ix_sessions_user_status", "user_id", "status"),
        Index("ix_sessions_expires", "expires_at"),
    )


class DeviceFingerprint(SQLModel, table=True):
    __tablename__ = "device_fingerprints"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    fingerprint_hash: str = Field(index=True, max_length=64)
    raw_fingerprint: dict = Field(default_factory=dict, sa_column=Column(sa.JSON))
    nickname: Optional[str] = Field(default=None, max_length=100)
    is_trusted: bool = Field(default=False)
    user_agent: str = Field(max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow))
    last_seen_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow))

    user: Optional[User] = Relationship(back_populates="devices")
    sessions: list[Session] = Relationship(back_populates="device_fingerprint")


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="sessions.id", index=True)
    action: str = Field(max_length=100, index=True)
    description: str = Field(max_length=500)
    ip_address: str = Field(max_length=45)
    user_agent: str = Field(max_length=500)
    risk_score: float = Field(default=0.0)
    risk_tier: RiskTier = Field(default=RiskTier.LOW)
    metadata: dict = Field(default_factory=dict, sa_column=Column(sa.JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow))

    user: Optional[User] = Relationship(back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_logs_user_created", "user_id", "created_at"),
        Index("ix_audit_logs_action_created", "action", "created_at"),
    )


class RateLimitBucket(SQLModel, table=True):
    __tablename__ = "rate_limit_buckets"

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True, max_length=255)
    count: int = Field(default=0)
    window_start: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, default=datetime.utcnow))
    window_end: datetime = Field(sa_column=Column(DateTime))