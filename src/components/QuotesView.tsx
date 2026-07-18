import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../state/Session";
import type { Quote } from "../lib/types";

// Quotes view: read-focused by design. Almost every field on a quote is
// either computed at creation (totals, terms_snapshot, PDF) or an audit
// trail driven by the customer's own actions (viewed/accepted) — none of
// that belongs behind a generic field-editing form. The one legitimate
// manual action a staff member needs is withdrawing a quote (e.g. "customer
// called, cancel this") — that's the only mutation this view exposes.

const STATUS_OPTIONS = ["all", "draft", "sent", "viewed", "accepted", "expired", "withdrawn"] as const;
const TERMINAL = new Set(["accepted", "expired", "withdrawn"]);

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function QuotesView() {
  const { current } = useSession();
  const [rows, setRows] = useState<Quote[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [selected, setSelected] = useState<Quote | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    const { data } = await supabase
      .from("quotes")
      .select("*, contacts(name, email), quote_line_items(*)")
      .eq("workspace_id", current.id)
      .order("created_at", { ascending: false });
    setRows((data as unknown as Quote[]) ?? []);
    setLoading(false);
  }, [current]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    const s = q.trim().toLowerCase();
    if (s) {
      r = r.filter((x) =>
        [x.quote_number, x.contacts?.name, x.contacts?.email].some((v) => v?.toLowerCase().includes(s)));
    }
    return r;
  }, [rows, statusFilter, q]);

  async function openDetail(quote: Quote) {
    setSelected(quote);
    setPdfUrl(null);
    if (quote.pdf_storage_path) {
      setPdfLoading(true);
      const { data } = await supabase.storage.from("documents").createSignedUrl(quote.pdf_storage_path, 3600);
      setPdfUrl(data?.signedUrl ?? null);
      setPdfLoading(false);
    }
  }

  async function withdraw() {
    if (!selected) return;
    setWithdrawing(true);
    const { error } = await supabase.from("quotes").update({ status: "withdrawn" }).eq("id", selected.id);
    setWithdrawing(false);
    if (!error) {
      setSelected({ ...selected, status: "withdrawn" });
      load();
    }
  }

  if (loading) return <div className="center-note">Loading quotes…</div>;

  return (
    <>
      <div className="row-actions">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search quote # or customer"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 160 }} value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
        <span className="sub">{filtered.length} of {rows.length}</span>
      </div>

      {!filtered.length ? (
        <div className="center-note">No quotes match. Quotes are created from "New Quote" or by Aria on a sales call.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Quote #</th><th>Customer</th><th>Status</th><th>Total</th><th>Valid until</th><th>Created</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openDetail(r)}>
                  <td>{r.quote_number}</td>
                  <td>{r.contacts?.name ?? "—"}</td>
                  <td><span className="pill">{r.status}</span></td>
                  <td>{usd(r.total)}</td>
                  <td>{new Date(r.valid_until).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td>{dt(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <>
          <div className="scrim" onClick={() => setSelected(null)} />
          <aside className="drawer" role="dialog" aria-label={`Quote ${selected.quote_number}`}>
            <div className="dhead">
              <div>
                <div className="k">Quote</div>
                <div className="v">{selected.quote_number}</div>
              </div>
              <button className="x" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </div>
            <div className="dbody">
              <p><strong>Customer:</strong> {selected.contacts?.name ?? "—"} ({selected.contacts?.email ?? "no email"})</p>
              <p><strong>Status:</strong> <span className="pill">{selected.status}</span></p>
              <p><strong>Total:</strong> {usd(selected.total)}
                {selected.white_glove_fee > 0 && ` (incl. ${usd(selected.white_glove_fee)} white-glove)`}</p>

              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "16px 0 4px" }}>
                Line items
              </h3>
              {(selected.quote_line_items ?? []).map((l) => (
                <div key={l.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  {l.title} {l.white_glove_selected && <span className="pill">White-glove</span>}
                  {l.all_sales_final && <span className="pill">All sales final</span>}
                  <div className="sub">{l.sku ?? "no sku"} · qty {l.qty} · {usd(l.unit_price)} each · {usd(l.line_total)}</div>
                </div>
              ))}

              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "16px 0 4px" }}>
                Timeline
              </h3>
              <p className="sub">Sent: {dt(selected.sent_at)}</p>
              <p className="sub">First viewed: {dt(selected.first_viewed_at)}</p>
              <p className="sub">Accepted: {dt(selected.accepted_at)}</p>

              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "16px 0 4px" }}>
                Proposal PDF
              </h3>
              {selected.pdf_storage_path ? (
                pdfLoading ? <p className="sub">Preparing link…</p> :
                pdfUrl ? <a href={pdfUrl} target="_blank" rel="noreferrer">Download Proposal PDF</a> :
                <p className="sub">Couldn't generate a link — check Storage RLS is applied.</p>
              ) : <p className="sub">No PDF was generated for this quote.</p>}

              <div className="row-actions" style={{ marginTop: 18 }}>
                {!TERMINAL.has(selected.status) && (
                  <button className="btn ghost" style={{ color: "#b23", borderColor: "#e3b9b9" }}
                    onClick={withdraw} disabled={withdrawing}>
                    {withdrawing ? "Withdrawing…" : "Withdraw quote"}
                  </button>
                )}
                <button className="btn ghost" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
