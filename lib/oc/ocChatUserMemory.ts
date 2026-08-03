/**
 * 유저별 지속 기억 (userMemory) — 유저가 밝힌 개인 사실만 요약·저장.
 * memorySummary(대화 구간 요약)와 별개. 최근 라이브 창 밖 사실도 프롬프트에 유지.
 */

export const OC_CHAT_USER_MEMORY_MAX_CHARS = 400;
/** 이보다 짧으면 사실 추출 스킵 (잡담만) */
export const OC_CHAT_USER_MEMORY_MIN_SCAN_CHARS = 4;

export type OcChatUserMemoryMsg = {
  role?: string;
  content?: string;
  at?: number;
  kind?: string;
};

/** 전화번호·이메일·상세주소·계좌 등 — 저장·프롬프트에 남기지 않음 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,
  /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\b\d{2,3}[-\s]?\d{2}[-\s]?\d{6,7}\b/g,
  /(?:계좌|카드|주민|여권|운전면허)[^\n]{0,24}\d{4,}/g,
  /(?:우편번호|zip)\s*[:：]?\s*\d{5}/gi,
  /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[\s가-힣]{0,8}(?:시|군|구)[\s가-힣0-9-]{2,40}(?:로|길|동|번지|아파트|호)/g,
  /\d{1,3}번지|\d{1,4}호실?|\d동\s*\d+호/g,
  /(?:카톡|카카오|디스코드|텔레그램|인스타|페이스북)\s*(?:아이디|ID|id|계정)?\s*[:：]?\s*[a-zA-Z0-9._-]{3,}/gi,
  /https?:\/\/[^\s]+/gi,
];

const PERSONAL_CUE_RE =
  /이름|별명|닉네임|불러\s*줘|불러줘|나는\s|난\s|제가\s|저\s*는|내\s*이름|제\s*이름|생일|생신|태어|나이|살이야|좋아하는|좋아해|싫어하는|싫어해|취미|특기|학교|학년|반이|직장|회사|알바|남친|여친|애인|친구|가족|동생|형|누나|언니|오빠|엄마|아빠|부모님|반려|강아지|고양이|어제|오늘\s*.{0,12}(?:했|갔|봤|먹|만났)|요즘|최근|시험|여행|이사|이직|졸업|입학|취업|소개팅|고백|헤어|싸웠|다퉜|약속|다음\s*주|주말|mbti|혈액형|키는|몇\s*살/i;

export function redactOcChatUserMemorySensitive(text: string): string {
  let t = String(text || '');
  for (const re of SENSITIVE_PATTERNS) {
    t = t.replace(re, '[삭제]');
  }
  return t
    .replace(/\[삭제\](?:\s*[|/·,，]\s*\[삭제\])+/g, '[삭제]')
    .replace(/\s*\[삭제\]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function capOcChatUserMemory(
  text: string,
  maxChars = OC_CHAT_USER_MEMORY_MAX_CHARS,
): string {
  const t = redactOcChatUserMemorySensitive(
    String(text || '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (t.length <= maxChars) return t;
  const cut = t.slice(t.length - maxChars);
  const sp = cut.indexOf(' ');
  const trimmed = sp > 0 && sp < 48 ? cut.slice(sp + 1) : cut;
  return `…${trimmed.trim()}`;
}

/**
 * 길이 초과 시 앞(오래된) 항목부터 제거.
 * 구분자: " / " · ";" · 줄바꿈.
 */
