import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { day, money } from "../lib/format";
import { TABLES } from "../lib/pipelines";
import { FORMS } from "../lib/forms";
import { useSession } from "../state/Session";
import { RecordFormDrawer } from "./RecordFormDrawer";

type Row = Record<string, unknown>;

// Config-driven list for the secondary entities (suppliers, orders,
// inventory, provenance) — now with create / edit / delete via the generic
// RecordFormDrawer, driven by the per-table spec in lib/forms.
export function RecordsView() {
  const { current } = useSession();
  const { key } = useParams();
  const def = current ? TABLES[current.slug].find((t) => t.key === key) : null;
  const spec = def ? FORMS[def.table] : undefined;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  // undefined = closed, null = create, object = edit
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!current || !def) return;
    setLoading(true);
    const { data } = await supabase.from(def.table).select("*")
      .eq("workspace_id", current.id).limit(500);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [current, def]);

  useEffect(() => { load(); }, [load]);

  if (!def) return <div className="center-note">Unknown view.</div>;

  function cell(row: Row, field: string, kind?: string) {
    const v = row[field];
    if (kind === "money") return <span className="money">{money(v as number | null)}</span>;
    if (kind === "date") return day(v as string | null);
    if (kind === "bool") return v ? <span className="pill good">Yes</span> : <span className="pill">No</span>;
    if (kind === "pill") return v ? <span className="pill">{String(v).replace(/_/g, " ")}</span> : "—";
    return v == null || v === "" ? "—" : String(v);
  }

  return (
    <>
      {spec && (
        <div className="row-actions">
          {!spec.editOnly && (
            <button className="btn" onClick={() => setEditing(null)}>New {spec.label.toLowerCase()}</button>
          )}
          <span className="sub">{rows.length} {def.label.toLowerCase()}</span>
        </div>
      )}

      {loading ? (
        <div className="center-note">Loading {def.label.toLowerCase()}…</div>
      ) : !rows.length ? (
        <div className="center-note">
          No {def.label.toLowerCase()} yet.{spec ? " Use “New” to add one." : ""}
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{def.columns.map((c) => <th key={c.field}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={(row.id as string) ?? i}
                  style={spec ? { cursor: "pointer" } : undefined}
                  onClick={spec ? () => setEditing(row) : undefined}>
                  {def.columns.map((c) => <td key={c.field}>{cell(row, c.field, c.kind)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {spec && editing !== undefined && (
        <RecordFormDrawer
          spec={spec}
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={load}
        />
      )}
    </>
  );
}
