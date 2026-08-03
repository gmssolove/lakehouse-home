/**
 * OC 채팅 장기 기억 — 최근 창 밖 구간을 요약·누적.
 * 잡담은 버리고 사실·감정·약속만 남긴 뒤 길이 상한으로 재압축.
 */

/** 최근 라이브 창 — `OC_CHAT_API_HISTORY`(36)와 동기 */
export const OC_CHAT_MEMORY_LIVE_MAX = 36;
/** 라이브 창 밖에 쌓인 말풍선이 이 수 이상이면 요약 갱신 */
export const OC_CHAT_MEMORY_TRIGGER_MSGS = 20;
/** 요약 본문 최대 글자 (공백 포함) */
export const OC_CHAT_MEMORY_MAX_CHARS = 500;

export type OcChatMemoryMsg = {
  role?: string;
  content?: string;
  at?: number;
  kind?: string;
};

export function isOcChatMemoryEligible(m: OcChatMemoryMsg): boolean {
  const kind = m.kind || 'chat';
  if (kind === 'narration' || kind === 'story') return false;
  return Boolean(String(m.content || '').trim()) || kind === 'sticker' || kind === 'choice';
}

/** 최근 라이브 창을 제외한 구간 */
export function ocChatColdMessages(
  messages: OcChatMemoryMsg[],
  liveMax = OC_CHAT_MEMORY_LIVE_MAX,
): OcChatMemoryMsg[] {
  const eligible = messages.filter(isOcChatMemoryEligible);
  if (eligible.length <= liveMax) return [];
  return eligible.slice(0, eligible.length - liveMax);
}

/** 아직 요약에 안 들어간 cold 구간 */
export function ocChatUncoveredColdMessages(
  messages: OcChatMemoryMsg[],
  throughAt: number | undefined,
  liveMax = OC_CHAT_MEMORY_LIVE_MAX,
): OcChatMemoryMsg[] {
  const cold = ocChatColdMessages(messages, liveMax);
  const floor = typeof throughAt === 'number' && Number.isFinite(throughAt) ? throughAt : 0;
  return cold.filter((m) => (typeof m.at === 'number' ? m.at : 0) > floor);
}

export function shouldRefreshOcChatMemory(opts: {
  messages: OcChatMemoryMsg[];
  memorySummaryThroughAt?: number;
  liveMax?: number;
  triggerMsgs?: number;
}): boolean {
  const uncovered = ocChatUncoveredColdMessages(
    opts.messages,
    opts.memorySummaryThroughAt,
    opts.liveMax ?? OC_CHAT_MEMORY_LIVE_MAX,
  );
  return uncovered.length >= (opts.triggerMsgs ?? OC_CHAT_MEMORY_TRIGGER_MSGS);
}

export function formatOcChatMemoryTranscript(messages: OcChatMemoryMsg[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'OC' : '유저';
    const kind = m.kind || 'chat';
    let body = String(m.content || '').trim();
    if (kind === 'sticker') body = body || '(스티커)';
    if (kind === 'choice' && body) body = `(선택) ${body}`;
    if (!body) continue;
    if (body.length > 220) body = `${body.slice(0, 217)}…`;
    lines.push(`${role}: ${body}`);
  }
  return lines.join('\n');
}

export function capOcChatMemorySummary(
  text: string,
  maxChars = OC_CHAT_MEMORY_MAX_CHARS,
): string {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxChars) return t;
  /* 앞(더 오래된) 쪽을 잘라 최근 사실 우선 유지 */
  const cut = t.slice(t.length - maxChars);
  const sp = cut.indexOf(' ');
  const trimmed = sp > 0 && sp < 40 ? cut.slice(sp + 1) : cut;
  return `…${trimmed.trim()}`;
}

/**
 * 500자 초과 시 " / "·";" 항목 중 앞(오래된)부터 제거 후 재압축.
 */
export function compactOcChatMemorySummary(
  text: string,
  maxChars = OC_CHAT_MEMORY_MAX_CHARS,
): string {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;

  const parts = cleaned
    .split(/\s*[/|;]\s*/)
    .map((p) => p.replace(/^…+/, '').trim())
    .filter(Boolean);

  if (parts.length <= 1) return capOcChatMemorySummary(cleaned, maxChars);

  const kept = [...parts];
  while (kept.length > 1 && kept.join(' / ').length > maxChars) {
    kept.shift();
  }
  return capOcChatMemorySummary(kept.join(' / '), maxChars);
}

/** 기존 요약 + 신규 요약을 합친 뒤 길이 상한 */
export function mergeOcChatMemorySummaries(
  existing: string | undefined,
  incoming: string,
  maxChars = OC_CHAT_MEMORY_MAX_CHARS,
): string {
  const a = String(existing || '').trim();
  const b = String(incoming || '').trim();
  if (!a) return compactOcChatMemorySummary(b, maxChars);
  if (!b) return compactOcChatMemorySummary(a, maxChars);
  if (a.includes(b)) return compactOcChatMemorySummary(a, maxChars);
  if (b.includes(a)) return compactOcChatMemorySummary(b, maxChars);
  return compactOcChatMemorySummary(`${a} / ${b}`, maxChars);
}

export function ocChatMemoryPromptLines(summary: string | undefined): string[] {
  const s = compactOcChatMemorySummary(String(summary || '').trim());
  if (!s) return [];
  return [
    '이전 대화 요약 (장기 기억 — 최근 말풍선 창 밖 내용):',
    s,
    '- 위 요약의 이름·사실·약속·감정 흐름을 최근 대화와 모순되지 않게 이어가라.',
    '- 요약에 없는 일을 지어내지 마라. 요약·최근 대화에 없으면 모르는 척하거나 짧게 물어라.',
  ];
}

export function buildOcChatMemoryRefreshSystemPrompt(): string {
  return [
    '당신은 롤플레이 채팅의 장기 기억 요약기입니다.',
    '주어진 기존 요약(있으면)과 새 대화 구간을 합쳐, 한 덩어리의 한국어 요약만 출력하세요.',
    '',
    '넣을 것:',
    '- 유저가 밝힌 신상·호칭·관계·취향·소속',
    '- 감정적으로 의미 있었던 순간',
    '- 캐릭터(OC)가 한 약속·언급·결정',
    '- 앞으로 이어서 말할 때 필요한 사실',
    '',
    '빼는 것: 잡담·맞장구·반복 인사·의미 없는 필러.',
    '',
    `출력: 평문 한 덩어리만. 최대 ${OC_CHAT_MEMORY_MAX_CHARS}자. 머리말·불릿·JSON·따옴표 감싸기 금지.`,
  ].join('\n');
}

export function buildOcChatMemoryRefreshUserPrompt(opts: {
  existingSummary?: string;
  transcript: string;
}): string {
  const existing = String(opts.existingSummary || '').trim();
  const parts = [
    existing ? `기존 요약:\n${existing}` : '기존 요약: (없음)',
    '',
    '새로 반영할 대화 구간:',
    opts.transcript || '(없음)',
    '',
    '위 내용을 반영한 통합 요약만 출력하세요.',
  ];
  return parts.join('\n');
}

/** 모델 응답에서 요약 본문만 추출 */
export function parseOcChatMemorySummaryOutput(raw: string): string {
  let t = String(raw || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  t = t.replace(/^["「]|["」]$/g, '').trim();
  return compactOcChatMemorySummary(t);
}
