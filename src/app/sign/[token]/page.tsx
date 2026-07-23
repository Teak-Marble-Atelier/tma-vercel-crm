// app/sign/[token]/page.tsx
// Public signing surface. One page, five states: loading → active signing,
// waiting (sequential, not your turn), already signed, expired/voided, done.
// Neutral premium styling — this page serves all three entities, so it stays
// entity-agnostic; the document itself carries the brand.
'use client';

import { useEffect, useState } from 'react';

type EnvelopeView = {
  envelope_number: string; title: string; doc_type: string;
  role_label: string; name: string;
  document_url: string; source_sha256: string;
  signing_order: Array<{ role_label: string; name: string; status: string; routing_order: number }>;
  consent_text: string;
};

export default function SignPage({ params }: { params: { token: string } }) {
  const [state, setState] = useState<'loading'|'active'|'waiting'|'signed'|'gone'|'done'>('loading');
  const [env, setEnv] = useState<EnvelopeView | null>(null);
  const [msg, setMsg] = useState('');
  const [typedName, setTypedName] = useState('');
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/envelopes/${params.token}`);
      const j = await r.json();
      if (r.status === 425) { setMsg(j.message); setState('waiting'); return; }
      if (r.status === 410 || r.status === 404) { setMsg(j.message ?? 'This signing link is no longer available.'); setState('gone'); return; }
      if (j.status === 'already_signed') { setMsg(`Signed ${new Date(j.signed_at).toLocaleString()}.`); setState('signed'); return; }
      setEnv(j); setState('active');
    })();
  }, [params.token]);

  async function sign() {
    setError(''); setSubmitting(true);
    const r = await fetch(`/api/envelopes/${params.token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typed_name: typedName }),
    });
    const j = await r.json();
    setSubmitting(false);
    if (!r.ok) { setError(j.message ?? j.error ?? 'Something went wrong — please try again.'); return; }
    setMsg(j.message); setState('done');
  }

  const S = styles;
  if (state === 'loading') return <div style={S.page}><div style={S.card}>Preparing your document…</div></div>;

  if (state !== 'active') {
    return (
      <div style={S.page}><div style={S.card}>
        <div style={S.kicker}>{state === 'done' ? 'SIGNATURE RECORDED' : state === 'signed' ? 'ALREADY SIGNED' : state === 'waiting' ? 'AWAITING AN EARLIER SIGNATURE' : 'UNAVAILABLE'}</div>
        <p style={S.body}>{msg}</p>
        {state === 'done' && <p style={{...S.body, color:'#6a6a6a'}}>You may close this page. A fully executed copy will be delivered to all parties once every signature is complete.</p>}
      </div></div>
    );
  }

  const nameMatches = typedName.trim().toLowerCase() === env!.name.trim().toLowerCase();
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.kicker}>SIGNATURE REQUESTED · {env!.envelope_number}</div>
        <h1 style={S.h1}>{env!.title}</h1>
        <p style={S.body}>You are signing as <b>{env!.role_label}</b>. Review the complete document below before signing.</p>

        {/* Signing order — shows the signer where they stand */}
        <div style={S.orderRow}>
          {env!.signing_order.map((s, i) => (
            <div key={i} style={{...S.orderChip, ...(s.status === 'signed' ? S.chipDone : s.name === env!.name ? S.chipYou : {})}}>
              {s.status === 'signed' ? '✓ ' : ''}{s.role_label}
            </div>
          ))}
        </div>

        <iframe src={env!.document_url} style={S.viewer} title="Document" />
        <div style={S.hashLine}>Document integrity: SHA-256 {env!.source_sha256.slice(0, 16)}… (frozen at send — this is the exact document all parties sign)</div>

        <div style={S.signBlock}>
          <label style={S.label}>
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} style={{marginRight: 10}} />
            {env!.consent_text}
          </label>
          <label style={{...S.label, display:'block', marginTop: 14}}>
            Type your full legal name exactly as it appears on the document ({env!.name}):
          </label>
          <input value={typedName} onChange={(e) => setTypedName(e.target.value)}
            placeholder={env!.name} style={S.input} autoComplete="off" />
          {typedName && !nameMatches && (
            <div style={S.warn}>The name typed does not match the signer name on this envelope. If your legal name differs from what we have on file, contact the sender before signing.</div>
          )}
          {error && <div style={S.warn}>{error}</div>}
          <button onClick={sign} disabled={!consented || !typedName.trim() || submitting} style={{...S.button, opacity: (!consented || !typedName.trim() || submitting) ? 0.45 : 1}}>
            {submitting ? 'Recording signature…' : 'Sign Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#EFEDE8', fontFamily: 'Georgia, serif', display: 'flex', justifyContent: 'center', padding: '40px 16px' },
  card: { background: '#fff', maxWidth: 860, width: '100%', padding: '36px 40px', border: '1px solid #ddd', boxShadow: '0 2px 14px rgba(0,0,0,.08)', height: 'fit-content' },
  kicker: { fontSize: 11, letterSpacing: 3, color: '#8a7340', marginBottom: 10 },
  h1: { fontSize: 22, margin: '0 0 10px', color: '#222' },
  body: { fontSize: 14.5, lineHeight: 1.6, color: '#333' },
  orderRow: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' },
  orderChip: { fontSize: 12, padding: '5px 12px', border: '1px solid #bbb', borderRadius: 3, color: '#666' },
  chipDone: { borderColor: '#3a7a3a', color: '#3a7a3a', background: '#f2f8f2' },
  chipYou: { borderColor: '#8a7340', color: '#5c4d2a', background: '#faf6ec', fontWeight: 600 },
  viewer: { width: '100%', height: 520, border: '1px solid #ccc', marginTop: 8 },
  hashLine: { fontSize: 11, color: '#999', marginTop: 6, fontFamily: 'monospace' },
  signBlock: { marginTop: 22, paddingTop: 18, borderTop: '2px solid #C4A55A' },
  label: { fontSize: 13, lineHeight: 1.55, color: '#333' },
  input: { width: '100%', fontSize: 16, padding: '10px 12px', marginTop: 6, border: '1px solid #aaa', fontFamily: 'Georgia, serif' },
  warn: { fontSize: 12.5, color: '#7a0000', background: '#fdf0f0', padding: '8px 10px', marginTop: 8 },
  button: { marginTop: 16, fontSize: 15, padding: '12px 28px', background: '#2B2B2B', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 1 },
};
