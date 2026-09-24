import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import init_db
from app.models.models import User
from app.utils.security import hash_password


import uuid
from app.utils.rate_limit import rate_limiter


@pytest.fixture(autouse=True)
async def reset_rate_limits():
    await rate_limiter.reset_all()
    yield
    await rate_limiter.reset_all()


@pytest.fixture(scope="session", autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_user():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        password = "TestPass123!"
        await ac.post("/api/v1/auth/register", json={"email": email, "password": password})
        return email, password


class TestAuthFlow:
    @pytest.mark.asyncio
    async def test_register_user(self, client):
        email = f"newuser_{uuid.uuid4().hex[:8]}@example.com"
        response = await client.post("/api/v1/auth/register", json={
            "email": email,
            "password": "SecurePass123!",
            "full_name": "Test User"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == email
        assert data["full_name"] == "Test User"
        assert data["mfa_enabled"] is False
    
    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client, test_user):
        email, password = test_user
        response = await client.post("/api/v1/auth/register", json={
            "email": email,
            "password": password
        })
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()
    
    @pytest.mark.asyncio
    async def test_login_success(self, client, test_user):
        email, password = test_user
        response = await client.post("/api/v1/auth/login", json={
            "email": email,
            "password": password
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["mfa_required"] is False
    
    @pytest.mark.asyncio
    async def test_login_invalid_password(self, client, test_user):
        email, _ = test_user
        response = await client.post("/api/v1/auth/login", json={
            "email": email,
            "password": "WrongPassword123!"
        })
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client):
        response = await client.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "Password123!"
        })
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_refresh_token(self, client, test_user):
        email, password = test_user
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": password
        })
        refresh_token = login_resp.json()["refresh_token"]
        
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["refresh_token"] != refresh_token  # Rotated
    
    @pytest.mark.asyncio
    async def test_refresh_token_reuse_detected(self, client, test_user):
        email, password = test_user
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": password
        })
        refresh_token = login_resp.json()["refresh_token"]
        
        # First refresh
        await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        
        # Reuse should fail
        response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert response.status_code == 401


class TestMFA:
    @pytest.mark.asyncio
    async def test_mfa_setup(self, client, test_user):
        email, password = test_user
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": password
        })
        token = login_resp.json()["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.post("/api/v1/auth/mfa/setup", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "secret" in data
        assert "qr_code" in data
        assert "manual_entry_key" in data
        assert "backup_codes" in data
        assert len(data["backup_codes"]) == 10
    
    @pytest.mark.asyncio
    async def test_mfa_verify(self, client, test_user):
        email, password = test_user
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": password
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        setup_resp = await client.post("/api/v1/auth/mfa/setup", headers=headers)
        secret = setup_resp.json()["secret"]
        
        import pyotp
        code = pyotp.TOTP(secret).now()
        
        response = await client.post("/api/v1/auth/mfa/verify", json={"code": code}, headers=headers)
        assert response.status_code == 200
        
        # Verify MFA is now required for login
        await client.post("/api/v1/auth/logout", headers=headers)
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": password
        })
        assert login_resp.json()["mfa_required"] is True


class TestRateLimiting:
    @pytest.mark.asyncio
    async def test_login_rate_limit(self, client):
        for i in range(12):
            response = await client.post("/api/v1/auth/login", json={
                "email": f"ratelimit{i}@example.com",
                "password": "Password123!"
            })
        
        # Should be rate limited after 10 attempts
        assert response.status_code == 429
        assert "rate limit" in response.json()["detail"].lower()
    
    @pytest.mark.asyncio
    async def test_register_rate_limit(self, client):
        for i in range(7):
            response = await client.post("/api/v1/auth/register", json={
                "email": f"ratelimit_reg{i}@example.com",
                "password": "Password123!"
            })
        
        assert response.status_code == 429


class TestSessions:
    @pytest.mark.asyncio
    async def test_list_sessions(self, client, test_user):
        email, password = test_user
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": password
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = await client.get("/api/v1/auth/sessions", headers=headers)
        assert response.status_code == 200
        sessions = response.json()
        assert len(sessions) >= 1
        assert sessions[0]["status"] == "active"
    
    @pytest.mark.asyncio
    async def test_revoke_session(self, client, test_user):
        email, password = test_user
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": password
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        sessions_resp = await client.get("/api/v1/auth/sessions", headers=headers)
        session_id = sessions_resp.json()[0]["id"]
        response = await client.post("/api/v1/auth/logout", headers=headers)
        assert response.status_code == 200
        
        # Revoked session token should be rejected immediately
        rejected_resp = await client.get("/api/v1/auth/sessions", headers=headers)
        assert rejected_resp.status_code == 401
        
        # Login again to inspect sessions list
        login2_resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
        token2 = login2_resp.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}
        
        sessions_resp = await client.get("/api/v1/auth/sessions", headers=headers2)
        assert sessions_resp.status_code == 200
        revoked_sess = next((s for s in sessions_resp.json() if s["id"] == session_id), None)
        assert revoked_sess is not None
        assert revoked_sess["status"] == "revoked"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])