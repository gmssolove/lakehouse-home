import { resolveAffinityTier } from '@/lib/oc/ocChatAffinity';
import type { OcChatbotConfig } from '@/lib/types/character';

export type OcChatLiveContext = {
  currentDateTimeKST: string;
  timeOfDayLabel: string;
  daysSinceFirstContact: number;
  totalMessageCount: number;
  daysSinceLastContact: number;
  affectionStageLabel: string;
  affectionScore: number;
  isFirstMeetingVibe: boolean;
};

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function kstParts(ms: number) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') bag[p.type] = p.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const minute = Number(bag.minute);
  const month = Number(bag.month);
  const day = Number(bag.day);
  const year = Number(bag.year);
  const wdEn = (bag.weekday || '').slice(0, 2);
  const wdMap: Record<string, number> = {
    Su: 0,
    Mo: 1,
    Tu: 2,
    We: 3,
    Th: 4,
    Fr: 5,
    Sa: 6,
  };
  const weekday = wdMap[wdEn] ?? new Date(ms).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

export function kstDayKey(ms: number): string {
  const { year, month, day } = kstParts(ms);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysBetweenKst(fromMs: number, toMs: number): number {
  const a = Date.parse(`${kstDayKey(fromMs)}T12:00:00+09:00`);
  const b = Date.parse(`${kstDayKey(toMs)}T12:00:00+09:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function timeOfDayLabelKst(hour: number): string {
  if (hour < 5) return '새벽';
  if (hour < 11) return '아침';
  if (hour < 14) return '낮';
  if (hour < 18) return '오후';
  if (hour < 22) return '저녁';
  return '밤';
}

/** 예: "7월 28일 화요일 새벽 2시 13분" */
export function formatKstNaturalDateTime(ms = Date.now()): string {
  const { month, day, hour, minute, weekday } = kstParts(ms);
  const tod = timeOfDayLabelKst(hour);
  const clockHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const minPart = minute === 0 ? '' : ` ${minute}분`;
  const clock =
    hour === 0
      ? `자정${minute ? ` ${minute}분` : ''}`
      : `${tod} ${clockHour}시${minPart}`;
  return `${month}월 ${day}일 ${WEEKDAY_KO[weekday]}요일 ${clock}`;
}

type MsgLike = { at?: number; role?: string; kind?: string };

export function buildOcChatLiveContext(opts: {
  messages: MsgLike[];
  affection: number;
  chatbot?: OcChatbotConfig | null;
  now?: number;
  /** 이번 유저 말 직전까지의 마지막 시각 (없으면 messages에서 추정) */
  lastContactBeforeMs?: number;
}): OcChatLiveContext {
  const now = opts.now ?? Date.now();
  const msgs = opts.messages.filter((m) => (m.kind || 'chat') !== 'narration');
  const times = msgs
    .map((m) => (typeof m.at === 'number' ? m.at : 0))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  const firstAt = times[0];
  const lastBefore =
    typeof opts.lastContactBeforeMs === 'number' && opts.lastContactBeforeMs > 0
      ? opts.lastContactBeforeMs
      : times.length >= 2
        ? times[times.length - 2]
        : times[0];

  const totalMessageCount = msgs.length;
  const daysSinceFirstContact = firstAt ? daysBetweenKst(firstAt, now) : 0;
  const daysSinceLastContact =
    lastBefore && times.length > 1 ? daysBetweenKst(lastBefore, now) : 0;

  const { hour } = kstParts(now);
  const tier = resolveAffinityTier(opts.affection, opts.chatbot);
  const isFirstMeetingVibe =
    daysSinceFirstContact <= 0 && totalMessageCount < 8;

  return {
    currentDateTimeKST: formatKstNaturalDateTime(now),
    timeOfDayLabel: timeOfDayLabelKst(hour),
    daysSinceFirstContact,
    totalMessageCount,
    daysSinceLastContact,
    affectionStageLabel: tier.label,
    affectionScore: opts.affection,
    isFirstMeetingVibe,
  };
}

export function liveContextPromptLines(ctx: OcChatLiveContext): string[] {
  return [
    '실시간 컨텍스트 (내부 — 실제 시각·관계 진행. 숫자는 말하지 말고 반응에만 녹여라):',
    `- 지금(한국): ${ctx.currentDateTimeKST} (${ctx.timeOfDayLabel})`,
    `- 첫 연락 후: ${ctx.daysSinceFirstContact}일`,
    `- 누적 메시지: ${ctx.totalMessageCount}개`,
    `- 마지막 연락 후: ${ctx.daysSinceLastContact}일`,
    `- 관계: ${ctx.affectionStageLabel} (호감 ${ctx.affectionScore}/100)`,
    ctx.isFirstMeetingVibe
      ? '- 지금 분위기: 거의 초면/초반. 누군지 잘 모름. 경계 있음.'
      : '',
  ].filter(Boolean);
}

export function liveContextBehaviorRules(ctx: OcChatLiveContext): string[] {
  const early =
    ctx.daysSinceFirstContact <= 1 && ctx.totalMessageCount < 12;
  const spammyEarly = early && ctx.totalMessageCount >= 3;
  return [
    '시간·관계 반응 규칙:',
    '- 시각을 시계처럼 읽어주지 말고, 어색할 때만 자연스럽게 되물어라. 예: 새벽에 "학교야?" → "...새벽 두 시인데?"',
    '- 새벽·늦은 밤이면 더 짧고 귀찮게, 또는 왜 안 자고 연락하냐는 식으로.',
    '- 아침·수업 시간대면 바쁜 티만 짧게. 장황한 일과 설명 금지.',
    early
      ? '- 초면/초반: 친절하게 맞이하지 마라. "누구?", "왜 말 걸어" 같은 거리감이 기본.'
      : '- 어느 정도 안 사이라도 갑자기 다정해지지 마라.',
    spammyEarly
      ? '- 아직 거의 모르는 사이인데 자주 연락하면 "왜 자꾸 연락해" 뉘앙스를 섞어라.'
      : '',
    ctx.daysSinceLastContact >= 3
      ? '- 며칠 만이면 데면데면하게. "갑자기 왜" 정도의 거리감.'
      : '',
  ].filter(Boolean);
}
