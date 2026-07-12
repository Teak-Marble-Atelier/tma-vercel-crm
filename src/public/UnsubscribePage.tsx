import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Human-facing unsubscribe page. Lives in the SPA because Supabase's shared
// functions domain forces text/plain + a sandbox CSP on any HTML response, so
// the branded page cannot be served from the Edge Function. This page renders
// on Vercel (like QuotePage/StatusPage) and calls the headless
// mail-webhook-unsubscribe function to perform the actual suppression.
//
// Scanner-safe: nothing is suppressed on load. A prefetching mail scanner just
// sees the confirm screen; suppression only happens when the button POSTs.

const FN =
  (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/+$/, "") +
  "/functions/v1/mail-webhook-unsubscribe";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Phase = "confirm" | "working" | "done" | "error";

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const email = (params.get("e") ?? "").trim().toLowerCase();
  const token = params.get("t") ?? "";
  const valid = useMemo(() => EMAIL.test(email) && UUID.test(token), [email, token]);

  const [phase, setPhase] = useState<Phase>("confirm");

  async function confirm() {
    setPhase("working");
    try {
      const url = `${FN}?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
      const res = await fetch(url, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      setPhase(res.ok && body?.ok ? "done" : "error");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.brand}>Teak &amp; Marble Atelier</div>

        {!valid ? (
          <>
            <h1 style={s.h1}>This link isn’t valid</h1>
            <p style={s.p}>
              The unsubscribe link is incomplete or malformed. If you keep receiving mail you’d
              rather not, reply to any message and a concierge will help.
            </p>
          </>
        ) : phase === "done" ? (
          <>
            <h1 style={s.h1}>You’re unsubscribed</h1>
            <p style={s.p}>
              <span style={s.addr}>{email}</span> will no longer receive emails from us.
            </p>
            <p style={s.fine}>
              Changed your mind, or need help with an order? Just reply to any message we’ve sent
              and a concierge will take care of it.
            </p>
          </>
        ) : phase === "error" ? (
          <>
            <h1 style={s.h1}>Something went wrong</h1>
            <p style={s.p}>
              We couldn’t complete that just now. Please try again, or reply to any message and a
              concierge will remove you manually.
            </p>
            <button style={s.btn} onClick={confirm}>Try again</button>
          </>
        ) : (
          <>
            <h1 style={s.h1}>Unsubscribe from our emails?</h1>
            <p style={s.p}>
              You’re about to stop emails to <span style={s.addr}>{email}</span>.
            </p>
            <button style={s.btn} onClick={confirm} disabled={phase === "working"}>
              {phase === "working" ? "Working…" : "Confirm unsubscribe"}
            </button>
            <p style={s.fine}>
              This includes order and delivery updates. If you have an active order, we recommend
              staying subscribed so we can reach you — or reply to any message instead.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const BROWN = "#7A3F28", GOLD = "#C4A55A", CARRARA = "#F0EEE9";
const s: Record<string, React.CSSProperties> = {
  wrap: {
    margin: 0, background: CARRARA, color: "#241a15", minHeight: "100vh",
    display: "grid", placeItems: "center", padding: 24,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  },
  card: {
    background: "#fff", maxWidth: 460, width: "100%", border: "1px solid #e6e0d7",
    borderRadius: 14, padding: "34px 30px", boxShadow: "0 1px 3px rgba(0,0,0,.05)",
  },
  brand: { fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: GOLD, fontWeight: 700 },
  h1: { fontSize: 21, margin: "10px 0 12px", color: BROWN },
  p: { margin: "0 0 14px", lineHeight: 1.55 },
  addr: { fontWeight: 600, color: BROWN, wordBreak: "break-all" },
  btn: {
    font: "inherit", fontWeight: 600, cursor: "pointer", borderRadius: 9, padding: "11px 20px",
    background: BROWN, color: "#fff", border: `1px solid ${BROWN}`,
  },
  fine: { fontSize: 13, color: "#6b6157", marginTop: 16, lineHeight: 1.55 },
};
