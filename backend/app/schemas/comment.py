import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    range_start: int | None = Field(default=None, ge=0)
    range_end: int | None = Field(default=None, ge=0)
    quote: str | None = Field(default=None, max_length=2000)


class ReplyCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class ReplyOut(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    content: str
    created_at: datetime


class CommentOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    content: str
    range_start: int | None
    range_end: int | None
    quote: str | None
    resolved: bool
    created_at: datetime
    replies: list[ReplyOut] = []
