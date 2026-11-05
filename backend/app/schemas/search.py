import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.document import DocumentStatus, DocumentType


class SearchResult(BaseModel):
    id: uuid.UUID
    title: str
    doc_type: DocumentType
    status: DocumentStatus
    workspace_id: uuid.UUID
    workspace_name: str
    snippet: str | None
    updated_at: datetime
