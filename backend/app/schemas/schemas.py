from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict, AliasChoices
from app.models.models import RiskTier, SessionStatus


class DeviceFingerprintBase(BaseModel):
    fingerprint: dict
    user_agent: str


class DeviceFingerprintCreate(DeviceFingerprintBase):
    pass


class DeviceFingerprintResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fingerprint_hash: str
    nickname: Optional[str]
    is_trusted: bool
    user_agent: str
    created_at: datetime
    last_seen_at: datetime


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = Field(default=None, max_length=100)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    device_fingerprint: Optional[DeviceFingerprintCreate] = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    is_superuser: bool
    mfa_enabled: bool
    created_at: datetime
    last_login_at: Optional[datetime]


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    mfa_required: bool = False
    session_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_fingerprint: Optional[DeviceFingerprintCreate] = None
    remember_device: bool = False


class MFASetupResponse(BaseModel):
    secret: str
    qr_code: str
    manual_entry_key: str
    backup_codes: list[str]


class MFAVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    session_id: Optional[str] = None


class MFAChallengeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class StepUpChallengeRequest(BaseModel):
    session_id: str
    challenge_type: Literal["totp", "email_otp", "device_approval"]
    code: Optional[str] = None


class StepUpStatusResponse(BaseModel):
    session_id: str
    status: Literal["pending", "approved", "denied", "expired"]
    challenge_type: str
    expires_at: datetime


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_fingerprint_id: Optional[int]
    ip_address: str
    user_agent: str
    country: Optional[str]
    city: Optional[str]
    risk_score: float
    risk_tier: RiskTier
    risk_factors: dict
    status: SessionStatus
    mfa_verified: bool
    step_up_completed: bool
    created_at: datetime
    last_activity_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime]
    revoked_reason: Optional[str]


class SessionDetailResponse(SessionResponse):
    device_fingerprint: Optional[DeviceFingerprintResponse] = None
    user: Optional[UserResponse] = None
    audit_logs: list["AuditLogResponse"] = []


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    description: str
    ip_address: str
    risk_score: float
    risk_tier: RiskTier
    metadata: dict = Field(default_factory=dict, validation_alias=AliasChoices("audit_metadata", "metadata"))
    created_at: datetime


class RevokeSessionRequest(BaseModel):
    session_ids: list[int]
    reason: str = "Admin revocation"


class UserRevokeSessionRequest(BaseModel):
    reason: Optional[str] = "User requested session revocation"



class RiskAssessmentResponse(BaseModel):
    risk_score: float
    risk_tier: RiskTier
    risk_factors: dict
    requires_step_up: bool
    step_up_type: Optional[str] = None


class GeoIPResponse(BaseModel):
    ip: str
    country: Optional[str] = None
    country_code: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    isp: Optional[str] = None
    org: Optional[str] = None
    asn: Optional[str] = None
    timezone: Optional[str] = None
    is_vpn: bool = False
    is_proxy: bool = False
    is_tor: bool = False


class RateLimitInfo(BaseModel):
    limit: int
    remaining: int
    reset: int


class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    redis: str