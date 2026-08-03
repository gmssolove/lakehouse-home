import { NextResponse } from 'next/server';
import {
  normalizeOcUserPresenceSnap,
  resolveOcUserPresence,
  type OcUserPresenceSnap,
} from '@/lib/oc/ocChatUserPresence';
import {
  loadOcUserPresenceFromR2,
  saveOcUserPresenceToR2,
} from '@/lib/oc/ocChatUserPresenceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  visitorId?: string;
  state?: string;
  updatedAt?: number;
  lastActiveAt?: number;
  lastHeartbeatAt?: number;
  viewingCharacterId?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const visitorId = String(url.searchParams.get('visitorId') || '').trim().slice(0, 80);
  if (!visitorId) {
    return NextResponse.json({ error: 'visitorId 필요' }, { status: 400 });
  }
  try {
    const raw = await loadOcUserPresenceFromR2(visitorId);
    const presence = resolveOcUserPresence(raw);
    return NextResponse.json({ presence }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[oc-user-presence] get failed', e);
    return NextResponse.json(
      { presence: resolveOcUserPresence(null) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function PUT(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const visitorId = String(body.visitorId || '').trim().slice(0, 80);
  if (!visitorId) {
    return NextResponse.json({ error: 'visitorId 필요' }, { status: 400 });
  }
  const snap: OcUserPresenceSnap = normalizeOcUserPresenceSnap({
    state: body.state,
    updatedAt: body.updatedAt,
    lastActiveAt: body.lastActiveAt,
    lastHeartbeatAt: body.lastHeartbeatAt,
    viewingCharacterId: body.viewingCharacterId,
  });
  try {
    await saveOcUserPresenceToR2(visitorId, snap);
  } catch (e) {
    console.warn('[oc-user-presence] save failed', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 502 });
  }
  return NextResponse.json(
    { ok: true, presence: resolveOcUserPresence(snap) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
