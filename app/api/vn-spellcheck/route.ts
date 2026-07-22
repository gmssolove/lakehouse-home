import { NextResponse } from 'next/server';
import { checkDialogueLines } from '@/lib/vn/koreanSpellcheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 한 요청당 줄 수 — 클라이언트에서 청크로 나눠 호출 */
export const SPELLCHECK_BATCH_MAX = 40;

type Body = {
  lines?: { id: string; text: string }[];
};

/** 대사 일괄 맞춤법 검사 (다음 문법 검사기 프록시) */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) {
    return NextResponse.json({ results: [] });
  }
  if (lines.length > SPELLCHECK_BATCH_MAX) {
    return NextResponse.json(
      { error: `한 요청에 ${SPELLCHECK_BATCH_MAX}줄까지 — 클라이언트에서 나눠 보내 주세요` },
      { status: 400 },
    );
  }

  try {
    const results = await checkDialogueLines(
      lines.map((l) => ({
        id: String(l.id || ''),
        text: String(l.text || ''),
      })),
    );
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : '검사 실패';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
