import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  Layers,
  ListTodo,
  Sun,
  Copy,
  Settings,
  ArrowUpRight,
  Command,
  Cloud,
  ArrowRightLeft,
} from "lucide-react";
import { useWorkspace } from "./Workspace";
import { BulkCreatePage } from "../features/bulk-create/BulkCreatePage";
import { MyWorkPage } from "../features/my-work/MyWorkPage";
import { MoveStoriesPage } from "../features/move-stories/MoveStoriesPage";
import { TemplatesPage } from "../features/templates/TemplatesPage";
import { SettingsPage } from "../features/project/SettingsPage";
import { Notice } from "../shared/ui/Common";
export function App() {
  const w = useWorkspace();
  const nav = [
    { to: "/work", name: "My work", icon: ListTodo },
    { to: "/move-stories", name: "Move stories", icon: ArrowRightLeft },
    { to: "/create", name: "Create stories", icon: Layers },
    { to: "/today", name: "Today’s plan", icon: Sun },
    { to: "/templates", name: "Task templates", icon: Copy },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Command size={21} />
          </div>
          Mongiz<span className="brand-dot">.</span>
          <span className="brand-arabic" lang="ar" dir="rtl">
            منجز
          </span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to}>
              <n.icon size={18} />
              {n.name}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings">
            <Settings size={18} />
            Settings
          </NavLink>
          <div className="connection-label">
            <Cloud size={16} /> Azure DevOps
            <span className="connection-dot" />
          </div>
          <div className="profile">
            <span className="avatar">
              {(w.account || "?")[0].toUpperCase()}
            </span>
            <div>
              <strong>{w.account || "Not signed in"}</strong>
              <span>Personal workspace</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>All projects</strong>
          </div>
          <NavLink className="top-link" to="/settings">
            {w.account ? "Manage connection" : "Connect Azure"}
            <ArrowUpRight size={15} />
          </NavLink>
        </header>
        {w.account && (
          <div className="mode-banner live">
            <Cloud size={15} /> Live Azure workspace — submitted changes update
            your organization.
          </div>
        )}
        <main className="content">
          {w.storageError && <Notice tone="error">{w.storageError}</Notice>}
          {w.error && <Notice tone="error">{w.error.message}</Notice>}
          <Routes>
            <Route
              path="/move-stories"
              element={
                w.account ? (
                  <MoveStoriesPage />
                ) : (
                  <Navigate to="/settings" replace />
                )
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="/"
              element={
                <Navigate to={w.account ? "/work" : "/settings"} replace />
              }
            />
            <Route
              path="/create"
              element={
                w.account ? (
                  <BulkCreatePage />
                ) : (
                  <Navigate to="/settings" replace />
                )
              }
            />
            <Route
              path="/work"
              element={
                w.account ? <MyWorkPage /> : <Navigate to="/settings" replace />
              }
            />
            <Route
              path="/today"
              element={
                w.account ? (
                  <MyWorkPage today />
                ) : (
                  <Navigate to="/settings" replace />
                )
              }
            />
            <Route
              path="/templates"
              element={
                w.account ? (
                  <TemplatesPage />
                ) : (
                  <Navigate to="/settings" replace />
                )
              }
            />
            <Route
              path="*"
              element={
                <Navigate to={w.account ? "/work" : "/settings"} replace />
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
