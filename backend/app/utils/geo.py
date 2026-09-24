import httpx
import json
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings
from app.schemas.schemas import GeoIPResponse


_geo_cache: dict[str, tuple[GeoIPResponse, datetime]] = {}


async def get_geo_ip(ip: str) -> GeoIPResponse:
    if ip in ("127.0.0.1", "::1", "localhost"):
        return GeoIPResponse(
            ip=ip,
            country="Local",
            country_code="LO",
            city="Localhost",
            region="Local",
            latitude=0.0,
            longitude=0.0,
            isp="Local",
            org="Local",
            asn="AS0",
            timezone="UTC",
            is_vpn=False,
            is_proxy=False,
            is_tor=False,
        )
    
    now = datetime.utcnow()
    if ip in _geo_cache:
        cached, cached_at = _geo_cache[ip]
        if now - cached_at < timedelta(seconds=settings.GEO_IP_CACHE_TTL):
            return cached
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.GEO_IP_API_URL}/{ip}/json/")
            if response.status_code == 200:
                data = response.json()
                geo = GeoIPResponse(
                    ip=ip,
                    country=data.get("country_name"),
                    country_code=data.get("country_code"),
                    city=data.get("city"),
                    region=data.get("region"),
                    latitude=data.get("latitude"),
                    longitude=data.get("longitude"),
                    isp=data.get("org"),
                    org=data.get("org"),
                    asn=data.get("asn"),
                    timezone=data.get("timezone"),
                    is_vpn=data.get("vpn", False) or data.get("proxy", False),
                    is_proxy=data.get("proxy", False),
                    is_tor=data.get("tor", False),
                )
                _geo_cache[ip] = (geo, now)
                return geo
    except Exception:
        pass
    
    return GeoIPResponse(
        ip=ip,
        country="Unknown",
        country_code="XX",
        city="Unknown",
        region="Unknown",
        latitude=0.0,
        longitude=0.0,
        isp="Unknown",
        org="Unknown",
        asn="AS0",
        timezone="UTC",
        is_vpn=False,
        is_proxy=False,
        is_tor=False,
    )


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


def is_impossible_travel(
    last_login: datetime,
    last_ip: str,
    current_ip: str,
    last_geo: GeoIPResponse,
    current_geo: GeoIPResponse,
) -> bool:
    if not last_login:
        return False
    
    time_diff_hours = (datetime.utcnow() - last_login).total_seconds() / 3600
    if time_diff_hours <= 0:
        return False
    
    if last_geo.latitude and last_geo.longitude and current_geo.latitude and current_geo.longitude:
        distance = calculate_distance(
            last_geo.latitude, last_geo.longitude,
            current_geo.latitude, current_geo.longitude
        )
        max_speed = 900
        max_distance = max_speed * time_diff_hours
        return distance > max_distance
    
    return False