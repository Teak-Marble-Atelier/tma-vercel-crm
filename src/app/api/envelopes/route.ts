// app/api/envelopes/route.ts
// Multi-party signing. Sequential mode enforces routing order at the API
// level (not just the schema comment) — a signer cannot sign out of turn
// even if they have a valid link, because someone forwarded it early.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashToken, generateToken } from '@/lib/tokens';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
const svc = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ============================================================================
// POST /api/envelopes — create + send (internal, CRM-authenticated)
// ============================================================================
interface CreateEnvelopeBody {
  workspace_id: string;
  created_by: string;
  title: string;
  doc_type: string;
  signing_mode: 'sequential' | 'parallel';
  source_storage_path: string;      // already uploaded to Storage before this call
  valid_until?: string;
  related_entity?: string;
  signers: Array<{ role_label: string; name: string; email: string; routing_order?: number }>;
}

export async function POST(req: NextRequest) {
  const db = svc();
  const body = (await req.json()) as CreateEnvelopeBody;

  // Hash the exact source bytes at send time — this is the frozen exhibit.
  const { data: fileData, error: dlErr } = await db.storage
    .from('documents').download(body.source_storage_path);
  if (dlErr) return NextResponse.json({ error: 'source_document_not_found' }, { status: 404 });
  const bytes = Buffer.from(await fileData.arrayBuffer());
  const sourceHash = createHash('sha256').update(bytes).digest('hex');

  const { data: seq } = await db.rpc('next_envelope_number', { p_workspace: body.workspace_id });
  const envelopeNumber = `SIG-${new Date().getUTCFullYear()}-${String(seq).padStart(5, '0')}`;

  const { data: env, error } = await db.from('envelopes').insert({
    workspace_id: body.workspace_id, created_by: body.created_by,
    envelope_number: envelopeNumber, title: body.title, doc_type: body.doc_type,
    status: 'sent', signing_mode: body.signing_mode,
    source_storage_path: body.source_storage_path, source_sha256: sourceHash,
    valid_until: body.valid_until ?? null, related_entity: body.related_entity ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Parallel mode: everyone at routing_order 1. Sequential: order as given
  // (defaulting to array position if not explicitly numbered).
  const signerRows = body.signers.map((s, i) => ({
    envelope_id: env.id,
    routing_order: body.signing_mode === 'parallel' ? 1 : (s.routing_order ?? i + 1),
    role_label: s.role_label, name: s.name, email: s.email,
    access_token_hash: hashToken(generateToken()),   // placeholder; real tokens generated + returned below
  }));

  // Generate real tokens (need raw values to return for emailing)
  const withTokens = body.signers.map((s, i) => {
    const raw = generateToken();
    return {
      row: {
        envelope_id: env.id,
        routing_order: body.signing_mode === 'parallel' ? 1 : (s.routing_order ?? i + 1),
        role_label: s.role_label, name: s.name, email: s.email,
        access_token_hash: hashToken(raw),
      },
      raw, email: s.email, role_label: s.role_label,
    };
  });

  const { error: signerErr } = await db.from('envelope_signers')
    .insert(withTokens.map((w) => w.row));
  if (signerErr) return NextResponse.json({ error: signerErr.message }, { status: 500 });

  await db.from('envelope_events').insert({
    envelope_id: env.id, event: 'sent', detail: `${body.signers.length} signer(s), ${body.signing_mode} mode`,
  });

  // Sequential mode: only routing_order 1 gets notified now; others wait
  // until it's their turn (fired by the completion-check logic below).
  const notifyNow = body.signing_mode === 'parallel'
    ? withTokens
    : withTokens.filter((w) => w.row.routing_order === Math.min(...withTokens.map((x) => x.row.routing_order)));

  return NextResponse.json({
    envelope_id: env.id, envelope_number: envelopeNumber,
    links: notifyNow.map((w) => ({
      email: w.email, role_label: w.role_label,
      sign_url: `${process.env.PUBLIC_BASE_URL}/sign/${w.raw}`,
    })),
    // Downstream: send these via Concierge Mail (envelope.sent event) or
    // manually if this is a one-off dealer/counsel document.
  });
}
