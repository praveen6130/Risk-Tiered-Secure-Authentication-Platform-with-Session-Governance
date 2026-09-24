import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import init_db, engine
from app.models.models import User, Session, DeviceFingerprint, AuditLog, RiskTier, SessionStatus
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
async def setup_database():
    await init_db()
    yield
    await engine.dispose()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def clean_db():
    async with AsyncSession(engine) as session:
        await session.execute(delete(AuditLog))
        await session.execute(delete(Session))
        await session.execute(delete(DeviceFingerprint))
        await session.execute(delete(User))
        await session.commit()
    yield
    async with AsyncSession(engine) as session:
        await session.execute(delete(AuditLog))
        await session.execute(delete(Session))
        await session.execute(delete(DeviceFingerprint))
        await session.execute(delete(User))
        await session.commit()


@pytest.fixture
async def test_user(client, clean_db):
    email = "test_user@example.com"
    password = "TestPass123!"
    response = await client.post("/api/v1/auth/register", json={
        "email": email, "password": password, "full_name": "Test User"
    })
    assert response.status_code == 201
    return email, password


@pytest.fixture
async def authenticated_client(client, test_user):
    email, password = test_user
    response = await client.post("/api/v1/auth/login", json={
        "email": email, "password": password
    })
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.fixture
async def admin_user(client, clean_db):
    email = "admin@example.com"
    password = "AdminPass123!"
    response = await client.post("/api/v1/auth/register", json={
        "email": email, "password": password, "full_name": "Admin User"
    })
    assert response.status_code == 201
    
    # Manually set as superuser in DB
    from app.db.session import get_session_context
    from sqlmodel import select
    async with get_session_context() as session:
        stmt = select(User).where(User.email == email)
        result = await session.exec(stmt)
        user = result.first()
        user.is_superuser = True
        session.add(user)
        await session.commit()
    
    return email, password


@pytest.fixture
async def admin_client(client, admin_user):
    email, password = admin_user
    response = await client.post("/api/v1/auth/login", json={
        "email": email, "password": password
    })
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client