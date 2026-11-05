import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.document import DocumentStatus, DocumentType
from app.models.workspace import WorkspaceRole


class DocumentCreate(BaseModel):
    workspace_id: uuid.UUID
    title: str = Field(default="Untitled", min_length=1, max_length=500)
    content: str = ""
    doc_type: DocumentType = DocumentType.SPEC


class DocumentUpdate(BaseModel):
    """Plain REST PATCH (rename / one-shot content save). Live edits go through the WebSocket."""
    title: str | None = Field(default=None, min_length=1, max_length=500)
    content: str | None = None
    revision: int = Field(description="The client's last known revision, for optimistic-concurrency checks")


class DocumentMetaUpdate(BaseModel):
    """Workflow metadata. Independent of content, so it needs no revision check."""
    status: DocumentStatus | None = None
    doc_type: DocumentType | None = None


class DocumentOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str
    content: str
    status: DocumentStatus
    doc_type: DocumentType
    revision: int
    created_by: uuid.UUID
    last_edited_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    my_role: WorkspaceRole | None = None

    model_config = {"from_attributes": True}


class DocumentSummary(BaseModel):
    id: uuid.UUID
    title: str
    status: DocumentStatus
    doc_type: DocumentType
    revision: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentVersionOut(BaseModel):
    id: uuid.UUID
    revision: int
    title: str
    edited_by: uuid.UUID
    edited_by_name: str
    created_at: datetime


class DocumentVersionDetail(DocumentVersionOut):
    content: str


class RestoreVersionRequest(BaseModel):
    version_id: uuid.UUID
