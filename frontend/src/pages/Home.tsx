import { Building2, Plus } from "lucide-react";
import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import CreateWorkspaceModal from "../components/CreateWorkspaceModal";
import { EmptyState, Skeleton } from "../components/ui";
import { useWorkspaces } from "../context/WorkspaceContext";

/** `/` — jump to the last-used workspace, or guide a brand-new user to create one. */
export default function Home() {
  const { loading, active } = useWorkspaces();
  const [creating, setCreating] = useState(false);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (active) return <Navigate to={`/w/${active.id}`} replace />;

  return (
    <div className="mx-auto max-w-lg pt-24">
      <EmptyState
        icon={<Building2 size={22} />}
        title="Create your first workspace"
        description="Workspaces hold your documents and the people you collaborate with. Create one to get started."
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New workspace
          </button>
        }
      />
      <CreateWorkspaceModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
