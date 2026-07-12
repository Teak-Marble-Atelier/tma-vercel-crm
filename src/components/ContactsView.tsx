import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../state/Session";
import { Timeline } from "./Timeline";
import { RecordFormDrawer } from "./RecordFormDrawer";
import { CONTACT_FORM } from "../lib/forms";
import type { Contact } from "../lib/types";

export function ContactsView() {
  const { current } = useSession();
  const [rows, setRows] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  // undefined = closed, null = create, object = edit
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    const { data } = await supabase.from("contacts").select("*")
      .eq("workspace_id", current.id).order("created_at", { ascending: false });
    setRows((data as Contact[]) ?? []);
    setLoading(false);
  }, [current]);

  useEffect(() => { load(); }, [load]);

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
        <button className="btn" onClick={() => setEditing(null)}>New contact</button>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search contacts"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="sub">{filtered.length} of {rows.length}</span>
      </div>

      {!filtered.length ? (
        <div className="center-note">No contacts yet. Use “New contact”, or they arrive from Shopify, Vapi, or the supplier pipeline.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Source</th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setEditing(c)}>
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

      {editing !== undefined && (
        <RecordFormDrawer
          spec={CONTACT_FORM}
          row={editing as Record<string, unknown> | null}
          onClose={() => setEditing(undefined)}
          onSaved={load}
          extra={editing ? (
            <>
              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "0 0 4px" }}>
                Timeline
              </h3>
              <Timeline contactId={(editing as Contact).id} />
            </>
          ) : undefined}
        />
      )}
    </>
  );
}
