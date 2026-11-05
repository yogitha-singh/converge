import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationOut
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = NotificationService(db)
    return await service.list_for_user(current_user.id, unread_only=unread_only)


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != current_user.id:
        # 404 either way -- don't confirm existence of another user's notification.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    service = NotificationService(db)
    updated = await service.mark_read(notification)
    await db.commit()
    return updated


@router.post("/read-all", response_model=list[NotificationOut])
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = NotificationService(db)
    unread = await service.list_for_user(current_user.id, unread_only=True)
    for note in unread:
        await service.mark_read(note)
    await db.commit()
    return await service.list_for_user(current_user.id)
