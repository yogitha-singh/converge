import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.document import DocumentStatus
from app.models.user import User
from app.schemas.document import (
    DocumentCreate,
    DocumentMetaUpdate,
    DocumentOut,
    DocumentSummary,
    DocumentUpdate,
    DocumentVersionDetail,
    DocumentVersionOut,
    RestoreVersionRequest,
)
from app.services.document_service import DocumentService

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("", response_model=DocumentOut, status_code=201)
async def create_document(
    payload: DocumentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    doc = await DocumentService(db).create_document(
        payload.workspace_id, current_user.id, payload.title, payload.content, payload.doc_type
    )
    return doc


@router.get("", response_model=list[DocumentSummary])
async def list_documents(
    workspace_id: uuid.UUID,
    search: str | None = Query(default=None, max_length=200),
    status: DocumentStatus | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await DocumentService(db).list_documents(workspace_id, current_user.id, search, status, limit, offset)


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    doc, role = await DocumentService(db).get_document_with_role(document_id, current_user.id)
    out = DocumentOut.model_validate(doc)
    out.my_role = role
    return out


@router.patch("/{document_id}", response_model=DocumentOut)
async def update_document(
    document_id: uuid.UUID, payload: DocumentUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    return await DocumentService(db).update_document(
        document_id, current_user.id, payload.title, payload.content, payload.revision
    )


@router.patch("/{document_id}/meta", response_model=DocumentOut)
async def update_document_meta(
    document_id: uuid.UUID, payload: DocumentMetaUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Change workflow status and/or document type."""
    return await DocumentService(db).update_meta(document_id, current_user.id, payload.status, payload.doc_type)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await DocumentService(db).delete_document(document_id, current_user.id)


@router.get("/{document_id}/versions", response_model=list[DocumentVersionOut])
async def list_versions(
    document_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await DocumentService(db).list_versions(document_id, current_user.id, limit, offset)


@router.get("/{document_id}/versions/{version_id}", response_model=DocumentVersionDetail)
async def get_version(
    document_id: uuid.UUID, version_id: uuid.UUID,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    return await DocumentService(db).get_version(document_id, current_user.id, version_id)


@router.post("/{document_id}/restore", response_model=DocumentOut)
async def restore_version(
    document_id: uuid.UUID, payload: RestoreVersionRequest,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    return await DocumentService(db).restore_version(document_id, current_user.id, payload.version_id)
