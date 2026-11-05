import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole


class WorkspaceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, name: str, created_by: uuid.UUID) -> Workspace:
        workspace = Workspace(name=name, created_by=created_by)
        self.db.add(workspace)
        await self.db.flush()
        # Creator is automatically the owner.
        member = WorkspaceMember(workspace_id=workspace.id, user_id=created_by, role=WorkspaceRole.OWNER)
        self.db.add(member)
        await self.db.flush()
        return workspace

    async def get_by_id(self, workspace_id: uuid.UUID) -> Workspace | None:
        return await self.db.get(Workspace, workspace_id)

    async def list_for_user(self, user_id: uuid.UUID) -> list[tuple[Workspace, WorkspaceRole]]:
        result = await self.db.execute(
            select(Workspace, WorkspaceMember.role)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user_id)
            .order_by(Workspace.created_at.desc())
        )
        return [(row[0], row[1]) for row in result.all()]

    async def get_membership(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> WorkspaceMember | None:
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_members(self, workspace_id: uuid.UUID) -> list[WorkspaceMember]:
        result = await self.db.execute(
            select(WorkspaceMember)
            .options(joinedload(WorkspaceMember.user))
            .where(WorkspaceMember.workspace_id == workspace_id)
        )
        return list(result.scalars().all())

    async def add_member(self, workspace_id: uuid.UUID, user_id: uuid.UUID, role: WorkspaceRole) -> WorkspaceMember:
        member = WorkspaceMember(workspace_id=workspace_id, user_id=user_id, role=role)
        self.db.add(member)
        await self.db.flush()
        return member

    async def remove_member(self, member: WorkspaceMember) -> None:
        await self.db.delete(member)
        await self.db.flush()

    async def update_role(self, member: WorkspaceMember, role: WorkspaceRole) -> WorkspaceMember:
        member.role = role
        await self.db.flush()
        return member

    async def count_owners(self, workspace_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == WorkspaceRole.OWNER)
        )
        return int(result.scalar_one())

    async def rename(self, workspace: Workspace, name: str) -> Workspace:
        workspace.name = name
        await self.db.flush()
        return workspace

    async def delete(self, workspace: Workspace) -> None:
        await self.db.delete(workspace)
        await self.db.flush()
