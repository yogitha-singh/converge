import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.workspace import WorkspaceRole


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class WorkspaceUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    name: str
    created_by: uuid.UUID
    created_at: datetime
    my_role: WorkspaceRole | None = None

    model_config = {"from_attributes": True}


class MemberInvite(BaseModel):
    email: EmailStr
    role: WorkspaceRole = WorkspaceRole.EDITOR


class MemberRoleUpdate(BaseModel):
    role: WorkspaceRole


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: EmailStr
    name: str
    role: WorkspaceRole

    model_config = {"from_attributes": True}


class ActivityOut(BaseModel):
    id: uuid.UUID
    action: str
    description: str
    actor_id: uuid.UUID
    actor_name: str
    document_id: uuid.UUID | None
    created_at: datetime
