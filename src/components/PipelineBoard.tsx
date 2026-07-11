import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { money } from "../lib/format";
import { PIPELINES } from "../lib/pipelines";
import { useSession } from "../state/Session";
import type { PipelineRow } from "../lib/types";
import { RecordDrawer } from "./RecordDrawer";

// The hero. Lanes = stages, cards = deals/acquisitions. Drag a card to a new
// lane and it writes the stage; the DB trigger stamps stage_changed_at and
// logs the move to the timeline. Optimistic so the board feels instant.
export function PipelineBoard() {
  const { current } = useSession();
  const def = current ? PIPELINES[current.slug] : null;
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [open, setOpen] = useState<PipelineRow | null>(null);

  const load = useCallback(async () => {
    if (!current || !def) return;
    setLoading(true);
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from(def.table).select("*").eq("workspace_id", current.id)
        .order("updated_at", { ascending: false }),
      supabase.from("contacts").select("id,name").eq("workspace_id", current.id),
    ]);
    setRows((r as PipelineRow[]) ?? []);
    const map: Record<string, string> = {};
    for (const row of (c as { id: string; name: string }[]) ?? []) map[row.id] = row.name;
    setNames(map);
    setLoading(false);
  }, [current, def]);

  useEffect(() => { load(); }, [load]);

  async function move(id: string, stage: string) {
    const prev = rows.find((r) => r.id === id);
    if (!prev || prev.stage === stage || !def) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, stage } : r))); // optimistic
    const { error } = await supabase.from(def.table).update({ stage }).eq("id", id);
    if (error) { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, stage: prev.stage } : r))); }
  }

  if (!def) return <div className="center-note">Pick a workspace.</div>;
  if (loading) return <div className="center-note">Loading pipeline…</div>;

  const cardValue = (row: PipelineRow) =>
    def.valueFields.map((f) => (row as unknown as Record<string, unknown>)[f] as number | null | undefined)
      .find((v) => v != null);

  return (
    <>
      <div className="board">
        {def.stages.map((st) => {
          const cards = rows.filter((r) => r.stage === st.key);
          return (
            <div
              key={st.key}
              className={"lane" + (overStage === st.key ? " drop" : "")}
              onDragOver={(e) => { e.preventDefault(); setOverStage(st.key); }}
              onDragLeave={() => setOverStage((s) => (s === st.key ? null : s))}
              onDrop={(e) => { e.preventDefault(); setOverStage(null); if (dragId) move(dragId, st.key); }}
            >
              <div className="head">
                <div className="bar" />
                <div className="row">
                  <span className="lbl">{st.label}</span>
                  <span className="ct">{cards.length}</span>
                </div>
              </div>
              <div className="cards">
                {cards.map((row) => (
                  <div
                    key={row.id}
                    className="card"
                    draggable
                    onDragStart={() => setDragId(row.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setOpen(row)}
                  >
                    <div className="t">{row.title}</div>
                    <div className="m">
                      <span>{row.contact_id ? names[row.contact_id] ?? "—" : "—"}</span>
                      <span className="val">{money(cardValue(row))}</span>
                    </div>
                  </div>
                ))}
                {!cards.length && <div className="empty">Drop a card here</div>}
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <RecordDrawer
          row={open}
          contactName={open.contact_id ? names[open.contact_id] ?? "" : ""}
          valueFields={def.valueFields}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
