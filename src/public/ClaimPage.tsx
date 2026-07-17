// src/public/ClaimPage.tsx
// PUBLIC customer surface at /claim/:token. No CRM session — reads and creates
// a claim purely through the claims-intake Edge Function, which authorizes by
// the SAME magic_link_tokens family order-status/quotes-public use (order-
// scoped, not claim-scoped) — a customer's existing order-status or quote link
// token also works here.
//
// NOTE (flag, don't hide): evidence upload (the 4 angle photos + packaging
// photo + mechanical-defect video that evidenceGaps() checks for) has no
// Storage wiring anywhere yet — no signed-upload route, no bucket policy, no
// claim_evidence insert path. This page shows the draft + window + the
// evidence checklist honestly, but "Submit Claim" will correctly fail the
// evidence gate until that upload piece is built. Surfacing that gap rather
// than faking a working uploader.

import { useState } from "react";
import { useParams } from "react-router-dom";

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-intake`;

const CLAIM_TYPES: Array<{ value: string; label: string }> = [
  { value: "delivery_damage", label: "Delivery damage" },
  { value: "defect_mechanical", label: "Mechanical defect" },
  { value: "defect_cosmetic", label: "Cosmetic defect" },
  { value: "missing_parts", label: "Missing parts" },
];

interface Draft {
  claim_number: string;
  claim_id: string;
  window_closes_at: string | null;
  evidence_required: string[];
  upload_instructions: string;
}

const longDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function daysLeft(closesAt: string | null): number | null {
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export default function ClaimPage() {
  const { token } = useParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitted, setSubmitted] = useState<{ message: string } | null>(null);

  // intake form
  const [claimType, setClaimType] = useState("delivery_damage");
  const [description, setDescription] = useState("");
  const [freightNoted, setFreightNoted] = useState(false);
  const [notedDetail, setNotedDetail] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  async function createDraft() {
    setErr("");
    if (!description.trim()) { setErr("Please describe the issue."); return; }
    setCreating(true);
    try {
      const res = await fetch(FN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, claim_type: claimType, description,
          freight_bill_noted: freightNoted, noted_detail: notedDetail,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setErr(body.error ?? "Something went wrong. Please try again."); return; }
      setDraft(body);
    } catch { setErr("Network error. Please try again."); }
    finally { setCreating(false); }
  }

  async function submitClaim() {
    if (!draft) return;
    setErr("");
    setSubmitting(true);
    try {
      const res = await fetch(FN, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, claim_id: draft.claim_id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErr(
          body.error?.startsWith("evidence_incomplete")
            ? "A few items are still missing — see the checklist below."
            : (body.error ?? "Something went wrong. Please try again."),
        );
        return;
      }
      setSubmitted(body);
    } catch { setErr("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  if (!token) return <Frame><Note title="Claim link not found">
    This link doesn't match a claim on file. Please check the link, or write to
    concierge@teakandmarbleatelier.com.</Note></Frame>;

  if (submitted) {
    return (
      <Frame>
        <div className="q-accepted">
          <div className="q-check">✓</div>
          <p><strong>Claim submitted.</strong> {submitted.message}</p>
        </div>
      </Frame>
    );
  }

  if (draft) {
    const remaining = daysLeft(draft.window_closes_at);
    return (
      <Frame>
        <div className="q-head">
          <div><div className="q-eyebrow">Claim</div><div className="q-number">{draft.claim_number}</div></div>
          {remaining !== null && draft.window_closes_at && (
            <div className="q-valid">
              Claim window closes in<br />
              <strong>{remaining} day{remaining === 1 ? "" : "s"}</strong>
              <div className="q-fine">{longDate(draft.window_closes_at)}</div>
            </div>
          )}
        </div>

        <div className="q-terms">
          <p>{draft.upload_instructions}</p>
        </div>

        {draft.evidence_required.length > 0 && (
          <div className="q-terms">
            <p style={{ fontWeight: "bold" }}>Still needed:</p>
            <ul>{draft.evidence_required.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </div>
        )}

        {err && <div className="q-err">{err}</div>}

        <div className="q-accept">
          <button className="q-btn" onClick={submitClaim} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Claim"}
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="q-head">
        <div><div className="q-eyebrow">Warranty &amp; Defect Claim</div></div>
      </div>

      <div className="q-accept">
        <h3>Tell us what happened</h3>
        <div className="q-fields">
          <select value={claimType} onChange={(e) => setClaimType(e.target.value)}>
            {CLAIM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="q-fields">
          <textarea
            placeholder="Describe the issue"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>
        <label className="q-asf">
          <input type="checkbox" checked={freightNoted} onChange={(e) => setFreightNoted(e.target.checked)} />
          <span>Damage was noted on the freight bill at delivery, before signing.</span>
        </label>
        {freightNoted && (
          <div className="q-fields">
            <input
              placeholder="What was noted on the freight bill?"
              value={notedDetail}
              onChange={(e) => setNotedDetail(e.target.value)}
            />
          </div>
        )}
        {err && <div className="q-err">{err}</div>}
        <button className="q-btn" onClick={createDraft} disabled={creating}>
          {creating ? "Opening…" : "Start Claim"}
        </button>
      </div>
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
