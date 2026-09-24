import base64
import io
import pyotp
import qrcode
from typing import Optional

from app.core.config import settings
from app.utils.security import hash_password, verify_password


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name=settings.TOTP_ISSUER,
    )


def generate_qr_code(uri: str) -> str:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=window)


def encrypt_secret(secret: str, key: str) -> str:
    from cryptography.fernet import Fernet
    f = Fernet(key.encode()[:32].ljust(32, b'='))
    return f.encrypt(secret.encode()).decode()


def decrypt_secret(encrypted: str, key: str) -> str:
    from cryptography.fernet import Fernet
    f = Fernet(key.encode()[:32].ljust(32, b'='))
    return f.decrypt(encrypted.encode()).decode()


class TOTPManager:
    def __init__(self, secret: Optional[str] = None):
        self.secret = secret or generate_totp_secret()
        self.totp = pyotp.TOTP(self.secret, interval=30, digits=6)
    
    def get_secret(self) -> str:
        return self.secret
    
    def get_uri(self, email: str) -> str:
        return self.totp.provisioning_uri(name=email, issuer_name=settings.TOTP_ISSUER)
    
    def get_qr_code(self, email: str) -> str:
        return generate_qr_code(self.get_uri(email))
    
    def verify(self, code: str, window: int = None) -> bool:
        return self.totp.verify(code, valid_window=window or settings.TOTP_WINDOW)
    
    def current_code(self) -> str:
        return self.totp.now()
    
    def time_remaining(self) -> int:
        return 30 - (int(__import__('time').time()) % 30)