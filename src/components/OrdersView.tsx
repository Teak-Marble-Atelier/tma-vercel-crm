import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../state/Session";
import type { Order, OrderStage } from "../lib/types";

// Orders view: unlike Quotes, this one DOES expose a real mutation (stage
// transition) — it's the only thing in this codebase that ever updates
// order_status.stage, and doing it here (via orders-transition, server-side)
// is what makes order_shipped/delivery_scheduled fireable at all. Everything
// else about an order — carrier, tracking, delivery window — comes from the
// Shopify webhook, not hand-edited here.

const STAGES: OrderStage[] = ["received", "processing", "shipped", "in_transit", "delivery_scheduled", "delivered", "exception"];
const STAGE_OPTIONS = ["all", ...STAGES] as const;

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function OrdersView() {
  const { current } = useSession();
  const [rows, setRows] = useState<Order[]>([]);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<(typeof STAGE_OPTIONS)[number]>("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const [nextStage, setNextStage] = useState<OrderStage | "">("");
  const [transitioning, setTransitioning] = useState(false);
  const [transitionErr, setTransitionErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    const { data } = await supabase
      .from("order_status")
      .select("*, contacts(name, email), order_stage_events(*)")
      .eq("workspace_id", current.id)
      .order("updated_at", { ascending: false });
    setRows((data as unknown as Order[]) ?? []);
    setLoading(false);
  }, [current]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let r = rows;
    if (stageFilter !== "all") r = r.filter((x) => x.stage === stageFilter);
    const s = q.trim().toLowerCase();
    if (s) r = r.filter((x) => [x.order_number, x.contacts?.name, x.contacts?.email].some((v) => v?.toLowerCase().includes(s)));
    return r;
  }, [rows, stageFilter, q]);

  function openDetail(order: Order) {
    setSelected(order);
    setNextStage("");
    setTransitionErr("");
  }

  async function transition() {
    if (!selected || !nextStage) return;
    setTransitioning(true);
    setTransitionErr("");
    const { data, error } = await supabase.functions.invoke("orders-transition", {
      body: { order_id: selected.id, new_stage: nextStage },
    });
    setTransitioning(false);
    if (error || (data as { error?: string })?.error) {
      setTransitionErr((data as { error?: string })?.error ?? error?.message ?? "Transition failed.");
      return;
    }
    setSelected({ ...selected, stage: nextStage });
    setNextStage("");
    load();
  }

  if (loading) return <div className="center-note">Loading orders…</div>;

  return (
    <>
      <div className="row-actions">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search order # or customer"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 180 }} value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}>
          {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "All stages" : s}</option>)}
        </select>
        <span className="sub">{filtered.length} of {rows.length}</span>
      </div>

      {!filtered.length ? (
        <div className="center-note">No orders match. Orders arrive from Shopify once a customer checks out.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Order #</th><th>Customer</th><th>Stage</th><th>Carrier</th><th>Updated</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openDetail(r)}>
                  <td>{r.order_number}</td>
                  <td>{r.contacts?.name ?? "—"}</td>
                  <td><span className={`pill${r.stage === "exception" ? " warn" : ""}`}>{r.stage}</span></td>
                  <td>{r.ltl_carrier ?? "—"}</td>
                  <td>{dt(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <>
          <div className="scrim" onClick={() => setSelected(null)} />
          <aside className="drawer" role="dialog" aria-label={`Order ${selected.order_number}`}>
            <div className="dhead">
              <div>
                <div className="k">Order</div>
                <div className="v">{selected.order_number}</div>
              </div>
              <button className="x" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </div>
            <div className="dbody">
              <p><strong>Customer:</strong> {selected.contacts?.name ?? "—"} ({selected.contacts?.email ?? "no email"})</p>
              <p><strong>Current stage:</strong> <span className="pill">{selected.stage}</span></p>
              {selected.ltl_carrier && <p><strong>Carrier:</strong> {selected.ltl_carrier} {selected.pro_number && `(PRO ${selected.pro_number})`}</p>}
              {selected.tracking_url && <p><a href={selected.tracking_url} target="_blank" rel="noreferrer">Track shipment</a></p>}

              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "16px 0 4px" }}>
                Stage history
              </h3>
              {(selected.order_stage_events ?? [])
                .slice()
                .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
                .map((e) => (
                  <div key={e.id} className="sub" style={{ padding: "3px 0" }}>
                    {e.stage} — {dt(e.occurred_at)} <span style={{ opacity: 0.6 }}>({e.source})</span>
                  </div>
                ))}

              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "16px 0 4px" }}>
                Transition stage
              </h3>
              <p className="sub">
                Moving to <strong>shipped</strong> or <strong>delivery scheduled</strong> automatically emails the
                customer a status link. Moving to <strong>delivered</strong> does not email immediately — the
                +24h care note and +30d follow-up fire on their own schedule.
              </p>
              <div className="row-actions">
                <select className="input" style={{ maxWidth: 200 }} value={nextStage}
                  onChange={(e) => setNextStage(e.target.value as OrderStage)}>
                  <option value="">Choose next stage…</option>
                  {STAGES.filter((s) => s !== selected.stage).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="btn" onClick={transition} disabled={!nextStage || transitioning}>
                  {transitioning ? "Updating…" : "Update stage"}
                </button>
              </div>
              {transitionErr && <div className="sub" style={{ color: "#b23" }}>{transitionErr}</div>}

              <div className="row-actions" style={{ marginTop: 18 }}>
                <button className="btn ghost" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
