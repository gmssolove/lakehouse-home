/* OpenNext custom worker — fetch + Cron Trigger scheduled handler */
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from './.open-next/worker.js';

type CronEnv = {
  CRON_SECRET?: string;
  WORKER_SELF_REFERENCE?: { fetch: typeof fetch };
};

async function runCron(env: CronEnv) {
  const secret = (env.CRON_SECRET || '').trim();
  if (!secret) {
    console.error('[oc-chat-cron] CRON_SECRET missing — skip');
    return;
  }
  const req = new Request('https://lakehouse.me.kr/api/oc-chat-cron', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });
  const res = env.WORKER_SELF_REFERENCE
    ? await env.WORKER_SELF_REFERENCE.fetch(req)
    : await fetch(req);
  const text = await res.text();
  console.info('[oc-chat-cron] scheduled', res.status, text.slice(0, 500));
}

export default {
  fetch: handler.fetch,

  async scheduled(
    _controller: { cron: string; scheduledTime: number },
    env: CronEnv,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ) {
    ctx.waitUntil(runCron(env));
  },
};

// @ts-ignore OpenNext cache DO handlers when present
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
