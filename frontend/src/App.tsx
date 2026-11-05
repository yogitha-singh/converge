import React from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import CommandPalette from "./components/CommandPalette";
import { Spinner } from "./components/ui";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PaletteProvider } from "./context/PaletteContext";
import { ToastProvider } from "./context/ToastContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import DocumentEditor from "./pages/DocumentEditor";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import WorkspacePage from "./pages/WorkspacePage";

function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size={22} />
    </div>
  );
}

/** Everything behind login. Mounts the data providers and the global Cmd+K palette once. */
function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <WorkspaceProvider>
      <PaletteProvider>
        <Outlet />
        <CommandPalette />
      </PaletteProvider>
    </WorkspaceProvider>
  );
}

function PublicOnlyLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  // Once signed in, return to the page the user originally asked for (set by ProtectedLayout).
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? "/"} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicOnlyLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>
            <Route element={<ProtectedLayout />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Home />} />
                <Route path="/w/:workspaceId" element={<WorkspacePage />} />
              </Route>
              <Route path="/documents/:documentId" element={<DocumentEditor />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