export function compactOcChatUserMemory(
  text: string,
  maxChars = OC_CHAT_USER_MEMORY_MAX_CHARS,
): string {
  const cleaned = redactOcChatUserMemorySensitive(
    String(text || '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;

  const parts = cleaned
    .split(/\s*[/|;]\s*|\s{2,}/)
    .map((p) => p.replace(/^…+/, '').trim())
    .filter(Boolean);

  if (parts.length <= 1) return capOcChatUserMemory(cleaned, maxChars);

  const kept = [...parts];
  while (kept.length > 1 && kept.join(' / ').length > maxChars) {
    kept.shift();
  }
  return capOcChatUserMemory(kept.join(' / '), maxChars);
}

export function mergeOcChatUserMemory(
  existing: string | undefined,
  incoming: string,
  maxChars = OC_CHAT_USER_MEMORY_MAX_CHARS,
): string {
  const a = redactOcChatUserMemorySensitive(String(existing || '').trim());
  const b = redactOcChatUserMemorySensitive(String(incoming || '').trim());
  if (!a) return compactOcChatUserMemory(b, maxChars);
  if (!b) return compactOcChatUserMemory(a, maxChars);
  if (a.includes(b)) return compactOcChatUserMemory(a, maxChars);
  if (b.includes(a)) return compactOcChatUserMemory(b, maxChars);
  return compactOcChatUserMemory(`${a} / ${b}`, maxChars);
}

export function ocChatUserMessagesSince(
  messages: OcChatUserMemoryMsg[],
  throughAt: number | undefined,
): OcChatUserMemoryMsg[] {
  const floor = typeof throughAt === 'number' && Number.isFinite(throughAt) ? throughAt : 0;
  return messages.filter((m) => {
    if (m.role !== 'user') return false;
    const kind = m.kind || 'chat';
    if (kind === 'narration' || kind === 'story') return false;
    const at = typeof m.at === 'number' ? m.at : 0;
    if (at <= floor) return false;
    return Boolean(String(m.content || '').trim());
  });
}

export function shouldScanOcChatUserMemory(messages: OcChatUserMemoryMsg[]): boolean {
  if (!messages.length) return false;
  let chars = 0;
  let cue = false;
  for (const m of messages) {
    const body = String(m.content || '').trim();
    if (!body) continue;
    chars += body.length;
    if (PERSONAL_CUE_RE.test(body)) cue = true;
  }
  if (chars < OC_CHAT_USER_MEMORY_MIN_SCAN_CHARS) return false;
  return cue;
}

export function formatOcChatUserMemoryTranscript(messages: OcChatUserMemoryMsg[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    let body = redactOcChatUserMemorySensitive(String(m.content || '').trim());
    if (!body) continue;
    if (body.length > 200) body = `${body.slice(0, 197)}…`;
    lines.push(`유저: ${body}`);
  }
  return lines.join('\n');
}

export function lastOcChatUserMessageAt(messages: OcChatUserMemoryMsg[]): number | undefined {
  let max = 0;
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const at = typeof m.at === 'number' ? m.at : 0;
    if (at > max) max = at;
  }
  return max > 0 ? max : undefined;
}

export function ocChatUserMemoryPromptLines(userMemory: string | undefined): string[] {
  const s = compactOcChatUserMemory(String(userMemory || '').trim());
  if (!s) return [];
  return [
    '유저에 대해 기억 중인 사실 (userMemory — 유저가 직접 밝힌 것만, 대화 기록 밖도 포함):',
    s,
    '- 호칭·취향·관계·최근 일 등 위 사실을 자연스럽게 반영하라. 요약·최근 말풍선과 모순되면 더 최근·직접 발언을 우선한다.',
    '- 여기 없는 신상·일정을 지어내지 마라. 주소·전화번호·계좌 등 민감정보를 묻거나 아는 척하지 마라.',
  ];
}

export function buildOcChatUserMemoryRefreshSystemPrompt(): string {
  return [
    '당신은 롤플레이 채팅용 "유저 사실 메모" 작성기입니다.',
    '유저가 스스로 밝힌 개인 정보만 짧은 한국어 평문으로 정리하세요.',
    '',
    '넣을 것 (있으면):',
    '- 이름·별명·원하는 호칭',
    '- 생일·나이대(대략)',
    '- 좋아하는 것·싫어하는 것·취미',
    '- 관계(친구·연인·가족 등)와 관련 인물(이름만)',
    '- 최근 겪은 일·계획(시험·여행·이사 등) 중 이어갈 가치가 있는 것',
    '',
    '빼는 것:',
    '- 잡담·맞장구·이모티콘만',
    '- 캐릭터(OC)의 말·약속 (그건 다른 요약에 둠)',
    '- 주소·전화번호·이메일·계좌·주민번호·정확한 거주지·메신저 ID 등 민감정보',
    '- 추측·추론으로 채운 사실',
    '',
    '기존 메모와 새 발언이 겹치면 최신·더 구체적인 쪽으로 합치세요.',
    `출력: 평문 한 덩어리만. " / "로 항목 구분 가능. 최대 ${OC_CHAT_USER_MEMORY_MAX_CHARS}자.`,
    '머리말·불릿·JSON·따옴표 감싸기 금지. 새 사실이 없으면 빈 문자열만.',
  ].join('\n');
}

export function buildOcChatUserMemoryRefreshUserPrompt(opts: {
  existingMemory?: string;
  transcript: string;
}): string {
  const existing = String(opts.existingMemory || '').trim();
  return [
    existing ? `기존 userMemory:\n${existing}` : '기존 userMemory: (없음)',
    '',
    '새로 반영할 유저 발언:',
    opts.transcript || '(없음)',
    '',
    '통합 userMemory만 출력하세요. 새 사실이 없으면 빈 줄만.',
  ].join('\n');
}

export function parseOcChatUserMemoryOutput(raw: string): string {
  let t = String(raw || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  t = t.replace(/^["「]|["」]$/g, '').trim();
  if (/^(없음|없다|없음\.|없음요|n\/?a|none)$/i.test(t)) return '';
  return compactOcChatUserMemory(t);
}
