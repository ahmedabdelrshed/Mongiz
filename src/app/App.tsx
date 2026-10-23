import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Layers,
  ListTodo,
  Sun,
  Copy,
  Settings,
  ArrowUpRight,
  Cloud,
  ArrowRightLeft,
  Gauge,
  Menu,
} from "lucide-react";
import { useWorkspace } from "./Workspace";
import { BulkCreatePage } from "../features/bulk-create/BulkCreatePage";
import { MyWorkPage } from "../features/my-work/MyWorkPage";
import { MoveStoriesPage } from "../features/move-stories/MoveStoriesPage";
import { StoryPointsPage } from "../features/story-points/StoryPointsPage";
import { TemplatesPage } from "../features/templates/TemplatesPage";
import { SettingsPage } from "../features/project/SettingsPage";
import { Notice } from "../shared/ui/Common";
import { Modal } from "../shared/ui/Dialog";
import { PageEntry, useCompactLayout } from "../shared/ui/Motion";
import { MongizMark } from "../shared/ui/MongizMark";
export function App() {
  const w = useWorkspace();
  const location = useLocation();
  const compact = useCompactLayout();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname, compact]);
  const nav = [
    { to: "/work", name: "My work", icon: ListTodo },
    { to: "/today", name: "Today’s plan", icon: Sun },
    { to: "/create", name: "Create stories", icon: Layers },
    { to: "/move-stories", name: "Move stories", icon: ArrowRightLeft },
    { to: "/story-points", name: "Story points", icon: Gauge },
    { to: "/templates", name: "Task templates", icon: Copy },
  ];
  const page = nav.find((n) => n.to === location.pathname)?.name ?? "Settings";
  const navigation = (
    <>
      <div className="brand">
        <MongizMark className="brand-mark" />
        Mongiz<span className="brand-dot">.</span>
        <span className="brand-arabic" lang="ar" dir="rtl">
          منجز
        </span>
      </div>
      {[
        { label: "Work", items: nav.slice(0, 2) },
        { label: "Tools", items: nav.slice(2) },
      ].map((group) => (
        <div className="nav-group" key={group.label}>
          <div className="nav-label">{group.label}</div>
          <nav aria-label={group.label}>
            {group.items.map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMenuOpen(false)}>
                <n.icon size={18} />
                {n.name}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
      <div className="sidebar-bottom">
        <NavLink to="/settings" onClick={() => setMenuOpen(false)}>
          <Settings size={18} />
          Settings
        </NavLink>
        <div className="connection-label">
          <Cloud size={16} /> Azure DevOps
          <span
            className={`connection-dot ${w.account ? "connected" : ""}`}
            aria-label={w.account ? "Connected" : "Disconnected"}
          />
        </div>
        <div className="profile">
          <span className="avatar">{(w.account || "?")[0].toUpperCase()}</span>
          <div>
            <strong>{w.account || "Not signed in"}</strong>
            <span>Personal workspace</span>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      {!compact && <aside className="sidebar">{navigation}</aside>}
      <div className="main-shell">
        <header className="topbar">
          {compact && (
            <Modal
              open={menuOpen}
              onOpenChange={setMenuOpen}
              title="Workspace navigation"
              kind="navigation"
              closeLabel="Close navigation"
              trigger={
                <button
                  type="button"
                  className="icon"
                  aria-label="Open navigation"
                >
                  <Menu size={20} />
                </button>
              }
            >
              <div className="mobile-navigation">{navigation}</div>
            </Modal>
          )}
          <div className="breadcrumb">
            <span className="breadcrumb-workspace">
              {w.settings.organization || "Workspace"}
            </span>
            <span>/</span>
            <strong>{page}</strong>
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
          <PageEntry key={location.pathname}>
            <Routes>
              <Route
                path="/story-points"
                element={
                  w.account ? (
                    <StoryPointsPage />
                  ) : (
                    <Navigate to="/settings" replace />
                  )
                }
              />
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
                  w.account ? (
                    <MyWorkPage />
                  ) : (
                    <Navigate to="/settings" replace />
                  )
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
          </PageEntry>
        </main>
      </div>
    </div>
  );
}
