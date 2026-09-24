import hashlib
import json
from typing import Optional

from app.models.models import DeviceFingerprint
from app.db.session import get_session_context
from sqlmodel import select


def hash_fingerprint(fp: dict) -> str:
    canonical = json.dumps(fp, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:64]


def parse_fingerprint(fp: dict) -> dict:
    return {
        "screen": fp.get("screen", {}),
        "navigator": {
            "userAgent": fp.get("navigator", {}).get("userAgent"),
            "language": fp.get("navigator", {}).get("language"),
            "languages": fp.get("navigator", {}).get("languages"),
            "platform": fp.get("navigator", {}).get("platform"),
            "hardwareConcurrency": fp.get("navigator", {}).get("hardwareConcurrency"),
            "deviceMemory": fp.get("navigator", {}).get("deviceMemory"),
            "maxTouchPoints": fp.get("navigator", {}).get("maxTouchPoints"),
        },
        "timezone": fp.get("timezone"),
        "timezoneOffset": fp.get("timezoneOffset"),
        "canvas": fp.get("canvas"),
        "webgl": fp.get("webgl"),
        "fonts": fp.get("fonts", []),
        "audio": fp.get("audio"),
        "battery": fp.get("battery"),
    }


async def get_or_create_device(
    user_id: int,
    fingerprint: dict,
    user_agent: str,
    nickname: Optional[str] = None,
) -> DeviceFingerprint:
    fp_hash = hash_fingerprint(fingerprint)
    
    async with get_session_context() as session:
        stmt = select(DeviceFingerprint).where(
            DeviceFingerprint.user_id == user_id,
            DeviceFingerprint.fingerprint_hash == fp_hash,
        )
        result = await session.exec(stmt)
        device = result.first()
        
        if device:
            device.last_seen_at = __import__('datetime').datetime.utcnow()
            device.user_agent = user_agent
            if nickname and not device.nickname:
                device.nickname = nickname
            session.add(device)
            await session.commit()
            await session.refresh(device)
            return device
        
        device = DeviceFingerprint(
            user_id=user_id,
            fingerprint_hash=fp_hash,
            raw_fingerprint=fingerprint,
            nickname=nickname,
            is_trusted=False,
            user_agent=user_agent,
        )
        session.add(device)
        await session.commit()
        await session.refresh(device)
        return device


async def get_user_devices(user_id: int) -> list[DeviceFingerprint]:
    async with get_session_context() as session:
        stmt = select(DeviceFingerprint).where(DeviceFingerprint.user_id == user_id)
        result = await session.exec(stmt)
        return list(result.all())


async def is_known_device(user_id: int, fingerprint: dict) -> tuple[bool, Optional[DeviceFingerprint]]:
    fp_hash = hash_fingerprint(fingerprint)
    async with get_session_context() as session:
        stmt = select(DeviceFingerprint).where(
            DeviceFingerprint.user_id == user_id,
            DeviceFingerprint.fingerprint_hash == fp_hash,
        )
        result = await session.exec(stmt)
        device = result.first()
        return device is not None, device


async def is_trusted_device(user_id: int, fingerprint: dict) -> bool:
    _, device = await is_known_device(user_id, fingerprint)
    return device is not None and device.is_trusted