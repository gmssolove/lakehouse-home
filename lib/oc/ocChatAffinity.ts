import type {
  OcChatAffinityTier,
  OcChatbotConfig,
  OcChatEpisode,
  OcCharacter,
} from '@/lib/types/character';

export const AFFECTION_MIN = 0;
export const AFFECTION_MAX = 100;
/** 품질 기반 — 결정적 순간까지 허용 */
export const FREE_DELTA_MIN = -3;
export const FREE_DELTA_MAX = 5;
/** 하루 상승 상한 (그라인딩 방지) */
export const FREE_DAILY_GAIN_CAP = 6;
/** 하루 하락 상한 (실수 한 번에 무너지지 않게) */
export const FREE_DAILY_LOSS_CAP = 2;
/** 무응답 방치 시 3일마다 -1 */
export const NEGLECT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
export const NEGLECT_MAX_HITS = 5;

export const DEFAULT_AFFINITY_TIERS: OcChatAffinityTier[] = [
  { min: 0, max: 20, label: '낯선 사이', toneNote: '더 무심하고 거리감 있게. 말을 아끼고 쉽게 마음을 열지 않는다.' },
  { min: 21, max: 60, label: '익숙한 사이', toneNote: '기본 톤. 상대를 알 정도는 되지만 과하게 다정하지 않다.' },
  {
    min: 61,
    max: 100,
    label: '가까운 사이',
    toneNote: '가끔 여린 면이나 짧은 관심이 드러날 수 있다. 그래도 캐릭터 말투는 유지한다.',
  },
];

export function clampAffection(n: number): number {
  if (!Number.isFinite(n)) return AFFECTION_MIN;
  return Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, Math.round(n)));
}

export function clampFreeDelta(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(FREE_DELTA_MIN, Math.min(FREE_DELTA_MAX, Math.round(n)));
}

export function resolveAffinityTiers(cfg?: OcChatbotConfig | null): OcChatAffinityTier[] {
  const raw = cfg?.affinityTiers;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((t) => ({
        min: Number(t.min) || 0,
        max: Number(t.max) || 0,
        label: String(t.label || '').trim() || '…',
        toneNote: t.toneNote?.trim() || undefined,
      }))
      .filter((t) => t.max >= t.min)
      .sort((a, b) => a.min - b.min);
  }
  return DEFAULT_AFFINITY_TIERS;
}

export function resolveAffinityTier(
  affection: number,
  cfg?: OcChatbotConfig | null,
): OcChatAffinityTier {
  const v = clampAffection(affection);
  const tiers = resolveAffinityTiers(cfg);
  const hit = tiers.find((t) => v >= t.min && v <= t.max);
  return hit || tiers[tiers.length - 1] || DEFAULT_AFFINITY_TIERS[0]!;
}

/** 라벨 + 은은한 점 — 단계가 올라갈수록 점 개수 증가 (3,4,5…) */
export function resolveAffinityDots(
  affection: number,
  cfg?: OcChatbotConfig | null,
): { label: string; total: number; lit: number; tierIndex: number } {
  const v = clampAffection(affection);
  const tiers = resolveAffinityTiers(cfg);
  let tierIndex = tiers.findIndex((t) => v >= t.min && v <= t.max);
  if (tierIndex < 0) tierIndex = Math.max(0, tiers.length - 1);
  const tier = tiers[tierIndex] || DEFAULT_AFFINITY_TIERS[0]!;
  const total = Math.min(8, 3 + tierIndex);
  const span = Math.max(1, (tier.max ?? 100) - (tier.min ?? 0));
  const progress = Math.max(0, Math.min(1, (v - (tier.min ?? 0)) / span));
  /* 구간 시작도 최소 1개 점등 (낯선 사이 이미지와 동일) */
  const lit = Math.max(1, Math.min(total, Math.round(progress * (total - 1)) + 1));
  return { label: tier.label, total, lit, tierIndex };
}

export function resolveStartEpisode(cfg?: OcChatbotConfig | null): OcChatEpisode | null {
  const list = Array.isArray(cfg?.episodes) ? cfg!.episodes! : [];
  if (!list.length) return null;
  const startId = (cfg?.startEpisodeId || '').trim();
  if (startId) {
    const found = list.find((e) => e.id === startId);
    if (found?.scenes?.length) return found;
  }
  const first = list.find((e) => (e.scenes || []).length > 0);
  return first || null;
}

export function findEpisodeScene(episode: OcChatEpisode, sceneId: string) {
  return (episode.scenes || []).find((s) => s.id === sceneId) || null;
}

export function episodeStartSceneId(episode: OcChatEpisode): string | null {
  return episode.scenes?.[0]?.id || null;
}

export function needsStoryMode(
  character: Pick<OcCharacter, 'chatbot'>,
  completedEpisodeIds: string[] | undefined,
): boolean {
  const ep = resolveStartEpisode(character.chatbot);
  if (!ep) return false;
  const done = new Set(completedEpisodeIds || []);
  return !done.has(ep.id);
}

