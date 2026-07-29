import { NextResponse } from 'next/server';
import { normalizeChatThread } from '@/lib/oc/ocChat';
import {
  deleteOcChatThreadFromR2,
  loadOcChatThreadFromR2,
  pickNewerThread,
  saveOcChatThreadToR2,
} from '@/lib/oc/ocChatThreadStore';
import { loadOcChatThreadServer } from '@/lib/oc/ocChatRtdbServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function badId(id: string) {
  return !ID_RE.test(id) || /[./\[\]]/.test(id);
}

type Body = {
  characterId?: string;
  visitorId?: string;
  thread?: unknown;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const characterId = String(url.searchParams.get('characterId') || '').trim();
  const visitorId = String(url.searchParams.get('visitorId') || '').trim();
  if (!characterId || !visitorId || badId(characterId) || badId(visitorId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 });
  }
  try {
    const fromR2 = await loadOcChatThreadFromR2(characterId, visitorId);
    let fromFb = null as ReturnType<typeof normalizeChatThread> | null;
    try {
      const fb = await loadOcChatThreadServer(characterId, visitorId);
      fromFb = fb;
    } catch {
      fromFb = null;
    }
    const thread = pickNewerThread(fromFb, fromR2);
    return NextResponse.json({ ok: true, thread });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const characterId = String(body.characterId || '').trim();
  const visitorId = String(body.visitorId || '').trim();
  if (!characterId || !visitorId || badId(characterId) || badId(visitorId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 });
  }
  const thread = normalizeChatThread(body.thread);
  try {
    /* Firebase 쓰기 권한과 무관하게 R2에 저장 (프로덕션 R2 시크릿 사용) */
    await saveOcChatThreadToR2(characterId, visitorId, thread);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  let characterId = String(url.searchParams.get('characterId') || '').trim();
  let visitorId = String(url.searchParams.get('visitorId') || '').trim();
  if (!characterId || !visitorId) {
    try {
      const body = (await req.json()) as Body;
      characterId = String(body.characterId || characterId).trim();
      visitorId = String(body.visitorId || visitorId).trim();
    } catch {
      /* query only */
    }
  }
  if (!characterId || !visitorId || badId(characterId) || badId(visitorId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 });
  }
  try {
    await deleteOcChatThreadFromR2(characterId, visitorId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
