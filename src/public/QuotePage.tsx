// src/public/QuotePage.tsx
// PUBLIC customer surface at /q/:token. No CRM session — reads and accepts a
// quote purely through the quotes-public Edge Function, which authorizes by
// token hash. Never imports the app's supabase client (that carries CRM auth).

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-public`;

interface Line {
  title: string; sku?: string; qty: number; unit_price: number;
  line_total: number; white_glove_selected: boolean; all_sales_final: boolean;
}
interface QuoteView {
  quote_number: string; status: string; valid_until: string;
  lines: Line[]; subtotal: number; white_glove_fee: number; total: number;
  terms_snapshot: any; requires_asf_acknowledgment: boolean; pdf_available: boolean;
}

const usd = (n: number) =>
  Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
const longDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function QuotePage() {
  const { token } = useParams();
  const [state, setState] = useState<"loading" | "ok" | "expired" | "notfound" | "error">("loading");
  const [q, setQ] = useState<QuoteView | null>(null);
  const [msg, setMsg] = useState("");

  // accept form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [asf, setAsf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState<{ at: string } | null>(null);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN}?token=${encodeURIComponent(token ?? "")}`);
        const body = await res.json();
        if (res.status === 410) { setState("expired"); setMsg(body.message ?? ""); return; }
        if (res.status === 404) { setState("notfound"); return; }
        if (!res.ok) { setState("error"); return; }
        setQ(body);
        if (body.status === "accepted") setAccepted({ at: body.accepted_at ?? "" });
        setState("ok");
      } catch { setState("error"); }
    })();
  }, [token]);

  async function accept() {
    setFormErr("");
    if (!name.trim() || !email.trim()) { setFormErr("Please enter your name and email."); return; }
    if (q?.requires_asf_acknowledgment && !asf) {
      setFormErr("Please acknowledge the all-sales-final terms before accepting."); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${FN}?token=${encodeURIComponent(token ?? "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer_name: name, signer_email: email, asf_acknowledged: asf }),
      });
      const body = await res.json();
      if (res.status === 410) { setState("expired"); setMsg(body.message ?? ""); return; }
      if (!res.ok) { setFormErr(body.message ?? body.error ?? "Something went wrong. Please try again."); return; }
      setAccepted({ at: body.accepted_at });
    } catch { setFormErr("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  if (state === "loading") return <Frame><p className="q-muted">Preparing your proposal…</p></Frame>;
  if (state === "notfound") return <Frame><Note title="Proposal not found">
    This link doesn’t match a proposal on file. Please check the link, or write to
    concierge@teakandmarbleatelier.com.</Note></Frame>;
  if (state === "error") return <Frame><Note title="Something went wrong">
    We couldn’t load this proposal just now. Please try again shortly, or write to
    concierge@teakandmarbleatelier.com.</Note></Frame>;
  if (state === "expired") return <Frame><Note title="This proposal has expired">
    {msg || "Request a refreshed proposal and our concierge team will prepare current terms for you."}
    <div className="q-contact">concierge@teakandmarbleatelier.com</div></Note></Frame>;

  const g = q!.terms_snapshot?.global ?? {};

  return (
    <Frame>
      <div className="q-head">
        <div>
          <div className="q-eyebrow">Proposal</div>
          <div className="q-number">{q!.quote_number}</div>
        </div>
        <div className="q-valid">Prepared for you through<br /><strong>{longDate(q!.valid_until)}</strong></div>
      </div>

      <table className="q-table">
        <thead><tr><th>Item</th><th className="q-c">Qty</th><th className="q-r">Unit</th><th className="q-r">Total</th></tr></thead>
        <tbody>
          {q!.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.title}{l.white_glove_selected && <span className="q-tag">White-glove</span>}{l.sku && <div className="q-sku">{l.sku}</div>}</td>
              <td className="q-c">{l.qty}</td>
              <td className="q-r">{usd(l.unit_price)}</td>
              <td className="q-r">{usd(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="q-totals">
        <div><span>Subtotal</span><span>{usd(q!.subtotal)}</span></div>
        {q!.white_glove_fee > 0 && <div><span>White-glove delivery</span><span>{usd(q!.white_glove_fee)}</span></div>}
        <div className="q-grand"><span>Total</span><span>{usd(q!.total)}</span></div>
      </div>

      {(g.freight || g.processing) && (
        <div className="q-terms">
          {g.processing && <p>{g.processing}</p>}
          {g.freight && <p>{g.freight}</p>}
          {g.white_glove && <p>{g.white_glove}</p>}
          {g.estimates_disclaimer && <p className="q-fine">{g.estimates_disclaimer}</p>}
        </div>
      )}

      {accepted ? (
        <div className="q-accepted">
          <div className="q-check">✓</div>
          <p><strong>Accepted.</strong> Your acceptance has been recorded{accepted.at ? ` on ${longDate(accepted.at)}` : ""}.
          Our concierge team will be in touch to coordinate next steps.</p>
        </div>
      ) : (
        <div className="q-accept">
          <h3>Accept this proposal</h3>
          <p className="q-muted">Entering your name below constitutes your electronic signature.</p>
          <div className="q-fields">
            <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {q!.requires_asf_acknowledgment && (
            <label className="q-asf">
              <input type="checkbox" checked={asf} onChange={(e) => setAsf(e.target.checked)} />
              <span>I understand this proposal includes product lines that are <strong>all sales final</strong> for non-defective items.</span>
            </label>
          )}
          {formErr && <div className="q-err">{formErr}</div>}
          <button className="q-btn" onClick={accept} disabled={submitting}>
            {submitting ? "Recording…" : "Accept Proposal"}
          </button>
        </div>
      )}
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
