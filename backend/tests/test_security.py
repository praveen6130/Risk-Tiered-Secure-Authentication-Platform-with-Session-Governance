import pytest
from app.utils.security import hash_password, verify_password, create_access_token, decode_token, hash_token, generate_backup_code, hash_backup_codes, verify_backup_code


class TestPasswordHashing:
    def test_hash_password_returns_hash(self):
        hash_val = hash_password("testpassword123")
        assert hash_val.startswith("$argon2id$")
        assert len(hash_val) > 50
    
    def test_verify_correct_password(self):
        hash_val = hash_password("testpassword123")
        assert verify_password("testpassword123", hash_val) is True
    
    def test_verify_incorrect_password(self):
        hash_val = hash_password("testpassword123")
        assert verify_password("wrongpassword", hash_val) is False
    
    def test_different_hashes_for_same_password(self):
        hash1 = hash_password("testpassword123")
        hash2 = hash_password("testpassword123")
        assert hash1 != hash2
        assert verify_password("testpassword123", hash1)
        assert verify_password("testpassword123", hash2)


class TestJWT:
    def test_create_and_decode_access_token(self):
        token = create_access_token({"sub": "123", "type": "access"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "123"
        assert payload["type"] == "access"
    
    def test_expired_token_returns_none(self):
        import time
        from jose import jwt
        from app.core.config import settings
        
        payload = {"sub": "123", "exp": int(time.time()) - 100, "type": "access"}
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        assert decode_token(token) is None
    
    def test_invalid_token_returns_none(self):
        assert decode_token("invalid.token.string") is None


class TestTokenHashing:
    def test_hash_token_consistent(self):
        token = "test-token-123"
        hash1 = hash_token(token)
        hash2 = hash_token(token)
        assert hash1 == hash2
        assert len(hash1) == 64
    
    def test_different_tokens_different_hashes(self):
        assert hash_token("token1") != hash_token("token2")


class TestBackupCodes:
    def test_generate_backup_code_format(self):
        code = generate_backup_code(8)
        assert len(code) == 8
        assert code.isalnum()
        assert all(c in "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" for c in code)
    
    def test_hash_and_verify_backup_codes(self):
        codes = ["ABC123", "DEF456", "GHI789"]
        hashed = hash_backup_codes(codes)
        
        valid, remaining = verify_backup_code("ABC123", hashed)
        assert valid is True
        assert len(remaining.split("\n")) == 2
        
        valid, remaining = verify_backup_code("DEF456", remaining)
        assert valid is True
        assert len(remaining.split("\n")) == 1
        
        valid, _ = verify_backup_code("INVALID", remaining)
        assert valid is False


class TestRateLimiting:
    @pytest.mark.asyncio
    async def test_in_memory_rate_limiter(self):
        from app.utils.rate_limit import InMemoryRateLimiter
        
        limiter = InMemoryRateLimiter()
        result = await limiter.check_limit("test-key", 5, 60)
        assert result.allowed is True
        assert result.remaining == 4
        
        for _ in range(4):
            result = await limiter.check_limit("test-key", 5, 60)
            assert result.allowed is True
        
        result = await limiter.check_limit("test-key", 5, 60)
        assert result.allowed is False
        assert result.retry_after is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])