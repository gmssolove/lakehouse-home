import { clampFreeDelta } from '@/lib/oc/ocChatAffinity';
import type { OcChatPresence } from '@/lib/oc/ocChatPresence';

export type OcChatAction = 'respond' | 'read_only' | 'ignore' | 'end_for_today';
export type OcChatDelayKind = 'immediate' | 'short' | 'long' | 'next_day';

export type OcChatTypingEventType = 'typing' | 'pause' | 'clear';
export type OcChatTypingEvent = {
  type: OcChatTypingEventType;
  /** 초 */
  durationSeconds: number;
};

export type OcChatBehaviorSticker = {
  id?: string;
  tags?: string[];
};

export type OcChatBehavior = {
  action: OcChatAction;
  delay: OcChatDelayKind;
  messages: string[];
  moodNote?: string;
  affinityDelta: number;
  /** 내부용 — 화면 비표시 */
  deltaReason?: string;
  /** AI가 정한 응답 시점 presence */
  presenceState?: OcChatPresence;
  /** 온라인 전환 후 ~ 메시지 도착까지 초 */
  responseDelaySeconds?: number;
  typingIndicatorEvents?: OcChatTypingEvent[];
  sticker?: OcChatBehaviorSticker | null;
};

export type OcChatPendingBehavior = {
  applyAt: number;
  action: OcChatAction;
  messages: string[];
  moodNote?: string;
  affinityDelta: number;
  presenceState?: OcChatPresence;
  responseDelaySeconds?: number;
  typingIndicatorEvents?: OcChatTypingEvent[];
  sticker?: OcChatBehaviorSticker | null;
};

const ACTIONS = new Set<OcChatAction>([
  'respond',
  'read_only',
  'ignore',
  'end_for_today',
]);
const DELAYS = new Set<OcChatDelayKind>([
  'immediate',
  'short',
  'long',
  'next_day',
]);

/** 마지막 메시지 이후 최소 유휴(ms) — 선톡 */
export const PROACTIVE_IDLE_MS = 90 * 60 * 1000;

function jitter(lo: number, hi: number) {
  return Math.round(lo + Math.random() * (hi - lo));
}

/** delay 종류 → 연출 대기 ms (next_day는 0, 별도 스케줄) */
export function delayKindToMs(kind: OcChatDelayKind): number {
  switch (kind) {
    case 'immediate':
      return jitter(350, 900);
    case 'short':
      return jitter(1400, 3200);
    case 'long':
      return jitter(4500, 11000);
    case 'next_day':
      return 0;
    default:
      return jitter(800, 2000);
  }
}

/** 말풍선 사이 텀 */
export function splitBubbleGapMs(): number {
  return jitter(300, 800);
}

/** 메시지 길이 → 타이핑 표시 ms (모델이 정하지 않음) */
export function typingDurationMs(text: string): number {
  const len = Array.from(String(text || '').trim()).length;
  /* 초당 ~4자, 최소 1초, 최대 12초 */
  const sec = Math.min(12, Math.max(1, len / 4));
  return Math.round(sec * 1000);
}

