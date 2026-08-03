import { NextResponse } from 'next/server';
import { inboxItemFromThread } from '@/lib/oc/ocChat';
import { listOcChatThreadsFromR2 } from '@/lib/oc/ocChatThreadStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function badId(id: string) {
  return !ID_RE.test(id) || /[./\[\]]/.test(id);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const visitorId = String(url.searchParams.get('visitorId') || '').trim();
  if (!visitorId || badId(visitorId)) {
    return NextResponse.json({ error: 'invalid visitorId' }, { status: 400 });
  }
  try {
    const all = await listOcChatThreadsFromR2();
    const items = all
      .filter((row) => String(row.visitorId) === visitorId)
      .map((row) => inboxItemFromThread(String(row.characterId), row.thread))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.lastAt - a.lastAt);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
