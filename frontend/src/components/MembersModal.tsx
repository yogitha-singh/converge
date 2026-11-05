import { Crown, Eye, MessageSquare, Pencil, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import {
  type Member,
  type Workspace,
  type WorkspaceRole,
  deleteWorkspace,
  inviteMember,
  listMembers,
  removeMember,
  renameWorkspace,
  updateMemberRole,
} from "../api/workspaces";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useWorkspaces } from "../context/WorkspaceContext";
import { Avatar, Modal, Skeleton, Spinner, cx } from "./ui";

export const ROLES: { value: WorkspaceRole; label: string; description: string; icon: LucideIcon }[] = [
  { value: "owner", label: "Owner", description: "Manage members, approve and delete documents", icon: Crown },
  { value: "editor", label: "Editor", description: "Create and edit documents, comment", icon: Pencil },
  { value: "commenter", label: "Commenter", description: "Read-only, but can comment", icon: MessageSquare },
  { value: "viewer", label: "Viewer", description: "Read-only, cannot comment", icon: Eye },
];

export const roleLabel = (role: WorkspaceRole | null | undefined) => ROLES.find((r) => r.value === role)?.label ?? "";

export function RoleBadge({ role }: { role: WorkspaceRole | null | undefined }) {
  if (!role) return null;
  return <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">{roleLabel(role)}</span>;
}

export default function MembersModal({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { refresh } = useWorkspaces();
  const isOwner = workspace.my_role === "owner";

  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("editor");
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [savingName, setSavingName] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await listMembers(workspace.id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [workspace.id, toast]);

  useEffect(() => {
    if (open) {
      setMembers(null);
      setName(workspace.name);
      setConfirmDelete("");
      load();
    }
  }, [open, load, workspace.name]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      await inviteMember(workspace.id, email.trim(), inviteRole);
      toast.success(`Invited ${email.trim()}`);
      setEmail("");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(member: Member, role: WorkspaceRole) {
    try {
      await updateMemberRole(workspace.id, member.user_id, role);
      toast.success(`${member.name} is now ${roleLabel(role)}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    await load();
  }

  async function handleRemove(member: Member) {
    if (!window.confirm(`Remove ${member.name} from ${workspace.name}?`)) return;
    try {
      await removeMember(workspace.id, member.user_id);
      toast.success(`Removed ${member.name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    await load();
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === workspace.name) return;
    setSavingName(true);
    try {
      await renameWorkspace(workspace.id, name.trim());
      await refresh();
      toast.success("Workspace renamed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteWorkspace(workspace.id);
      await refresh();
      toast.success("Workspace deleted");
      onClose();
      navigate("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  }

  const selectedInviteRole = ROLES.find((r) => r.value === inviteRole);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isOwner ? "Manage members" : "Members"}
      description={isOwner ? `Control who can access ${workspace.name} and what they can do.` : `People with access to ${workspace.name}.`}
    >
      <div className="space-y-6">
        {isOwner && (
          <form onSubmit={handleInvite}>
            <label className="label" htmlFor="invite-email">Invite by email</label>
            <div className="flex gap-2">
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="input flex-1"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                className="input w-auto"
                aria-label="Role for invited member"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button className="btn-primary" disabled={inviting}>
                {inviting ? <Spinner size={14} className="text-white/80" /> : <UserPlus size={15} />} Invite
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">{selectedInviteRole?.description}. The person needs a Converge account first.</p>
          </form>
        )}

        <div>
          <p className="section-title mb-2">{members ? `${members.length} member${members.length === 1 ? "" : "s"}` : "Members"}</p>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {members === null &&
              [0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </li>
              ))}
            {members?.map((m) => {
              const isMe = m.user_id === user?.id;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.name} id={m.user_id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {m.name} {isMe && <span className="font-normal text-zinc-400">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-zinc-500">{m.email}</p>
                  </div>
                  {isOwner ? (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m, e.target.value as WorkspaceRole)}
                        className="input h-8 w-auto py-0 text-xs"
                        aria-label={`Role for ${m.name}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <button onClick={() => handleRemove(m)} className="btn-icon hover:text-red-600" aria-label={`Remove ${m.name}`}>
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {isOwner && (
          <div className="space-y-5 border-t border-zinc-100 pt-5">
            <form onSubmit={handleRename}>
              <label className="label" htmlFor="ws-name">Workspace name</label>
              <div className="flex gap-2">
                <input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className="input flex-1" />
                <button className="btn-secondary" disabled={savingName || !name.trim() || name.trim() === workspace.name}>
                  {savingName && <Spinner size={14} />} Save
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
              <p className="text-sm font-semibold text-red-700">Delete workspace</p>
              <p className="mt-0.5 text-xs text-red-700/80">
                Permanently deletes this workspace with all its documents, history and comments. This can't be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  placeholder={`Type “${workspace.name}” to confirm`}
                  className="input flex-1 border-red-200 focus:border-red-500 focus:ring-red-500/20"
                  aria-label="Type the workspace name to confirm deletion"
                />
                <button onClick={handleDelete} disabled={deleting || confirmDelete !== workspace.name} className={cx("btn-danger")}>
                  {deleting && <Spinner size={14} className="text-white/80" />} Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
