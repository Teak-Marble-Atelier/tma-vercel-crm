import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { day, money } from "../lib/format";
import { TABLES } from "../lib/pipelines";
import { useSession } from "../state/Session";

// Config-driven list for the secondary entities (suppliers, orders,
// inventory, provenance). Real, filterable read views; detail/edit next.
export function RecordsView() {
  const { current } = useSession();
  const { key } = useParams();
  const def = current ? TABLES[current.slug].find((t) => t.key === key) : null;
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!current || !def) return;
      setLoading(true);
      const { data } = await supabase.from(def.table).select("*")
        .eq("workspace_id", current.id).limit(500);
      if (alive) { setRows((data as Record<string, unknown>[]) ?? []); setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [current, def]);

  if (!def) return <div className="center-note">Unknown view.</div>;
  if (loading) return <div className="center-note">Loading {def.label.toLowerCase()}…</div>;
  if (!rows.length) return <div className="center-note">No {def.label.toLowerCase()} yet.</div>;

  function cell(row: Record<string, unknown>, field: string, kind?: string) {
    const v = row[field];
    if (kind === "money") return <span className="money">{money(v as number | null)}</span>;
    if (kind === "date") return day(v as string | null);
    if (kind === "bool") return v ? <span className="pill good">Yes</span> : <span className="pill">No</span>;
    if (kind === "pill") return v ? <span className="pill">{String(v).replace(/_/g, " ")}</span> : "—";
    return v == null || v === "" ? "—" : String(v);
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{def.columns.map((c) => <th key={c.field}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={(row.id as string) ?? i}>
              {def.columns.map((c) => <td key={c.field}>{cell(row, c.field, c.kind)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
