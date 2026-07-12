// src/public/StatusPage.tsx
// PUBLIC customer surface at /status/:token. Reads order status through the
// order-status Edge Function (magic-link token path). Same payload Marcus
// reads, by design — the screen can never disagree with the voice agent.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-status`;

const STAGES = ["received", "processing", "shipped", "in_transit", "delivery_scheduled", "delivered"];
const longDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

export default function StatusPage() {
  const { token } = useParams();
  const [state, setState] = useState<"loading" | "ok" | "expired" | "notfound" | "error">("loading");
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN}?token=${encodeURIComponent(token ?? "")}`);
        const body = await res.json();
        if (res.status === 410) { setState("expired"); setMsg(body.message ?? ""); return; }
        if (res.status === 404) { setState("notfound"); return; }
        if (!res.ok) { setState("error"); return; }
        setD(body); setState("ok");
      } catch { setState("error"); }
    })();
  }, [token]);

  if (state === "loading") return <Frame><p className="q-muted">Loading your order…</p></Frame>;
  if (state === "notfound") return <Frame><Note title="Order not found">
    This link doesn’t match an order on file. Please check the link, or write to
    concierge@teakandmarbleatelier.com.</Note></Frame>;
  if (state === "error") return <Frame><Note title="Something went wrong">
    We couldn’t load your order just now. Please try again shortly.</Note></Frame>;
  if (state === "expired") return <Frame><Note title="This status link has expired">
    {msg || "Reply to your order confirmation or write concierge@teakandmarbleatelier.com and we’ll send a fresh one."}
    <div className="q-contact">concierge@teakandmarbleatelier.com</div></Note></Frame>;

  const w = d.estimated_window ?? {};
  const f = d.freight ?? {};
  const currentIdx = STAGES.indexOf(d.stage);
  const isException = d.stage === "exception";

  return (
    <Frame>
      <div className="q-head">
        <div><div className="q-eyebrow">Order</div><div className="q-number">{d.order_number}</div></div>
        <div className="q-valid"><span className={`q-stagepill${isException ? " q-exc" : ""}`}>{d.stage_label}</span></div>
      </div>

      {!isException && (
        <div className="s-track">
          {STAGES.map((st, i) => (
            <div key={st} className={`s-step${i <= currentIdx ? " s-done" : ""}${i === currentIdx ? " s-now" : ""}`}>
              <div className="s-dot" />
              <div className="s-label">{st.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
      )}

      <div className="s-window">
        <h3>Estimated delivery</h3>
        <div className="s-win-dates">{longDate(w.delivery_earliest)} — {longDate(w.delivery_latest)}</div>
        <p className="q-fine">{w.disclaimer}</p>
      </div>

      {(f.carrier || f.tracking_url) && (
        <div className="s-freight">
          <h3>Freight</h3>
          <div className="s-grid">
            <span>Carrier</span><span>{f.carrier ?? "—"}</span>
            <span>PRO #</span><span>{f.pro_number ?? "—"}</span>
            {f.white_glove && (<><span>Service</span><span>White-glove delivery</span></>)}
            {f.delivery_appointment && (<><span>Appointment</span><span>{longDate(f.delivery_appointment)}</span></>)}
          </div>
          {f.tracking_url && <a className="q-btn q-btn-out" href={f.tracking_url} target="_blank" rel="noreferrer">Track shipment</a>}
        </div>
      )}

      {Array.isArray(d.prep_checklist) && d.prep_checklist.length > 0 && (
        <div className="s-prep">
          <h3>Prepare for delivery</h3>
          <ul>{d.prep_checklist.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
        </div>
      )}

      <div className="s-inspect">{d.inspection_reminder}</div>
      <div className="q-contact">{d.concierge}</div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="q-page" data-side="tma">
      <div className="q-band"><div className="q-brand">TEAK &amp; MARBLE ATELIER</div></div>
      <div className="q-card">{children}</div>
      <div className="q-foot">Teak &amp; Marble Atelier, Ltd. · 16192 Coastal Highway, Lewes, Delaware 19958</div>
    </div>
  );
}
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="q-note"><h2>{title}</h2><p>{children}</p></div>;
}
