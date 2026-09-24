import asyncio
import random
import secrets
from datetime import datetime, timedelta, timezone
from faker import Faker

from app.core.config import settings
from app.db.session import engine, init_db
from app.models.models import AuditLog, DeviceFingerprint, RiskTier, Session, SessionStatus, User
from app.services.auth import auth_service
from app.utils.security import hash_password, hash_token, generate_refresh_token
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


fake = Faker()
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def fake_dt(start_date="-30d", end_date="now") -> datetime:
    return fake.date_time_between(start_date=start_date, end_date=end_date, tzinfo=timezone.utc)


async def seed_users() -> list[User]:
    users = []
    async with async_session() as session:
        for i in range(10):
            email = f"user{i+1}@example.com"
            password_hash = hash_password("Password123!")
            
            user = User(
                email=email,
                password_hash=password_hash,
                full_name=fake.name(),
                is_active=True,
                is_superuser=(i == 0),
                mfa_enabled=(i < 5),
                totp_secret="JBSWY3DPEHPK3PXP" if i < 5 else None,
                backup_codes_hash="\n".join([hash_password(f"BACKUP{i}{j}") for j in range(10)]) if i < 5 else None,
                risk_profile={
                    "typical_login_hours": list(range(8, 18)),
                    "typical_login_days": list(range(0, 5)),
                },
                created_at=fake_dt("-30d", "-1d"),
                last_login_at=fake_dt("-7d", "now"),
            )
            session.add(user)
            users.append(user)
        await session.commit()
        for u in users:
            await session.refresh(u)
    return users


async def seed_devices(users: list[User]):
    async with async_session() as session:
        for user in users:
            for j in range(random.randint(1, 3)):
                fp = {
                    "screen": {"width": 1920, "height": 1080, "colorDepth": 24},
                    "navigator": {
                        "userAgent": fake.user_agent(),
                        "language": "en-US",
                        "platform": "Win32",
                        "hardwareConcurrency": 8,
                        "deviceMemory": 8,
                    },
                    "timezone": "America/New_York",
                    "timezoneOffset": -300,
                    "canvas": fake.sha256(),
                    "webgl": fake.sha256(),
                    "fonts": ["Arial", "Helvetica", "Times New Roman"],
                }
                import hashlib
                import json
                fp_hash = hashlib.sha256(json.dumps(fp, sort_keys=True).encode()).hexdigest()[:64]
                
                device = DeviceFingerprint(
                    user_id=user.id,
                    fingerprint_hash=fp_hash,
                    raw_fingerprint=fp,
                    nickname=f"Device {j+1}",
                    is_trusted=(j == 0),
                    user_agent=fake.user_agent(),
                )
                session.add(device)
        await session.commit()


async def seed_sessions(users: list[User]):
    locations = [
        ("US", "New York", 40.7128, -74.0060),
        ("US", "San Francisco", 37.7749, -122.4194),
        ("US", "Chicago", 41.8781, -87.6298),
        ("UK", "London", 51.5074, -0.1278),
        ("DE", "Berlin", 52.5200, 13.4050),
        ("FR", "Paris", 48.8566, 2.3522),
        ("JP", "Tokyo", 35.6762, 139.6503),
        ("AU", "Sydney", -33.8688, 151.2093),
    ]
    
    risk_scenarios = [
        {"tier": RiskTier.LOW, "score": 0.1, "factors": {}},
        {"tier": RiskTier.LOW, "score": 0.2, "factors": {}},
        {"tier": RiskTier.MEDIUM, "score": 0.45, "factors": {"new_device": {"weight": 0.7}}},
        {"tier": RiskTier.MEDIUM, "score": 0.55, "factors": {"new_city": {"weight": 0.2}}},
        {"tier": RiskTier.HIGH, "score": 0.7, "factors": {"new_country": {"weight": 0.4}, "vpn_proxy": {"weight": 0.5}}},
        {"tier": RiskTier.CRITICAL, "score": 0.85, "factors": {"impossible_travel": {"weight": 0.8}}},
    ]
    
    async with async_session() as session:
        for user in users:
            for k in range(random.randint(3, 8)):
                scenario = random.choice(risk_scenarios)
                country, city, lat, lon = random.choice(locations)
                
                created = fake_dt("-30d", "now")
                last_activity = created + timedelta(minutes=random.randint(0, 1440))
                
                sess = Session(
                    user_id=user.id,
                    session_token=hash_token(secrets.token_hex(32)),
                    refresh_token_hash=hash_token(generate_refresh_token()),
                    ip_address=fake.ipv4(),
                    user_agent=fake.user_agent(),
                    country=country,
                    city=city,
                    risk_score=scenario["score"],
                    risk_tier=scenario["tier"],
                    risk_factors=scenario["factors"],
                    status=random.choice([SessionStatus.ACTIVE, SessionStatus.ACTIVE, SessionStatus.ACTIVE, SessionStatus.REVOKED, SessionStatus.EXPIRED]),
                    mfa_verified=(scenario["tier"] != RiskTier.CRITICAL),
                    step_up_completed=(scenario["tier"] in (RiskTier.HIGH, RiskTier.CRITICAL)),
                    created_at=created,
                    last_activity_at=last_activity,
                    expires_at=datetime.now(timezone.utc) + timedelta(days=7),
                    revoked_at=fake_dt(start_date=created, end_date="now") if random.random() < 0.1 else None,
                )
                session.add(sess)
        await session.commit()


async def seed_audit_logs(users: list[User]):
    actions = [
        "login_success", "login_failed", "mfa_setup", "mfa_verify", "mfa_failed",
        "step_up_success", "step_up_failed", "session_created", "session_revoked",
        "register", "logout", "logout_all", "device_trusted", "device_removed",
    ]
    
    async with async_session() as session:
        for user in users:
            for _ in range(random.randint(10, 30)):
                action = random.choice(actions)
                created = fake_dt("-30d", "now")
                
                log = AuditLog(
                    user_id=user.id,
                    session_id=None,
                    action=action,
                    description=f"{action.replace('_', ' ').title()}",
                    ip_address=fake.ipv4(),
                    user_agent=fake.user_agent(),
                    risk_score=random.uniform(0, 1),
                    risk_tier=random.choice(list(RiskTier)),
                    audit_metadata={},
                    created_at=created,
                )
                session.add(log)
        await session.commit()


async def main():
    print("Initializing database...")
    await init_db()
    
    from sqlalchemy import delete
    async with async_session() as session:
        await session.exec(delete(AuditLog))
        await session.exec(delete(Session))
        await session.exec(delete(DeviceFingerprint))
        await session.exec(delete(User))
        await session.commit()
    
    print("Seeding users...")
    users = await seed_users()
    print(f"Created {len(users)} users")
    
    print("Seeding devices...")
    await seed_devices(users)
    print("Devices created")
    
    print("Seeding sessions...")
    await seed_sessions(users)
    print("Sessions created")
    
    print("Seeding audit logs...")
    await seed_audit_logs(users)
    print("Audit logs created")
    
    print("\n=== Demo Accounts ===")
    print("Admin: user1@example.com / Password123! (MFA enabled)")
    print("Users: user2-10@example.com / Password123! (MFA on users 2-5)")
    print("\n=== Risk Scenarios ===")
    print("user1: Low risk sessions")
    print("user2: Medium risk (new device)")
    print("user3: High risk (VPN + new country)")
    print("user4: Critical risk (impossible travel)")
    print("user5: Mixed sessions")
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())