export function nextLocalMidnightMs(from = Date.now()): number {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** 스키마/JSON이 말풍선으로 새면 안 됨 */
export function looksLikeBehaviorDump(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^\s*\{/.test(t) && /"action"\s*:/.test(t)) return true;
  if (/^\s*\{/.test(t) && /"reachOut"\s*:/.test(t)) return true;
  if (/^\s*```/.test(t) && /"action"\s*:/.test(t)) return true;
  return false;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence?.[1] ?? trimmed).trim();
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** trailing comma / 잘린 JSON 대략 복구 */
function repairJsonCandidate(text: string): string {
  let s = text.trim();
  /* 흔한 trailing comma */
  s = s.replace(/,\s*([}\]])/g, '$1');
  if (!s.endsWith('}') && !s.endsWith(']')) {
    /* messages 배열만 열려 있으면 닫기 */
    const openSq = (s.match(/\[/g) || []).length;
    const closeSq = (s.match(/\]/g) || []).length;
    const openBr = (s.match(/\{/g) || []).length;
    const closeBr = (s.match(/\}/g) || []).length;
    if (openSq > closeSq) s += ']'.repeat(openSq - closeSq);
    if (openBr > closeBr) s += '}'.repeat(openBr - closeBr);
  }
  return s;
}

function extractJsonObject(raw: string): unknown | null {
  const body = stripCodeFence(raw);
  const start = body.indexOf('{');
  if (start < 0) return null;
  const slice = body.slice(start);
  const end = slice.lastIndexOf('}');
  const candidates = [
    end > 0 ? slice.slice(0, end + 1) : slice,
    repairJsonCandidate(end > 0 ? slice.slice(0, end + 1) : slice),
    repairJsonCandidate(slice),
  ];
  for (const c of candidates) {
    const hit = tryParseJson(c);
    if (hit && typeof hit === 'object') return hit;
  }
  return null;
}

/** 파싱 실패 시 messages 배열만이라도 정규식으로 건짐 */
function salvageMessages(raw: string): string[] {
  const body = stripCodeFence(raw);
  const block = body.match(/"messages"\s*:\s*\[([\s\S]*?)\]/);
  if (!block) {
    /* 잘려서 ] 없는 경우 */
    const open = body.match(/"messages"\s*:\s*\[([\s\S]*)$/);
    if (!open) return [];
    return Array.from(open[1].matchAll(/"((?:\\.|[^"\\])*)"/g))
      .map((m) => m[1]!.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim())
      .filter((t) => t && !looksLikeBehaviorDump(t))
      .slice(0, 5);
  }
  return Array.from(block[1].matchAll(/"((?:\\.|[^"\\])*)"/g))
    .map((m) => m[1]!.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim())
    .filter((t) => t && !looksLikeBehaviorDump(t))
    .slice(0, 5);
}

function salvageAction(raw: string): OcChatAction | null {
  const m = raw.match(/"action"\s*:\s*"(respond|read_only|ignore|end_for_today)"/);
  return m ? (m[1] as OcChatAction) : null;
}

function salvageDelay(raw: string): OcChatDelayKind | null {
  const m = raw.match(/"delay"\s*:\s*"(immediate|short|long|next_day)"/);
  return m ? (m[1] as OcChatDelayKind) : null;
}

function asMessages(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x || '').trim())
      .filter((t) => t && !looksLikeBehaviorDump(t))
      .slice(0, 5);
  }
  if (typeof raw === 'string' && raw.trim() && !looksLikeBehaviorDump(raw)) {
    return [raw.trim()];
  }
  return [];
}

function asTypingEvents(raw: unknown): OcChatTypingEvent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: OcChatTypingEvent[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const typeRaw = String(o.type || '').trim();
    const type: OcChatTypingEventType =
      typeRaw === 'pause' || typeRaw === 'clear'
        ? typeRaw
        : typeRaw === 'typing'
          ? 'typing'
          : 'typing';
    if (typeRaw !== 'typing' && typeRaw !== 'pause' && typeRaw !== 'clear') continue;
    const dur =
      typeof o.durationSeconds === 'number'
        ? o.durationSeconds
        : Number(o.durationSeconds) || Number(o.duration) || 0;
    if (!Number.isFinite(dur) || dur <= 0) continue;
    out.push({ type, durationSeconds: Math.min(30, Math.max(0.2, dur)) });
  }
  return out.length ? out : undefined;
}

function asSticker(raw: unknown): OcChatBehaviorSticker | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const id = String(o.id || '').trim() || undefined;
  const tags = Array.isArray(o.tags)
    ? o.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 4)
    : undefined;
  if (!id && !(tags && tags.length)) return null;
  return { id, tags };
}

function asPresence(raw: unknown): OcChatPresence | undefined {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'online' || s === 'offline') return s;
  return undefined;
}

function fromObject(o: Record<string, unknown>, fallbackText?: string): OcChatBehavior {
  const actionRaw = String(o.action || '').trim() as OcChatAction;
  const delayRaw = String(o.delay || '').trim() as OcChatDelayKind;
  let action: OcChatAction = ACTIONS.has(actionRaw) ? actionRaw : 'respond';
  let delay: OcChatDelayKind = DELAYS.has(delayRaw) ? delayRaw : 'short';
  let messages = asMessages(o.messages);
  const moodNote = String(o.moodNote || '').trim().slice(0, 200) || undefined;
  const deltaReason =
    String(o.deltaReason || o.reason || '').trim().slice(0, 160) || undefined;
  const rawDelta =
    typeof o.affectionDelta === 'number'
      ? o.affectionDelta
      : typeof o.affinityDelta === 'number'
        ? o.affinityDelta
        : Number(o.affectionDelta ?? o.affinityDelta) || 0;
  const affinityDelta = clampFreeDelta(rawDelta);
  let presenceState = asPresence(o.presenceState ?? o.presence);
  const responseDelaySeconds =
    typeof o.responseDelaySeconds === 'number' && Number.isFinite(o.responseDelaySeconds)
      ? Math.min(90, Math.max(0, Math.round(o.responseDelaySeconds)))
      : undefined;
  const typingIndicatorEvents = asTypingEvents(o.typingIndicatorEvents);
  const sticker = asSticker(o.sticker);

  if (action === 'ignore') {
    messages = [];
    delay = delay === 'next_day' ? 'next_day' : 'immediate';
  }
  if (action === 'read_only') {
    messages = [];
  }
  if ((action === 'respond' || action === 'end_for_today') && !messages.length) {
    const fb = (fallbackText || '').trim();
    if (fb && !looksLikeBehaviorDump(fb)) messages = [fb];
    else action = 'read_only';
  }

  /* 대답할 거면 결국 온라인으로 올라온 뒤 보내는 전제 */
  if (
    (action === 'respond' || action === 'end_for_today') &&
    !presenceState
  ) {
    presenceState = 'online';
  }

  return {
    action,
    delay,
    messages,
    moodNote,
    affinityDelta,
    deltaReason,
    presenceState,
    responseDelaySeconds,
    typingIndicatorEvents,
    sticker: sticker === undefined ? undefined : sticker,
  };
}

/** 모델 응답 → 행동. JSON이 깨져도 말풍선에 스키마가 안 나감 */
export function parseOcChatBehavior(
  raw: string,
  fallbackText?: string,
): OcChatBehavior {
  const obj = extractJsonObject(raw);
  if (obj && typeof obj === 'object') {
    return fromObject(obj as Record<string, unknown>, fallbackText);
  }

  /* 깨진 JSON — 필드 살림 */
  const salvaged = salvageMessages(raw);
  const action = salvageAction(raw) || 'respond';
  const delay = salvageDelay(raw) || 'short';
  if (action === 'ignore' || action === 'read_only') {
    return { action, delay, messages: [], affinityDelta: 0 };
  }
  if (salvaged.length) {
    return {
      action: action === 'end_for_today' ? 'end_for_today' : 'respond',
      delay,
      messages: salvaged,
      affinityDelta: 0,
    };
  }

  const fb = (fallbackText || '').trim();
  if (fb && !looksLikeBehaviorDump(fb) && !looksLikeBehaviorDump(raw)) {
    return {
      action: 'respond',
      delay: 'short',
      messages: [fb.slice(0, 500)],
      affinityDelta: 0,
    };
  }

  /* JSON만 있고 대사 없음 → 읽씹으로 처리 (스키마 노출 금지) */
  return { action: 'read_only', delay: 'short', messages: [], affinityDelta: 0 };
}

export type OcChatProactiveDecision = {
  reachOut: boolean;
  messages: string[];
  moodNote?: string;
  delay: OcChatDelayKind;
};

export function parseOcChatProactive(raw: string): OcChatProactiveDecision {
  const obj = extractJsonObject(raw);
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const reachOut = o.reachOut === true || o.reachOut === 'true';
    const delayRaw = String(o.delay || 'short').trim() as OcChatDelayKind;
    const delay: OcChatDelayKind =
      delayRaw === 'long' || delayRaw === 'immediate' ? delayRaw : 'short';
    const messages = asMessages(o.messages).slice(0, 3);
    const moodNote = String(o.moodNote || '').trim().slice(0, 200) || undefined;
    return {
      reachOut: reachOut && messages.length > 0,
      messages,
      moodNote,
      delay,
    };
  }
  const salvaged = salvageMessages(raw);
  if (salvaged.length && /"reachOut"\s*:\s*true/.test(raw)) {
    return { reachOut: true, messages: salvaged, delay: 'short' };
  }
  return { reachOut: false, messages: [], delay: 'short' };
}

export function hoursSince(ts: number | undefined, now = Date.now()): number {
  if (!ts || !Number.isFinite(ts)) return 999;
  return Math.max(0, (now - ts) / 3_600_000);
}
