// app/api/envelopes/[token]/document/route.ts
// Requires: npm i pdf-lib   (Node runtime, works on Vercel)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashToken } from '@/lib/tokens';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
const svc = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ============================================================================
// GET /api/envelopes/[token]/document — stream the frozen source PDF.
// Same gating as the envelope view: voided/expired blocked; sequential
// waiting signers may NOT view yet (consistent with the 425 on the view
// route — a waiting signer sees nothing until it's their turn).
// ============================================================================
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const db = svc();
  const { data: signer } = await db.from('envelope_signers')
    .select('*, envelopes(*)').eq('access_token_hash', hashToken(params.token)).single();
  if (!signer) return new NextResponse('Not found', { status: 404 });
  const env = signer.envelopes;

  if (env.status === 'voided') return new NextResponse('Withdrawn', { status: 410 });
  if (env.valid_until && new Date(env.valid_until) < new Date() && env.status !== 'completed') {
    return new NextResponse('Expired', { status: 410 });
  }
  if (env.signing_mode === 'sequential' && signer.status !== 'signed') {
    const { data: earlier } = await db.from('envelope_signers')
      .select('status').eq('envelope_id', env.id).lt('routing_order', signer.routing_order);
    if (!(earlier ?? []).every((s: any) => s.status === 'signed')) {
      return new NextResponse('Not yet available', { status: 425 });
    }
  }

  const { data: file, error } = await db.storage.from('documents').download(env.source_storage_path);
  if (error) return new NextResponse('Source unavailable', { status: 404 });
  const bytes = Buffer.from(await file.arrayBuffer());

  // Integrity check on every stream: what we serve must be what was frozen.
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== env.source_sha256) {
    // The stored file changed after send — refuse to show a mutated document.
    return new NextResponse('Document integrity check failed — contact the sender.', { status: 409 });
  }

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${env.envelope_number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
