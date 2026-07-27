/** 채팅 presence — 시간대 기반 앰비언트 + AI presenceState */

export type OcChatPresence = 'online' | 'offline';

export type OcChatRecentAction = {
  at: number;
  action: string;
  presence: OcChatPresence;
  note?: string;
};

/** KST 시(0–23) — 온라인일 확률 (0~1). 살짝 랜덤은 호출부에서. */
const HOUR_ONLINE_WEIGHT: number[] = [
  0.08, 0.05, 0.04, 0.05, 0.08, 0.15, // 0–5 새벽
  0.35, 0.45, 0.25, 0.2, 0.22, 0.28, // 6–11 아침·수업
  0.4, 0.35, 0.3, 0.28, 0.35, 0.55, // 12–17
  0.72, 0.78, 0.75, 0.65, 0.45, 0.22, // 18–23
];

export function kstHour(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(now));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 12);
  return Number.isFinite(h) ? ((h % 24) + 24) % 24 : 12;
}

/** 유저 미반응 시 자연스러운 온라인/오프라인 추정치 */
export function ambientPresenceChance(now = Date.now()): number {
  return HOUR_ONLINE_WEIGHT[kstHour(now)] ?? 0.4;
}

export function rollAmbientPresence(now = Date.now()): OcChatPresence {
  return Math.random() < ambientPresenceChance(now) ? 'online' : 'offline';
}

/**
 * 응답 대기(초). AI가 준 값이 있으면 우선, 없으면 delay kind + presence로.
 * online: 5~60초, offline→응답: 전환 후 5~20초 쪽.
 */
export function resolveResponseDelaySeconds(opts: {
  aiSeconds?: number;
  delayKind?: string;
  wasOffline: boolean;
}): number {
  const ai = opts.aiSeconds;
  if (typeof ai === 'number' && Number.isFinite(ai) && ai >= 0) {
    return Math.min(90, Math.max(0, Math.round(ai)));
  }
  const kind = opts.delayKind || 'short';
  if (opts.wasOffline) {
    if (kind === 'immediate') return jitterInt(4, 9);
    if (kind === 'long' || kind === 'next_day') return jitterInt(10, 18);
    return jitterInt(5, 14);
  }
  if (kind === 'immediate') return jitterInt(3, 8);
  if (kind === 'long') return jitterInt(14, 32);
  if (kind === 'next_day') return 0;
  return jitterInt(5, 18);
}

function jitterInt(lo: number, hi: number) {
  return Math.round(lo + Math.random() * (hi - lo));
}

/** 온라인 전환 연출 텀(ms) — 불 켜진 뒤 타이핑/답장 전 */
export function presenceComeOnlineMs(): number {
  return jitterInt(900, 2800);
}

export function formatRecentActionsForPrompt(
  recent: OcChatRecentAction[] | undefined,
  now = Date.now(),
): string[] {
  const list = (recent || []).slice(-6);
  if (!list.length) return [];
  const lines = list.map((a) => {
    const mins = Math.max(0, Math.round((now - a.at) / 60_000));
    const when = mins < 1 ? '방금' : mins < 60 ? `${mins}분 전` : `${Math.round(mins / 60)}시간 전`;
    const note = a.note ? ` (판단: ${a.note})` : '';
    if (a.action === 'ignore' || a.action === 'read_only') {
      return `- ${when}: ${a.presence} 상태였지만 응답하지 않음${note}`;
    }
    return `- ${when}: ${a.action} / ${a.presence}${note}`;
  });
  return ['[최근 자기 행동 기록]', ...lines];
}
