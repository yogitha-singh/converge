from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    status_report = {"status": "ok", "database": "unknown", "redis": "unknown"}

    try:
        await db.execute(text("SELECT 1"))
        status_report["database"] = "ok"
    except Exception:
        status_report["database"] = "unreachable"
        status_report["status"] = "degraded"

    try:
        redis = get_redis()
        await redis.ping()
        status_report["redis"] = "ok"
    except Exception:
        status_report["redis"] = "unreachable"
        status_report["status"] = "degraded"

    return status_report
