import { useState } from "react";
import { supabase } from "../lib/supabase";

// Passwordless magic-link sign-in. Dan creates the first users in Supabase
// Auth; everyone else just enters their email and clicks the link.
export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(null); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="login">
      <div className="card2">
        <div className="eyebrow">Roark · Teak &amp; Marble</div>
        <h2>Sign in</h2>
        <p>One workspace, two sides. Access is scoped to yours.</p>
        <div className="rule" />
        {sent ? (
          <p style={{ color: "var(--ink)" }}>
            Check {email} for a sign-in link. You can close this tab once you click it.
          </p>
        ) : (
          <>
            <input
              className="input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && send()}
            />
            {err && <p style={{ color: "#c0392b", marginTop: 10 }}>{err}</p>}
            <button
              className="btn"
              style={{ width: "100%", marginTop: 14 }}
              disabled={!email || busy}
              onClick={send}
            >
              {busy ? "Sending…" : "Email me a link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
