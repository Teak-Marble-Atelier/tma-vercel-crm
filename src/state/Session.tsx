import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AppUser, Side, Workspace } from "../lib/types";

interface Ctx {
  session: Session | null;
  user: AppUser | null;
  workspaces: Workspace[];
  current: Workspace | null;
  setCurrent: (w: Workspace) => void;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);
const LAST_KEY = "crm.last_workspace";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrentState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  // track auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // once signed in, load the user row + the workspaces RLS lets them see
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!session) { setUser(null); setWorkspaces([]); setCurrentState(null); setLoading(false); return; }
      setLoading(true);
      const [{ data: u }, { data: ws }] = await Promise.all([
        supabase.from("app_users").select("*").eq("id", session.user.id).maybeSingle(),
        supabase.from("workspaces").select("*").order("slug"),
      ]);
      if (!alive) return;
      setUser((u as AppUser) ?? null);
      const list = (ws as Workspace[]) ?? [];
      setWorkspaces(list);
      const remembered = list.find((w) => w.id === localStorage.getItem(LAST_KEY));
      setCurrentState(remembered ?? list[0] ?? null);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [session]);

  // apply the per-side theme whenever the workspace changes
  useEffect(() => {
    const side: Side = current?.slug ?? "roark";
    document.documentElement.setAttribute("data-side", side);
  }, [current]);

  function setCurrent(w: Workspace) {
    localStorage.setItem(LAST_KEY, w.id);
    setCurrentState(w);
  }
  async function signOut() { await supabase.auth.signOut(); }

  const value = useMemo<Ctx>(
    () => ({ session, user, workspaces, current, setCurrent, loading, signOut }),
    [session, user, workspaces, current, loading],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error("useSession must be used within SessionProvider");
  return c;
}
