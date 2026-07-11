import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../state/Session";
import { Timeline } from "./Timeline";
import type { Contact } from "../lib/types";

export function ContactsView() {
  const { current } = useSession();
  const [rows, setRows] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!current) return;
      setLoading(true);
      const { data } = await supabase.from("contacts").select("*")
        .eq("workspace_id", current.id).order("created_at", { ascending: false });
      if (alive) { setRows((data as Contact[]) ?? []); setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [current]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.company, r.email, r.source].some((v) => v?.toLowerCase().includes(s)));
  }, [rows, q]);

  if (loading) return <div className="center-note">Loading contacts…</div>;

  return (
    <>
      <div className="row-actions">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search contacts"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="sub">{filtered.length} of {rows.length}</span>
      </div>
      {!filtered.length ? (
        <div className="center-note">No contacts yet. They arrive from Shopify, Vapi, or the supplier pipeline.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Source</th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setOpen(c)}>
                  <td>{c.name}</td>
                  <td>{c.company ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.source ? <span className="pill">{c.source}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <aside className="drawer" role="dialog" aria-label={open.name}>
            <div className="dhead">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div><div className="k">{open.kind}</div><div className="v">{open.name}</div></div>
                <button className="x" onClick={() => setOpen(null)} aria-label="Close">×</button>
              </div>
            </div>
            <div className="dbody">
              <div className="field"><span className="fk">Company</span><span>{open.company ?? "—"}</span></div>
              <div className="field"><span className="fk">Email</span><span>{open.email ?? "—"}</span></div>
              <div className="field"><span className="fk">Phone</span><span>{open.phone ?? "—"}</span></div>
              <div className="field"><span className="fk">Source</span><span>{open.source ?? "—"}</span></div>
              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "22px 0 4px" }}>Timeline</h3>
              <Timeline contactId={open.id} />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
