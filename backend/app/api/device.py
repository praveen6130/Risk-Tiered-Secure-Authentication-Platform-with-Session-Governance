from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select

from app.api.auth import get_current_user
from app.db.session import get_session
from app.models.models import DeviceFingerprint, User
from app.schemas.schemas import DeviceFingerprintCreate, DeviceFingerprintResponse
from app.utils.device import get_or_create_device, get_user_devices, hash_fingerprint, parse_fingerprint


router = APIRouter(prefix="/device", tags=["Device"])


@router.post("/fingerprint", response_model=DeviceFingerprintResponse)
async def register_fingerprint(
    request: Request,
    fingerprint_data: DeviceFingerprintCreate,
    user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    parsed_fp = parse_fingerprint(fingerprint_data.fingerprint)
    
    device = await get_or_create_device(user.id, parsed_fp, user_agent)
    
    return DeviceFingerprintResponse.model_validate(device)


@router.get("/fingerprints", response_model=list[DeviceFingerprintResponse])
async def list_fingerprints(
    user: User = Depends(get_current_user),
):
    devices = await get_user_devices(user.id)
    return [DeviceFingerprintResponse.model_validate(d) for d in devices]


@router.post("/fingerprints/{device_id}/trust")
async def trust_device(
    device_id: int,
    user: User = Depends(get_current_user),
):
    async with get_session() as session:
        stmt = select(DeviceFingerprint).where(
            DeviceFingerprint.id == device_id,
            DeviceFingerprint.user_id == user.id,
        )
        result = await session.exec(stmt)
        device = result.first()
        
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        device.is_trusted = True
        session.add(device)
        await session.commit()
        await session.refresh(device)
    
    return {"message": "Device marked as trusted"}


@router.delete("/fingerprints/{device_id}")
async def remove_device(
    device_id: int,
    user: User = Depends(get_current_user),
):
    async with get_session() as session:
        stmt = select(DeviceFingerprint).where(
            DeviceFingerprint.id == device_id,
            DeviceFingerprint.user_id == user.id,
        )
        result = await session.exec(stmt)
        device = result.first()
        
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        await session.delete(device)
        await session.commit()
    
    return {"message": "Device removed"}