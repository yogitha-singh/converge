import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { createWorkspace } from "../api/workspaces";
import { useToast } from "../context/ToastContext";
import { useWorkspaces } from "../context/WorkspaceContext";
import { Modal, Spinner } from "./ui";

export default function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const { refresh, setActiveId } = useWorkspaces();
  const toast = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const ws = await createWorkspace(name.trim());
      await refresh();
      setActiveId(ws.id);
      setName("");
      onClose();
      navigate(`/w/${ws.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="New workspace" description="A workspace groups documents and the people who work on them.">
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="workspace-name">Name</label>
        <input
          id="workspace-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          placeholder="e.g. Engineering"
          className="input"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-primary" disabled={saving || !name.trim()}>
            {saving && <Spinner size={14} className="text-white/80" />} Create workspace
          </button>
        </div>
      </form>
    </Modal>
  );
}
