// lib/pdf/envelope-final.ts
// Requires: npm i pdf-lib   (Node runtime, works on Vercel)

import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createHash } from 'crypto';

const svc = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ============================================================================
// assembleFinalPackage(envelopeId) — called once, on the completion
// transition in the signing route. Produces: source PDF + one appended
// Execution Page (signature blocks) + one Certificate of Completion page
// (full audit trail), hashes it, stores it, records envelope_completions.
// ============================================================================
export async function assembleFinalPackage(envelopeId: string) {
  const db = svc();
  const { data: env } = await db.from('envelopes').select('*').eq('id', envelopeId).single();
  if (!env || env.status !== 'completed') throw new Error('envelope not completed');

  const { data: already } = await db.from('envelope_completions')
    .select('envelope_id').eq('envelope_id', envelopeId).maybeSingle();
  if (already) return already;   // idempotent — assembly runs once

  const [{ data: signers }, { data: events }, { data: file }] = await Promise.all([
    db.from('envelope_signers').select('*').eq('envelope_id', envelopeId).order('routing_order'),
    db.from('signature_events').select('*').eq('envelope_id', envelopeId).order('signed_at'),
    db.storage.from('documents').download(env.source_storage_path),
  ]);
  if (!file) throw new Error('source unavailable');
  const srcBytes = Buffer.from(await (file as Blob).arrayBuffer());
  if (createHash('sha256').update(srcBytes).digest('hex') !== env.source_sha256) {
    throw new Error('source integrity failure at assembly');
  }

  const pdf = await PDFDocument.load(srcBytes);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.13, 0.13, 0.13), gold = rgb(0.66, 0.55, 0.28), grey = rgb(0.45, 0.45, 0.45);
  const fmt = (d: string) => new Date(d).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET';

  // ---- Execution Page: one signature block per signer ----
  const exec = pdf.addPage([612, 792]);
  let y = 730;
  exec.drawText('EXECUTION PAGE', { x: 54, y, size: 16, font: bold, color: ink }); y -= 18;
  exec.drawText(`${env.title} — ${env.envelope_number}`, { x: 54, y, size: 10, font, color: grey }); y -= 8;
  exec.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 1.2, color: gold }); y -= 30;
  exec.drawText('The parties below executed this document electronically. Each electronic signature was', { x: 54, y, size: 10, font, color: ink }); y -= 13;
  exec.drawText('affixed with the signer\u2019s consent to sign electronically, recorded in the attached Certificate.', { x: 54, y, size: 10, font, color: ink }); y -= 34;

  for (const s of signers!) {
    const ev = events!.find((e: any) => e.signer_id === s.id);
    exec.drawText(s.role_label.toUpperCase(), { x: 54, y, size: 9, font: bold, color: gold }); y -= 22;
    exec.drawText(`/s/ ${ev?.typed_name ?? s.name}`, { x: 54, y, size: 14, font: bold, color: ink }); y -= 6;
    exec.drawLine({ start: { x: 54, y }, end: { x: 330, y }, thickness: 0.8, color: ink }); y -= 14;
    exec.drawText(`Name: ${s.name}`, { x: 54, y, size: 10, font, color: ink }); y -= 13;
    exec.drawText(`Signed: ${ev ? fmt(ev.signed_at) : ''}`, { x: 54, y, size: 10, font, color: ink }); y -= 34;
  }

  // ---- Certificate of Completion: full audit trail ----
  const cert = pdf.addPage([612, 792]);
  y = 730;
  cert.drawText('CERTIFICATE OF COMPLETION', { x: 54, y, size: 16, font: bold, color: ink }); y -= 18;
  cert.drawText(`Envelope ${env.envelope_number} · ${env.signing_mode} signing · Completed ${fmt(env.completed_at)}`, { x: 54, y, size: 10, font, color: grey }); y -= 8;
  cert.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 1.2, color: gold }); y -= 24;
  cert.drawText(`Source document SHA-256: ${env.source_sha256}`, { x: 54, y, size: 8.5, font, color: ink }); y -= 13;
  cert.drawText('Every signature below was affixed against this exact hash \u2014 the document was frozen at send and', { x: 54, y, size: 9.5, font, color: ink }); y -= 12;
  cert.drawText('could not be altered between signatures. Signature records are maintained in an append-only ledger.', { x: 54, y, size: 9.5, font, color: ink }); y -= 28;

  for (const ev of events!) {
    const s = signers!.find((x: any) => x.id === ev.signer_id)!;
    cert.drawText(`${s.role_label} — ${s.name} <${s.email}>`, { x: 54, y, size: 10.5, font: bold, color: ink }); y -= 13;
    cert.drawText(`Signed as: ${ev.typed_name}   ·   ${fmt(ev.signed_at)}`, { x: 66, y, size: 9.5, font, color: ink }); y -= 12;
    cert.drawText(`IP: ${ev.ip_address}   ·   Hash at signing: ${ev.source_sha256_at_signing.slice(0, 24)}\u2026`, { x: 66, y, size: 9, font, color: grey }); y -= 12;
    cert.drawText(`Consent shown: "${ev.consent_text_shown.slice(0, 96)}\u2026"`, { x: 66, y, size: 8, font, color: grey }); y -= 22;
  }
  cert.drawText('Signature Desk · Retained records: envelopes, envelope_signers, signature_events (immutable), envelope_events.', { x: 54, y: 60, size: 8, font, color: grey });

  // ---- Hash, store, record ----
  const finalBytes = Buffer.from(await pdf.save());
  const finalHash = createHash('sha256').update(finalBytes).digest('hex');
  const certHash = createHash('sha256')
    .update(JSON.stringify(events!.map((e: any) => [e.signer_id, e.signed_at, e.typed_name, e.ip_address])))
    .digest('hex');
  const finalPath = `envelopes/${envelopeId}/${env.envelope_number}-EXECUTED.pdf`;
  await db.storage.from('documents').upload(finalPath, finalBytes, { contentType: 'application/pdf', upsert: false });

  const { data: completion } = await db.from('envelope_completions').insert({
    envelope_id: envelopeId, certificate_sha256: certHash,
    final_pdf_path: finalPath, final_pdf_sha256: finalHash,
  }).select().single();

  return completion;
  // Integration hook: in app/api/envelopes/[token]/route.ts POST, inside the
  // `if (allSigned)` branch, add:  await assembleFinalPackage(env.id);
  // then fire Concierge Mail envelope.completed with finalPath attached.
}