export function todayKeyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeReasonKey(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 48);
}

function reasonsSimilar(a: string, b: string): boolean {
  const x = normalizeReasonKey(a);
  const y = normalizeReasonKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

/** ±0 또는 ±1 미세 랜덤 (0 델타는 올리지 않음) */
function applyMicroJitter(delta: number): number {
  if (delta === 0) return 0;
  const r = Math.random();
  if (r < 0.22) return clampFreeDelta(delta + (delta > 0 ? 1 : -1));
  if (r < 0.44) return clampFreeDelta(delta + (delta > 0 ? -1 : 1));
  return delta;
}

/**
 * 대화 품질 기반 호감 델타.
 * - 기본은 0 (잡담으로는 거의 안 오름)
 * - 모델 제안 + 휴리스틱 + 반복 감쇠 + 일일 상한 + 미세 랜덤
 */
export function computeFreeChatAffinityDelta(opts: {
  proposed?: number | null;
  userText: string;
  dailyGainSoFar: number;
  dailyLossSoFar?: number;
  recentReasons?: string[];
  deltaReason?: string;
}): { delta: number; dailyGainNext: number; dailyLossNext: number } {
  let delta = clampFreeDelta(
    opts.proposed === null || opts.proposed === undefined ? 0 : opts.proposed,
  );
  const t = opts.userText.trim();

  /* 성의 없는 짧은 말 — 상승 불가, 무례 추정 시 소폭 하락만 허용 */
  if (t.length <= 1 || /^(ㅇㅇ|ㅋㅋ|ㅎㅎ|ㄱㄱ|ㄴㄴ|\.+|…+)$/i.test(t)) {
    delta = Math.min(delta, 0);
  }
  /* 인사·잡담 짧은 한 줄은 상승 억제 */
  if (t.length <= 6 && /^(안녕|하이|헬로|ㅎㅇ|잘\s*자|굿모닝)/i.test(t) && delta > 0) {
    delta = 0;
  }

  const reason = (opts.deltaReason || '').trim();
  if (delta > 0 && reason) {
    const recent = opts.recentReasons || [];
    const repeats = recent.filter((r) => reasonsSimilar(r, reason)).length;
    if (repeats >= 1) delta = Math.max(0, Math.floor(delta / 2));
    if (repeats >= 3) delta = 0;
  }

  delta = applyMicroJitter(delta);

  const lossSoFar = Math.max(0, opts.dailyLossSoFar || 0);
  if (delta > 0) {
    const room = Math.max(0, FREE_DAILY_GAIN_CAP - opts.dailyGainSoFar);
    delta = Math.min(delta, room);
  } else if (delta < 0) {
    const room = Math.max(0, FREE_DAILY_LOSS_CAP - lossSoFar);
    delta = -Math.min(-delta, room);
  }

  const dailyGainNext =
    delta > 0 ? opts.dailyGainSoFar + delta : opts.dailyGainSoFar;
  const dailyLossNext = delta < 0 ? lossSoFar + -delta : lossSoFar;
  return { delta, dailyGainNext, dailyLossNext };
}

/** 3일 이상 무응답 방치 감쇠 (열 때 1회 정산) */
export function computeNeglectDecay(opts: {
  affection: number;
  lastInteractionAt?: number;
  neglectCheckedAt?: number;
  now?: number;
}): { affection: number; decay: number; neglectCheckedAt: number } {
  const now = opts.now ?? Date.now();
  const last = opts.lastInteractionAt;
  if (!last || !Number.isFinite(last)) {
    return {
      affection: clampAffection(opts.affection),
      decay: 0,
      neglectCheckedAt: opts.neglectCheckedAt || now,
    };
  }
  const from = Math.max(last, opts.neglectCheckedAt || last);
  const span = Math.max(0, now - from);
  const hits = Math.min(NEGLECT_MAX_HITS, Math.floor(span / NEGLECT_INTERVAL_MS));
  if (hits <= 0) {
    return {
      affection: clampAffection(opts.affection),
      decay: 0,
      neglectCheckedAt: opts.neglectCheckedAt || from,
    };
  }
  const decay = hits; /* -1 each */
  return {
    affection: clampAffection(opts.affection - decay),
    decay,
    neglectCheckedAt: from + hits * NEGLECT_INTERVAL_MS,
  };
}

export function stripAffinityTag(raw: string): { text: string; proposed: number | null } {
  let proposed: number | null = null;
  const text = raw
    .replace(/\[AFFINITY\s*:\s*([+-]?\d+)\s*\]/gi, (_, n: string) => {
      proposed = Number(n);
      return '';
    })
    .trim();
  return { text, proposed };
}

export function affectionToastMessage(delta: number): string | null {
  if (delta > 0) {
    if (delta >= 3) return `호감 +${delta}`;
    if (delta === 2) return '호감 +2';
    return '호감 +1';
  }
  if (delta < 0) {
    return delta <= -2 ? `호감 ${delta}` : '호감 -1';
  }
  return null;
}
