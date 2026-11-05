import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentOut, ReplyCreate, ReplyOut
from app.services.comment_service import CommentService

router = APIRouter(tags=["comments"])


@router.get("/api/documents/{document_id}/comments", response_model=list[CommentOut])
async def list_comments(
    document_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    service = CommentService(db)
    return await service.list_comments(document_id, current_user.id)


@router.post("/api/documents/{document_id}/comments", response_model=CommentOut, status_code=201)
async def create_comment(
    document_id: uuid.UUID, payload: CommentCreate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    service = CommentService(db)
    return await service.create_comment(
        document_id, current_user.id, payload.content, payload.range_start, payload.range_end, payload.quote
    )


@router.post("/api/comments/{comment_id}/resolve", response_model=CommentOut)
async def resolve_comment(
    comment_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    service = CommentService(db)
    return await service.resolve_comment(comment_id, current_user.id, resolved=True)


@router.post("/api/comments/{comment_id}/reopen", response_model=CommentOut)
async def reopen_comment(
    comment_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    service = CommentService(db)
    return await service.resolve_comment(comment_id, current_user.id, resolved=False)


@router.post("/api/comments/{comment_id}/replies", response_model=ReplyOut, status_code=201)
async def add_reply(
    comment_id: uuid.UUID, payload: ReplyCreate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    service = CommentService(db)
    return await service.add_reply(comment_id, current_user.id, payload.content)
