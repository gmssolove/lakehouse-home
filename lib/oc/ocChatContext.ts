import { resolveAffinityTier } from '@/lib/oc/ocChatAffinity';
import type { OcChatbotConfig } from '@/lib/types/character';

export type OcChatLiveContext = {
  currentDateTimeKST: string;
  timeOfDayLabel: string;
  /** KST 시(0–23) */
  hourKst: number;
  /** 대략 0시~6시 — 심야·새벽 */
  isLateNight: boolean;
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
  const isLateNight = hour < 7;
  /* 첫날 + 메시지가 매우 적을 때 초면 분위기 */
  const isFirstMeetingVibe =
    daysSinceFirstContact <= 0 && totalMessageCount < 5;

  return {
    currentDateTimeKST: formatKstNaturalDateTime(now),
    timeOfDayLabel: timeOfDayLabelKst(hour),
    hourKst: hour,
    isLateNight,
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
    ctx.isLateNight && ctx.affectionScore <= 50
      ? '- 심야·새벽 + 호감 낮음: 폰을 보고 있을 개연성 낮음 → 오프라인/무응답·다음날 답 쪽 경향(절대 금지 아님).'
      : '',
  ].filter(Boolean);
}

export function liveContextBehaviorRules(ctx: OcChatLiveContext): string[] {
  const early =
    ctx.daysSinceFirstContact <= 0 || ctx.totalMessageCount < 5;
  const earlyish =
    ctx.daysSinceFirstContact <= 1 && ctx.totalMessageCount < 12;
  const spammyEarly = earlyish && ctx.totalMessageCount >= 3;
  const lowAff = ctx.affectionScore <= 50;
  const midPlus = ctx.affectionScore >= 51;

  return [
    '시간·관계 반응 규칙:',
    '- 시각을 시계처럼 읽어주지 마라. 숫자가 아니라 반응에만 녹여라.',
    '- 질문이 현재 시각과 논리적으로 모순될 때만 담담히 되물어라. 예: 새벽에 "학교야?" → "...새벽인데" / "이 시간에?".',
    '- 그 되물음은 탓·다그침이 아니다. "새벽에 왜 이래"처럼 상대를 나무라지 마라.',
    '- "언제 잘 거야?"처럼 그 시간에 자연스러운 질문에는 시간 지적 없이 그냥 짧게 답하라.',
    ctx.isLateNight
      ? '- 심야·새벽: 평소보다 단답 비중↑, responseDelaySeconds를 더 길게, delay는 long/next_day 비중↑(피곤·잠).'
      : '- 아침·수업·바쁜 시간대면 바쁜 티만 짧게. 일과를 구구절절 설명하지 마라.',
    early
      ? '- 초면/초반: 친절하게 맞이하지 마라. "누구?", "왜 말 걸어" 같은 거리감이 기본.'
      : '- 어느 정도 안 사이라도 갑자기 다정해지지 마라.',
    spammyEarly
      ? '- 아직 거의 모르는 사이인데 자주 연락하면 "왜 자꾸 연락해" 뉘앙스를 섞어라.'
      : '',
    ctx.daysSinceLastContact >= 3
      ? '- 며칠 만이면 데면데면하게. "갑자기 왜" 정도의 거리감.'
      : '',
    ctx.isLateNight && lowAff
      ? '- 호감 0~50 + 심야/새벽(0~7시): presenceState offline + ignore/read_only + delay next_day/long 쪽으로 크게 치우쳐라. 100%는 아니다.'
      : '',
    ctx.isLateNight && midPlus
      ? '- 호감 51+ 심야: 오프라인 경향은 약해짐. 가끔은 느릿하게라도 답해도 된다.'
      : '',
    '- ㅜㅜ·진지한 부탁·짧은 간격 연타 등 대화를 정말 원하는 신호면, 심야 오프라인 경향보다 우선해 짧게라도 respond(졸린 한두 마디 OK). 완전 무응답만 반복하지 마라.',
  ].filter(Boolean);
}
