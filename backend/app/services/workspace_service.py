import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.repositories.user_repo import UserRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.services.activity_service import ActivityService
from app.services.notification_service import NotificationService
from app.services.permission_service import require_role


class WorkspaceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = WorkspaceRepository(db)
        self.users = UserRepository(db)
        self.activity = ActivityService(db)
        self.notifications = NotificationService(db)

    async def create_workspace(self, name: str, owner_id: uuid.UUID) -> Workspace:
        workspace = await self.repo.create(name=name, created_by=owner_id)
        await self.activity.log(workspace.id, owner_id, "workspace.created", f'Created workspace "{name}"')
        await self.db.commit()
        return workspace

    async def list_workspaces(self, user_id: uuid.UUID) -> list[tuple[Workspace, WorkspaceRole]]:
        return await self.repo.list_for_user(user_id)

    async def get_workspace(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> tuple[Workspace, WorkspaceRole]:
        membership = await require_role(self.db, workspace_id, user_id, WorkspaceRole.VIEWER)
        workspace = await self.repo.get_by_id(workspace_id)
        if workspace is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
        return workspace, membership.role

    async def rename_workspace(self, workspace_id: uuid.UUID, actor_id: uuid.UUID, name: str) -> Workspace:
        await require_role(self.db, workspace_id, actor_id, WorkspaceRole.OWNER)
        workspace = await self.repo.get_by_id(workspace_id)
        if workspace is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
        old = workspace.name
        await self.repo.rename(workspace, name)
        await self.activity.log(workspace_id, actor_id, "workspace.renamed", f'Renamed workspace "{old}" to "{name}"')
        await self.db.commit()
        return workspace

    async def delete_workspace(self, workspace_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        await require_role(self.db, workspace_id, actor_id, WorkspaceRole.OWNER)
        workspace = await self.repo.get_by_id(workspace_id)
        if workspace is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
        await self.repo.delete(workspace)
        await self.db.commit()

    async def list_members(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> list[WorkspaceMember]:
        await require_role(self.db, workspace_id, user_id, WorkspaceRole.VIEWER)
        return await self.repo.list_members(workspace_id)

    async def invite_member(
        self, workspace_id: uuid.UUID, inviter_id: uuid.UUID, email: str, role: WorkspaceRole
    ) -> WorkspaceMember:
        await require_role(self.db, workspace_id, inviter_id, WorkspaceRole.OWNER)

        invitee = await self.users.get_by_email(email)
        if invitee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user with that email")

        existing = await self.repo.get_membership(workspace_id, invitee.id)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")

        workspace = await self.repo.get_by_id(workspace_id)
        member = await self.repo.add_member(workspace_id, invitee.id, role)
        await self.activity.log(workspace_id, inviter_id, "member.invited", f"Invited {invitee.name} as {role.value}")
        await self.notifications.notify_workspace_invite(invitee.id, workspace_id, workspace.name if workspace else "")
        await self.db.commit()
        return member

    async def remove_member(self, workspace_id: uuid.UUID, actor_id: uuid.UUID, target_user_id: uuid.UUID) -> None:
        await require_role(self.db, workspace_id, actor_id, WorkspaceRole.OWNER)
        member = await self.repo.get_membership(workspace_id, target_user_id)
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
        if member.role == WorkspaceRole.OWNER and await self.repo.count_owners(workspace_id) <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A workspace must keep at least one owner")
        target = await self.users.get_by_id(target_user_id)
        await self.repo.remove_member(member)
        await self.activity.log(
            workspace_id, actor_id, "member.removed", f"Removed {target.name if target else 'a member'} from the workspace"
        )
        await self.db.commit()

    async def update_member_role(
        self, workspace_id: uuid.UUID, actor_id: uuid.UUID, target_user_id: uuid.UUID, role: WorkspaceRole
    ) -> WorkspaceMember:
        await require_role(self.db, workspace_id, actor_id, WorkspaceRole.OWNER)
        member = await self.repo.get_membership(workspace_id, target_user_id)
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
        if (
            member.role == WorkspaceRole.OWNER
            and role != WorkspaceRole.OWNER
            and await self.repo.count_owners(workspace_id) <= 1
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A workspace must keep at least one owner")
        target = await self.users.get_by_id(target_user_id)
        member = await self.repo.update_role(member, role)
        await self.activity.log(
            workspace_id, actor_id, "member.role_updated",
            f"Changed {target.name if target else 'a member'}'s role to {role.value}",
        )
        await self.db.commit()
        return member
