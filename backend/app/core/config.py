import secrets
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_NAME: str = "HTH-CS-02 Auth Platform"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./auth.db"
    DATABASE_ECHO: bool = False

    # Security
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    ENCRYPTION_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Password hashing (Argon2id)
    ARGON2_MEMORY_COST: int = 65536
    ARGON2_TIME_COST: int = 3
    ARGON2_PARALLELISM: int = 4

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    REDIS_URL: Optional[str] = None
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_REGISTER: str = "5/minute"
    RATE_LIMIT_MFA: str = "5/minute"

    # TOTP MFA
    TOTP_ISSUER: str = "HTH-CS-02"
    TOTP_WINDOW: int = 1
    BACKUP_CODES_COUNT: int = 10
    BACKUP_CODE_LENGTH: int = 8

    # Risk Engine
    RISK_ENABLED: bool = True
    RISK_LOW_THRESHOLD: float = 0.3
    RISK_MEDIUM_THRESHOLD: float = 0.6
    RISK_HIGH_THRESHOLD: float = 0.8

    # Risk weights
    RISK_NEW_DEVICE_WEIGHT: float = 0.4
    RISK_NEW_COUNTRY_WEIGHT: float = 0.4
    RISK_NEW_CITY_WEIGHT: float = 0.2
    RISK_VPN_PROXY_WEIGHT: float = 0.5
    RISK_IMPOSSIBLE_TRAVEL_WEIGHT: float = 0.8
    RISK_UNUSUAL_HOUR_WEIGHT: float = 0.3
    RISK_UNUSUAL_DAY_WEIGHT: float = 0.2
    RISK_VELOCITY_WEIGHT: float = 0.5
    RISK_FAILED_STREAK_WEIGHT: float = 0.6

    # Geo IP
    GEO_IP_API_URL: str = "https://ipapi.co"
    GEO_IP_CACHE_TTL: int = 86400

    # Email (mock for demo)
    EMAIL_ENABLED: bool = False
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: str = "noreply@auth-platform.local"

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Session
    SESSION_COOKIE_NAME: str = "session_id"
    SESSION_COOKIE_SECURE: bool = False
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "lax"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()