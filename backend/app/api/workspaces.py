import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.workspace import (
    ActivityOut,
    MemberInvite,
    MemberOut,
    MemberRoleUpdate,
    WorkspaceCreate,
    WorkspaceOut,
    WorkspaceUpdate,
)
from app.services.activity_service import ActivityService
from app.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def _workspace_out(workspace, role: WorkspaceRole | None) -> WorkspaceOut:
    out = WorkspaceOut.model_validate(workspace)
    out.my_role = role
    return out


def _member_out(member) -> MemberOut:
    return MemberOut(id=member.id, user_id=member.user_id, email=member.user.email, name=member.user.name, role=member.role)


@router.post("", response_model=WorkspaceOut, status_code=201)
async def create_workspace(
    payload: WorkspaceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    workspace = await WorkspaceService(db).create_workspace(payload.name, current_user.id)
    return _workspace_out(workspace, WorkspaceRole.OWNER)


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    pairs = await WorkspaceService(db).list_workspaces(current_user.id)
    return [_workspace_out(ws, role) for ws, role in pairs]


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    workspace, role = await WorkspaceService(db).get_workspace(workspace_id, current_user.id)
    return _workspace_out(workspace, role)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def rename_workspace(
    workspace_id: uuid.UUID, payload: WorkspaceUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    workspace = await WorkspaceService(db).rename_workspace(workspace_id, current_user.id, payload.name)
    return _workspace_out(workspace, WorkspaceRole.OWNER)


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await WorkspaceService(db).delete_workspace(workspace_id, current_user.id)


@router.get("/{workspace_id}/members", response_model=list[MemberOut])
async def list_members(
    workspace_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    members = await WorkspaceService(db).list_members(workspace_id, current_user.id)
    return [_member_out(m) for m in members]


@router.post("/{workspace_id}/members", response_model=MemberOut, status_code=201)
async def invite_member(
    workspace_id: uuid.UUID, payload: MemberInvite,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    member = await WorkspaceService(db).invite_member(workspace_id, current_user.id, payload.email, payload.role)
    await db.refresh(member, attribute_names=["user"])
    return _member_out(member)


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberOut)
async def update_member_role(
    workspace_id: uuid.UUID, user_id: uuid.UUID, payload: MemberRoleUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    member = await WorkspaceService(db).update_member_role(workspace_id, current_user.id, user_id, payload.role)
    await db.refresh(member, attribute_names=["user"])
    return _member_out(member)


@router.delete("/{workspace_id}/members/{user_id}", status_code=204)
async def remove_member(
    workspace_id: uuid.UUID, user_id: uuid.UUID,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await WorkspaceService(db).remove_member(workspace_id, current_user.id, user_id)


@router.get("/{workspace_id}/activity", response_model=list[ActivityOut])
async def list_activity(
    workspace_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Membership check first, so activity can never leak across workspaces.
    await WorkspaceService(db).get_workspace(workspace_id, current_user.id)
    rows = await ActivityService(db).list_for_workspace(workspace_id, limit, offset)
    return [
        ActivityOut(
            id=e.id, action=e.action, description=e.description, actor_id=e.actor_id,
            actor_name=name, document_id=e.document_id, created_at=e.created_at,
        )
        for e, name in rows
    ]
