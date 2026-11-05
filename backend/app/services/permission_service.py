"""
Centralized authorization logic.

Every route/service that touches a workspace or document MUST go through
this module rather than re-implementing role checks inline. The frontend's
notion of permissions is never trusted -- it's UI-only convenience.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.repositories.workspace_repo import WorkspaceRepository

# Ordered from least to most privileged, used for "at least X" checks.
_ROLE_RANK = {
    WorkspaceRole.VIEWER: 0,
    WorkspaceRole.COMMENTER: 1,
    WorkspaceRole.EDITOR: 2,
    WorkspaceRole.OWNER: 3,
}


def role_at_least(role: WorkspaceRole, minimum: WorkspaceRole) -> bool:
    return _ROLE_RANK[role] >= _ROLE_RANK[minimum]


async def require_membership(db: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID) -> WorkspaceMember:
    repo = WorkspaceRepository(db)
    membership = await repo.get_membership(workspace_id, user_id)
    if membership is None:
        # 404, not 403 -- don't confirm the workspace exists to a non-member.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return membership


async def require_role(
    db: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, minimum: WorkspaceRole
) -> WorkspaceMember:
    membership = await require_membership(db, workspace_id, user_id)
    if not role_at_least(membership.role, minimum):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return membership
