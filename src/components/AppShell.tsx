import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../state/Session";
import { TABLES } from "../lib/pipelines";

const TITLES: Record<string, string> = {
  "/board": "Pipeline", "/contacts": "Contacts",
};

export function AppShell() {
  const { current, workspaces, setCurrent, user, signOut } = useSession();
  const loc = useLocation();
  if (!current) return <div className="center-note">No workspace available for this account.</div>;

  const tables = TABLES[current.slug];
  const title =
    TITLES[loc.pathname] ??
    tables.find((t) => loc.pathname === `/records/${t.key}`)?.label ??
    "Pipeline";

  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">
          <div className="eyebrow">{current.slug === "roark" ? "Minerals" : "Atelier"}</div>
          <div className="name">{current.name}</div>
          <div className="rule" />
        </div>
        <div className="nav">
          <NavLink to="/board" className={({ isActive }) => (isActive ? "on" : "")}>Pipeline</NavLink>
          <NavLink to="/contacts" className={({ isActive }) => (isActive ? "on" : "")}>Contacts</NavLink>
          {tables.map((t) => (
            <NavLink key={t.key} to={`/records/${t.key}`} className={({ isActive }) => (isActive ? "on" : "")}>
              {t.label}
            </NavLink>
          ))}
        </div>
        <div className="foot">
          <div>{user?.full_name ?? user?.email}</div>
          <button onClick={signOut}>Sign out</button>
        </div>
      </nav>
      <div className="main">
        <header className="top">
          <h1>{title}</h1>
          {workspaces.length > 1 && (
            <div className="switch" role="tablist" aria-label="Workspace">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  className={w.id === current.id ? "on" : ""}
                  onClick={() => setCurrent(w)}
                  role="tab"
                  aria-selected={w.id === current.id}
                >
                  {w.slug === "roark" ? "Roark" : "TMA"}
                </button>
              ))}
            </div>
          )}
        </header>
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}
