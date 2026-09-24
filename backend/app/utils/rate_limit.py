import time
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

import redis.asyncio as redis

from app.core.config import settings


@dataclass
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    reset: int
    retry_after: Optional[int] = None


class RateLimiterBackend(ABC):
    @abstractmethod
    async def check_limit(self, key: str, limit: int, window: int) -> RateLimitResult:
        pass

    @abstractmethod
    async def reset(self, key: str) -> None:
        pass


class InMemoryRateLimiter(RateLimiterBackend):
    def __init__(self):
        self.buckets: dict[str, dict] = defaultdict(lambda: {"count": 0, "window_start": 0})

    async def check_limit(self, key: str, limit: int, window: int) -> RateLimitResult:
        now = time.time()
        bucket = self.buckets[key]
        
        if now - bucket["window_start"] >= window:
            bucket["count"] = 0
            bucket["window_start"] = now
        
        bucket["count"] += 1
        remaining = max(0, limit - bucket["count"])
        reset = int(bucket["window_start"] + window)
        
        return RateLimitResult(
            allowed=bucket["count"] <= limit,
            limit=limit,
            remaining=remaining,
            reset=reset,
            retry_after=window if bucket["count"] > limit else None,
        )

    async def reset(self, key: str) -> None:
        if key in self.buckets:
            del self.buckets[key]

    async def reset_all(self) -> None:
        self.buckets.clear()


class RedisRateLimiter(RateLimiterBackend):
    def __init__(self, redis_url: str):
        self.client = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)

    async def check_limit(self, key: str, limit: int, window: int) -> RateLimitResult:
        now = time.time()
        window_start = int(now // window) * window
        redis_key = f"ratelimit:{key}:{window_start}"
        
        pipe = self.client.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, window + 1)
        results = await pipe.execute()
        
        count = results[0]
        remaining = max(0, limit - count)
        reset = window_start + window
        
        return RateLimitResult(
            allowed=count <= limit,
            limit=limit,
            remaining=remaining,
            reset=reset,
            retry_after=window if count > limit else None,
        )

    async def reset(self, key: str) -> None:
        pattern = f"ratelimit:{key}:*"
        keys = await self.client.keys(pattern)
        if keys:
            await self.client.delete(*keys)

    async def close(self):
        await self.client.close()


class RateLimiter:
    def __init__(self):
        self._backend: Optional[RateLimiterBackend] = None
        self._memory_backend = InMemoryRateLimiter()
        self._redis_backend: Optional[RedisRateLimiter] = None

    async def initialize(self):
        if settings.REDIS_URL:
            try:
                self._redis_backend = RedisRateLimiter(settings.REDIS_URL)
                await self._redis_backend.check_limit("test", 1, 1)
                self._backend = self._redis_backend
            except Exception:
                self._backend = self._memory_backend
        else:
            self._backend = self._memory_backend

    def _parse_limit(self, limit_str: str) -> tuple[int, int]:
        if "/" not in limit_str:
            return int(limit_str), 60
        limit, period = limit_str.split("/")
        limit = int(limit)
        if period == "second":
            window = 1
        elif period == "minute":
            window = 60
        elif period == "hour":
            window = 3600
        elif period == "day":
            window = 86400
        else:
            window = 60
        return limit, window

    async def check_limit(self, key: str, limit_str: str = None) -> RateLimitResult:
        if not settings.RATE_LIMIT_ENABLED:
            return RateLimitResult(allowed=True, limit=999999, remaining=999999, reset=int(time.time()) + 60)
        
        limit_str = limit_str or settings.RATE_LIMIT_DEFAULT
        limit, window = self._parse_limit(limit_str)
        
        if self._backend is None:
            await self.initialize()
        
        return await self._backend.check_limit(key, limit, window)

    async def reset(self, key: str):
        if self._backend:
            await self._backend.reset(key)

    async def reset_all(self):
        if self._backend:
            if hasattr(self._backend, "reset_all"):
                await self._backend.reset_all()


rate_limiter = RateLimiter()