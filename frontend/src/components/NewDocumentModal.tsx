import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { type DocumentType, createDocument } from "../api/documents";
import { useToast } from "../context/ToastContext";
import { TypePicker } from "./DocMeta";
import { Modal, Spinner } from "./ui";

export default function NewDocumentModal({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocumentType>("spec");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const doc = await createDocument(workspaceId, title.trim() || "Untitled", docType);
      setTitle("");
      onClose();
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New document" description="Pick a type to start from. You can change it later.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="label" htmlFor="doc-title">Title</label>
          <input id="doc-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} placeholder="Untitled" className="input" />
        </div>
        <div>
          <span className="label">Type</span>
          <TypePicker value={docType} onChange={setDocType} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-primary" disabled={saving}>
            {saving && <Spinner size={14} className="text-white/80" />} Create document
          </button>
        </div>
      </form>
    </Modal>
  );
}
