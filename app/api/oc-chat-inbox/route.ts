import { NextResponse } from 'next/server';
import { countCharUnread, previewFromChatMessage } from '@/lib/oc/ocChat';
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
      .map((row) => {
        const messages = row.thread?.messages || [];
        if (!messages.length) return null;
        const last = messages[messages.length - 1]!;
        const lastAt = typeof last.at === 'number' ? last.at : 0;
        if (!lastAt) return null;
        return {
          characterId: String(row.characterId),
          lastAt,
          preview: previewFromChatMessage(last),
          unread: countCharUnread(row.thread),
          updatedAt:
            typeof row.thread.updatedAt === 'number' && row.thread.updatedAt > 0
              ? row.thread.updatedAt
              : lastAt,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.lastAt - a.lastAt);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
