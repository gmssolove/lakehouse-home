import { NextResponse } from 'next/server';
import { runOcChatCronTick } from '@/lib/oc/ocChatCron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorize(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer && bearer === secret) return true;
  const header = (req.headers.get('x-cron-secret') || '').trim();
  return header === secret;
}

async function handle(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await runOcChatCronTick({ requestUrl: req.url });
    console.info('[oc-chat-cron]', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[oc-chat-cron] fail', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
