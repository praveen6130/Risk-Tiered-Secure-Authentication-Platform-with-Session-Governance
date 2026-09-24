import pytest
from app.utils.totp import TOTPManager, verify_totp, generate_totp_secret


class TestTOTP:
    def test_generate_secret(self):
        secret = generate_totp_secret()
        assert len(secret) == 32
        assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in secret)
    
    def test_totp_manager_creation(self):
        secret = generate_totp_secret()
        manager = TOTPManager(secret)
        assert manager.get_secret() == secret
    
    def test_verify_valid_code(self):
        secret = "JBSWY3DPEHPK3PXP"
        manager = TOTPManager(secret)
        code = manager.current_code()
        assert verify_totp(secret, code) is True
        assert manager.verify(code) is True
    
    def test_verify_invalid_code(self):
        secret = "JBSWY3DPEHPK3PXP"
        assert verify_totp(secret, "000000") is False
    
    def test_time_remaining(self):
        manager = TOTPManager()
        remaining = manager.time_remaining()
        assert 0 <= remaining <= 30
    
    def test_window_tolerance(self):
        secret = "JBSWY3DPEHPK3PXP"
        manager = TOTPManager(secret)
        code = manager.current_code()
        # Should work with window=1 (previous/next 30s)
        assert manager.verify(code, window=1) is True


class TestRiskEngine:
    @pytest.mark.asyncio
    async def test_low_risk_known_device(self):
        from app.services.risk_engine import risk_engine
        from app.models.models import User, RiskTier
        from datetime import datetime
        
        user = User(
            id=1,
            email="test@example.com",
            password_hash="hash",
            risk_profile={
                "typical_login_hours": [9, 10, 11, 14, 15],
                "typical_login_days": [0, 1, 2, 3, 4],
            }
        )
        
        # Mock known trusted device
        result = await risk_engine.assess_login_risk(
            user=user,
            ip="192.168.1.1",
            user_agent="Mozilla/5.0",
            device_fingerprint={"test": "known"},
        )
        
        assert result.risk_tier == RiskTier.LOW
        assert result.requires_step_up is False
    
    @pytest.mark.asyncio
    async def test_high_risk_new_country(self):
        from app.services.risk_engine import risk_engine
        from app.models.models import User, RiskTier
        
        user = User(
            id=1,
            email="test@example.com",
            password_hash="hash",
            risk_profile={
                "typical_login_hours": list(range(24)),
                "typical_login_days": list(range(7)),
            }
        )
        
        # Mock last session from different country
        from unittest.mock import AsyncMock, patch
        with patch.object(risk_engine, '_get_last_successful_session') as mock:
            mock.return_value = type('obj', (object,), {
                'country': 'US',
                'city': 'New York',
                'ip_address': '1.1.1.1',
                'last_activity_at': datetime.utcnow(),
            })()
            
            from app.schemas.schemas import GeoIPResponse
            geo = GeoIPResponse(
                ip="2.2.2.2",
                country="UK",
                country_code="GB",
                city="London",
                region="England",
                latitude=51.5,
                longitude=-0.1,
                isp="Test ISP",
                org="Test Org",
                asn="AS123",
                timezone="Europe/London",
            )
            
            result = await risk_engine.assess_login_risk(
                user=user,
                ip="2.2.2.2",
                user_agent="Mozilla/5.0",
                device_fingerprint={"test": "new"},
                geo=geo,
            )
            
            assert result.risk_score >= 0.4  # New country weight
            assert "new_country" in result.risk_factors


if __name__ == "__main__":
    pytest.main([__file__, "-v"])