// app/api/envelopes/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashToken } from '@/lib/tokens';
import { assembleFinalPackage } from '@/lib/pdf/envelope-final';

export const runtime = 'nodejs';
const svc = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ============================================================================
// GET /api/envelopes/[token] — signer view. Returns document + status +
// whether it's this signer's turn (sequential mode gating).
// ============================================================================
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const db = svc();
  const { data: signer } = await db.from('envelope_signers')
    .select('*, envelopes(*)').eq('access_token_hash', hashToken(params.token)).single();
  if (!signer) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const env = signer.envelopes;

  if (env.status === 'voided') {
    return NextResponse.json({ error: 'voided', message: 'This document has been withdrawn.' }, { status: 410 });
  }
  if (env.valid_until && new Date(env.valid_until) < new Date() && env.status !== 'completed') {
    return NextResponse.json({ error: 'expired', message: 'This signing request has expired. Contact us for a new copy.' }, { status: 410 });
  }
  if (signer.status === 'signed') {
    return NextResponse.json({ status: 'already_signed', signed_at: signer.signed_at });
  }

  // Sequential gating: is it this signer's turn?
  if (env.signing_mode === 'sequential') {
    const { data: earlier } = await db.from('envelope_signers')
      .select('status').eq('envelope_id', env.id).lt('routing_order', signer.routing_order);
    const allEarlierSigned = (earlier ?? []).every((s) => s.status === 'signed');
    if (!allEarlierSigned) {
      return NextResponse.json({
        status: 'waiting', message: 'This document is awaiting an earlier signature before it reaches you. We will notify you the moment it is your turn.',
      }, { status: 425 });   // 425 Too Early
    }
  }

  if (signer.status === 'pending') {
    await db.from('envelope_signers').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', signer.id);
    await db.from('envelope_events').insert({ envelope_id: env.id, signer_id: signer.id, event: 'viewed' });
  }

  const { data: allSigners } = await db.from('envelope_signers')
    .select('role_label, name, status, routing_order').eq('envelope_id', env.id).order('routing_order');

  return NextResponse.json({
    envelope_number: env.envelope_number, title: env.title, doc_type: env.doc_type,
    role_label: signer.role_label, name: signer.name,
    document_url: `${process.env.PUBLIC_BASE_URL}/api/envelopes/${params.token}/document`,  // streams source PDF
    source_sha256: env.source_sha256,
    signing_order: allSigners,   // shows the signer where they stand ("2 of 3")
    consent_text:
      'By typing your name below and clicking Sign, you agree this constitutes your electronic signature on the document shown, ' +
      'which you acknowledge you have reviewed in full, and that this signature carries the same legal effect as a handwritten signature.',
  });
}

// ============================================================================
// POST /api/envelopes/[token] — sign
// ============================================================================
interface SignBody { typed_name: string; }

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const db = svc();
  const { data: signer } = await db.from('envelope_signers')
    .select('*, envelopes(*)').eq('access_token_hash', hashToken(params.token)).single();
  if (!signer) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const env = signer.envelopes;

  if (signer.status === 'signed') return NextResponse.json({ error: 'already_signed' }, { status: 409 });
  if (env.status === 'voided') return NextResponse.json({ error: 'voided' }, { status: 410 });

  // Re-check sequential gating server-side at signing time too — not just
  // at view time — closes the race where signer 2 opens the link, waits,
  // and tries to submit before signer 1 actually completes.
  if (env.signing_mode === 'sequential') {
    const { data: earlier } = await db.from('envelope_signers')
      .select('status').eq('envelope_id', env.id).lt('routing_order', signer.routing_order);
    if (!(earlier ?? []).every((s) => s.status === 'signed')) {
      return NextResponse.json({ error: 'out_of_order', message: 'An earlier signature is still pending.' }, { status: 425 });
    }
  }

  const body = (await req.json()) as SignBody;
  if (!body.typed_name?.trim()) {
    return NextResponse.json({ error: 'typed_name required' }, { status: 422 });
  }

  const consentText =
    'By typing your name and clicking Sign, you agree this constitutes your electronic signature on the document shown, ' +
    'which you acknowledge you have reviewed in full, and that this signature carries the same legal effect as a handwritten signature.';
  const now = new Date().toISOString();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';

  const { error: evErr } = await db.from('signature_events').insert({
    envelope_id: env.id, signer_id: signer.id, signed_at: now,
    typed_name: body.typed_name.trim(), ip_address: ip,
    user_agent: req.headers.get('user-agent') ?? null,
    source_sha256_at_signing: env.source_sha256,
    consent_text_shown: consentText,
  });
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });

  await db.from('envelope_signers').update({ status: 'signed', signed_at: now }).eq('id', signer.id);
  await db.from('envelope_events').insert({ envelope_id: env.id, signer_id: signer.id, event: 'signed' });

  // Check completion: has every signer now signed?
  const { data: all } = await db.from('envelope_signers').select('status, routing_order, email, role_label')
    .eq('envelope_id', env.id).order('routing_order');
  const allSigned = all!.every((s) => s.status === 'signed');

  if (allSigned) {
    await db.from('envelopes').update({ status: 'completed', completed_at: now }).eq('id', env.id);
    await db.from('envelope_events').insert({ envelope_id: env.id, event: 'completed' });
    // Integration hook wired here (was a comment-only TODO in the source):
    await assembleFinalPackage(env.id);
    // Downstream: fire envelope.completed to every signer via Concierge Mail,
    // attaching envelope_completions.final_pdf_path.
  } else if (env.signing_mode === 'sequential') {
    await db.from('envelopes').update({ status: 'partially_signed' }).eq('id', env.id);
    // Notify the NEXT signer in routing order — their link was already
    // generated at send time; this just triggers their "it's your turn" email.
    const next = all!.find((s) => s.status === 'pending');
    if (next) {
      await db.from('envelope_events').insert({
        envelope_id: env.id, event: 'reminder_sent', detail: `Notified next signer: ${next.email}`,
      });
      // Downstream: Concierge Mail envelope.your_turn event to next.email.
    }
  } else {
    await db.from('envelopes').update({ status: 'partially_signed' }).eq('id', env.id);
  }

  return NextResponse.json({
    status: 'signed', envelope_number: env.envelope_number,
    envelope_complete: allSigned,
    message: allSigned
      ? 'Your signature is recorded. All required parties have now signed — a fully executed copy will follow shortly.'
      : 'Your signature is recorded. We will notify all parties once every required signature is complete.',
  });
}
