import type { OcChatBehavior } from '@/lib/oc/ocChatBehavior';
import {
  applyEveMechanicalFilters,
  isEvePunctuationOnly,
  stripEveTrailingPeriod,
} from '@/lib/oc/ocChatEveStyle';

const VERIFY_SYSTEM = `당신은 대화 품질 검사기입니다. 사용자의 이번 턴 발화(연속 메시지면 전부)와 캐릭터 답변 후보를 보고 판단하세요.

다음 중 하나라도 해당하면 "no":
- 답변이 사용자가 실제로 한 말과 무관한 화제로 새는 경우
- 사용자가 묻지 않은 것에 답하는 경우
- 문장이 접속사·조사·명사 등으로 뚝 끊겨서 문법적으로 안 끝난 경우
- 의미 없는 필러만 있고 실질 반응이 없는 경우
- 실질 질문에 단순 맞장구·감사만으로 답을 대체한 경우
- 같은 취지의 짧은 맞장구만 2~3개로 쪼개 보낸 경우(예: "그래"/"그렇구나"/"그게 편하긴 하지")
- 사용자가 한 말의 핵심(질문·요청·감정·되묻기)을 무시하는 경우
- 연속 메시지 중 앞부분만 반영하고 가장 최근 유저 말을 무시하는 경우
- 연속 메시지인데 마지막 말만 받고 앞 맥락(직전 유저 말의 핵심)을 통째로 무시하는 경우
- 연속 메시지 마지막이 질문("뭐 해","어디야" 등)인데 앞선 말(쉴게요·감사 등)에만 답하고 질문을 내용으로 받지 않은 경우
- 캐릭터의 직전 대사와 동일·거의 동일한 문장 골격(단어만 바꾼 동어반복 포함)을 다시 쓰는 경우
- 유저가 직전 답을 되묻거나 설명을 요청했는데, 같은 문장만 반복하고 새 정보가 없는 경우

정상적으로 대응하면 "yes".
"yes" 또는 "no" 한 단어만 출력하세요. 다른 설명은 절대 붙이지 마세요.`;

/** 조사·접속사 등으로 끊긴 말풍선 (로컬 빠른 탈락) */
export function looksTruncatedBubble(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/[…\.\!\?~\)]$/.test(t)) return false;
  if (/[ㅋㅎㅠㅜㄷㅇ]$/.test(t)) return false;
  /* 조사·어미 조각으로 끝남 */
  if (
    /(은|는|이|가|을|를|의|와|과|로|으로|고|며|데|도|만|부터|까지|한테|에게|께서|에서|이나|거나|든지)$/.test(
      t,
    )
  ) {
    return true;
  }
  /* 한 글자·미완성처럼 보이는 경우 */
  if (t.length === 1 && !/[응어아오응냐네야뭐왜헐]/.test(t)) return true;
  return false;
}

/** 질문·현황 묻기 등 — 연타 마지막이 질문인데 감사만 하면 탈락용 */
export function looksLikeUserQuestion(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[?？]/.test(t)) return true;
  if (
    /(뭐\s*해|뭐하|뭐\s*하|어떻게|어디|언제|누구|왜|어때|인가요|나요|까요|습니까|해요\?|예요\?|인가요)/.test(
      t,
    )
  ) {
    return true;
  }
  if (/(가요|나요|까요|해요|예요|이죠)\s*$/.test(t)) return true;
  return false;
}

/** 직전 답을 되묻거나 보충을 요구하는 짧은 후속 (왜/그래서/그게 무슨 등) — 특정 문구에만 한정하지 않음 */
export function looksLikeElaborationFollowUp(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length > 40) return false;
  if (/^(왜|어째서|이유가|그래서|그게|무슨|뭔가|어떻게|더|그럼|응\?|헐\?|진짜\?|심각이요)/.test(t)) {
    return true;
  }
  if (/^(왜요|왜죠|왜임|와이|어째서요|그게\s*뭐|무슨\s*말|더\s*말|설명해)/.test(t)) return true;
  if (/왜\s*[?？]?$/.test(t)) return true;
  if (/(왜|어째서|이유가|설명해|자세히|더\s*알려)/.test(t) && t.length <= 24) return true;
  return false;
}

/** @deprecated use looksLikeElaborationFollowUp */
export function looksLikeWhyFollowUp(text: string): boolean {
  return looksLikeElaborationFollowUp(text);
}

function normalizeForCompare(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.…·~!?？！,.，。\"'“”‘’\-—]/g, '');
}

/**
 * 짧은 맞장구·추임새만 있는 말풍선.
 * "그래" / "그렇구나" / "그게 편하긴 하지" 처럼 같은 취지를 여러 개로 쪼갤 때 탐지용.
 */
export function looksLikeShortBackchannel(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (Array.from(raw).length > 28) return false;
  if (/[?？]/.test(raw)) return false;
  const compact = normalizeForCompare(raw);
  if (!compact) return true;
  if (compact.length > 18) return false;
  if (
    /^(아+|어+|음+|응+|ㅇㅇ|ㅇㅋ|그래요?|그치|그렇구나|그렇네|그런가|그랬구나|그랬네|맞아|맞아요|알겠어|알았어|아하|헐|하+|ㅋ+|ㅎ+|오+|와+|네+|예+|흠+|흐음|오키|okay|ok|그쳐|응응|아아|음음|그래그래)/.test(
      compact,
    )
  ) {
    return true;
  }
  if (
    /(그렇구나|그렇네|그랬구나|편하긴|좋지|좋아|괜찮아|알겠어|맞아|그렇긴해|그렇지|그거야|그런가)/.test(
      compact,
    )
  ) {
    return true;
  }
  return false;
}

function charBigrams(s: string): Set<string> {
  const chars = Array.from(s);
  const out = new Set<string>();
  if (chars.length <= 1) {
    if (chars[0]) out.add(chars[0]);
    return out;
  }
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i]! + chars[i + 1]!);
  return out;
}

function jaccardBigrams(a: string, b: string): number {
  const A = charBigrams(a);
  const B = charBigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** 같은 턴·직전 말풍선끼리 동의어 반복인지 (깨어/멍함 등 패러프레이즈) */
export function areNearDuplicateLines(a: string, b: string): boolean {
  const ca = normalizeForCompare(a);
  const cb = normalizeForCompare(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const shorter = ca.length <= cb.length ? ca : cb;
  const longer = ca.length <= cb.length ? cb : ca;
  if (shorter.length >= 4 && longer.includes(shorter) && shorter.length / longer.length >= 0.68) {
    return true;
  }
  if (jaccardBigrams(ca, cb) >= 0.42) return true;

  /* 의미 축 겹침: 일어남/방금 깸, 멍/몽롱 등 */
  const axes: RegExp[] = [
    /일어|깼|기상|깨어/,
    /멍|몽롱|졸|피곤|잠/,
    /뭐해|뭐하|무슨일|왜/,
    /밥|먹|배고/,
    /학교|수업|일가|출근/,
    /미안|죄송|괜찮아|고마|감사/,
  ];
  let sharedAxes = 0;
  for (const re of axes) {
    if (re.test(ca) && re.test(cb)) sharedAxes += 1;
  }
  if (sharedAxes >= 1 && Math.min(ca.length, cb.length) <= 22 && jaccardBigrams(ca, cb) >= 0.28) {
    return true;
  }
  return false;
}

/** 한 턴 messages가 전부 같은 취지 짧은 맞장구인지 */
export function isStackedSameIntentShortBubbles(messages: string[]): boolean {
  const lines = messages.map((m) => String(m || '').trim()).filter(Boolean);
  if (lines.length < 2) return false;
  return lines.every(looksLikeShortBackchannel);
}

/** 한 턴 안에 서로 비슷한 말이 2개 이상인지 */
export function isStackedNearDuplicateBubbles(messages: string[]): boolean {
  const lines = messages.map((m) => String(m || '').trim()).filter(Boolean);
  if (lines.length < 2) return false;
  if (isStackedSameIntentShortBubbles(lines)) return true;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (areNearDuplicateLines(lines[i]!, lines[j]!)) return true;
    }
  }
  return false;
}

/**
 * 한 턴 응답 정리:
 * 1) 짧은 맞장구 연쇄 축약
 * 2) 패러프레이즈 중복 제거
 * 3) 최대 2말풍선 (질문 1 + 본문 1 정도)
 */
export function collapseSameIntentShortBubbles(messages: string[]): string[] {
  const raw = messages.map((m) => String(m || '').trim()).filter(Boolean);
  if (raw.length <= 1) return raw;

  let lines = raw;
  if (isStackedSameIntentShortBubbles(lines)) {
    const best = lines.reduce((a, b) =>
      Array.from(b).length > Array.from(a).length ? b : a,
    );
    console.info('[oc-chat] collapse same-intent short bubbles', {
      before: raw,
      after: [best],
    });
    return [best];
  }

  const fillers = lines.filter(looksLikeShortBackchannel);
  const content = lines.filter((m) => !looksLikeShortBackchannel(m));
  if (fillers.length >= 2 && content.length >= 1) {
    lines = content;
  }

  const kept: string[] = [];
  for (const line of lines) {
    if (kept.some((k) => areNearDuplicateLines(k, line))) continue;
    kept.push(line);
  }

  /* 하드 캡 2 — 본문 1 + (있으면) 마지막 질문 1 */
  let out = kept;
  if (out.length > 2) {
    const isQ = (m: string) => /[?？]|무슨\s*일|뭐\s*해|뭐하|어때/.test(m);
    const questions = out.filter(isQ);
    const rest = out.filter((m) => !isQ(m));
    const body =
      rest.sort((a, b) => Array.from(b).length - Array.from(a).length)[0] ||
      questions[0];
    const q = questions.length ? questions[questions.length - 1] : undefined;
    const pick = [body, q && q !== body ? q : undefined].filter(Boolean) as string[];
    out = kept.filter((m) => pick.includes(m)).slice(0, 2);
  }

  if (out.length !== raw.length || out.some((m, i) => m !== raw[i])) {
    console.info('[oc-chat] collapse redundant reply bubbles', {
      before: raw,
      after: out,
    });
  }
  return out;
}

/** 후보 답이 최근 자기 말과 동일/거의 동일하면 true */
export function isNearDuplicateReply(
  candidateMessages: string[],
  recentAssistantMessages: string[],
): boolean {
  const cands = candidateMessages.map(normalizeForCompare).filter((s) => s.length >= 2);
  const recent = recentAssistantMessages
    .map(normalizeForCompare)
    .filter((s) => s.length >= 2)
    .slice(-8);
  if (!cands.length || !recent.length) return false;
  for (const c of cands) {
    for (const r of recent) {
      if (c === r) return true;
      const shorter = c.length <= r.length ? c : r;
      const longer = c.length <= r.length ? r : c;
      if (shorter.length >= 4 && longer.includes(shorter) && shorter.length / longer.length >= 0.72) {
        return true;
      }
    }
  }
  return false;
}

/** 질문인데 짧은 맞장구·감사만 있는 답 — LLM 검증 전에 탈락 */
export function looksLikeIgnoredQuestionReply(
  lastUserMessage: string,
  candidateMessages: string[],
): boolean {
  if (!looksLikeUserQuestion(lastUserMessage)) return false;
  const joined = candidateMessages.map((m) => String(m || '').trim()).filter(Boolean).join(' ');
  if (!joined) return false;
  const compact = joined.replace(/\s+/g, '');
  /* 짧은 감사/맞장구만 */
  if (compact.length > 36) return false;
  if (
    /^(…|\.{2,}|…+)?(응|어|그래|ㅇㅇ|아|음)?[,.]*(고마워|고맙|ㄱㅅ|감사|알겠어|ㅇㅋ|ㅋㅋ|ㅎㅎ)?[.!~…]*$/i.test(
      compact,
    )
  ) {
    return true;
  }
  if (/고마워|고맙|ㄱㅅ|감사/.test(compact) && !/(뭐\s*해|뭐하|지금|집|학교|일중|밖에|방에서)/.test(compact)) {
    return true;
  }
  return false;
}

/**
 * 연타 마지막이 질문인데, 답이 앞선 말(쉴게요·감사 등)만 받고 질문을 놓친 경우.
 * 예: ["맛있었어","이제 쉴려구요","뭐 하고 있었어요?"] → "푹 쉬어 / 내일 또" 만.
 */
export function looksLikeMissedBurstLastQuestion(
  recentUserBurst: string[] | undefined,
  candidateMessages: string[],
): boolean {
  const burst = (recentUserBurst || []).map((m) => String(m || '').trim()).filter(Boolean);
  if (burst.length < 2) return false;
  const last = burst[burst.length - 1]!;
  if (!looksLikeUserQuestion(last)) return false;

  const joined = candidateMessages.map((m) => String(m || '').trim()).filter(Boolean).join(' ');
  if (!joined) return false;

  const isStatusAsk =
    /(뭐\s*해|뭐하|뭐\s*하고|뭐하냐|뭐해요|뭐했어|뭐하고|어디\s*야|어디야|어떻게\s*지내)/.test(last);
  /* 현황 답 단서 — 너무 짧은 조각(일·집)은 '내일/시집' 등에 걸려 오탐 */
  const hasStatusAnswer =
    /(그냥\s*(있|누워|앉아|봐|듣)|누워\s*있|앉아\s*있|보고\s*있|듣고\s*있|하는\s*중|집에서|밖에\s*있|학교|일하는|일\s*중|알바|게임|공부|자는\s*중|방금\s*깼|멍해|폰\s*보|톡하|쉬고\s*있|쉬던|있었어|하고\s*있|유튜브|넷플|만화)/.test(
      joined,
    );
  const isClosingOrRestAck =
    /(푹\s*쉬|쉬어|쉬자|내일\s*또|다음에|잘\s*자|자요|이만|끊|배부르|따뜻할\s*때)/.test(joined);

  /* 현황 질문인데 마무리·휴식 응답만 */
  if (isStatusAsk && isClosingOrRestAck && !hasStatusAnswer) return true;

  /* 일반적인 마지막 질문: 답이 앞선 비질문 줄의 키워드만 메아리치고 질문 축이 없음 */
  const earlier = burst.slice(0, -1).join(' ');
  const lastAskAxes: RegExp[] = [
    /뭐\s*해|뭐하|하고\s*있/,
    /어디/,
    /언제/,
    /왜/,
    /어때|어떻/,
    /누구/,
  ];
  let lastHasAxis = false;
  for (const re of lastAskAxes) {
    if (re.test(last)) {
      lastHasAxis = true;
      break;
    }
  }
  if (!lastHasAxis) return false;

  /* 답에 질문 축 단서가 거의 없고, 앞 문장(쉴/맛있/고마) 축만 있으면 누락으로 본다 */
  const replyHitsLastAxis = lastAskAxes.some((re) => re.test(last) && (
    (re.source.includes('뭐') && hasStatusAnswer) ||
    (re.source.includes('어디') && /(집|밖|학교|카페|방|여기|거기)/.test(joined)) ||
    (re.source.includes('언제') && /(지금|아까|방금|나중에|내일|어제)/.test(joined)) ||
    (re.source.includes('왜') && /(그냥|때문에|라서|같아서)/.test(joined)) ||
    (re.source.includes('어때') && /(괜찮|좋아|별로|그냥|그럭)/.test(joined)) ||
    (re.source.includes('누구') && /(나|친구|애|사람)/.test(joined))
  ));
  if (replyHitsLastAxis) return false;

  const earlierRest = /(쉬|자|피곤|배부르|맛있|고마|감사)/.test(earlier);
  if (earlierRest && isClosingOrRestAck) return true;
  return false;
}

export function defaultVerifyModel(): string {
  return (process.env.ANTHROPIC_VERIFY_MODEL || 'claude-haiku-4-5-20251001').trim();
}

export async function verifyOcChatRelevance(opts: {
  lastUserMessage: string;
  recentUserBurst?: string[];
  recentAssistantMessages?: string[];
  candidateMessages: string[];
  callModel: (system: string, userContent: string) => Promise<string>;
}): Promise<boolean> {
  const msgs = opts.candidateMessages.map((m) => String(m || '').trim()).filter(Boolean);
  if (!msgs.length) return true;
  if (msgs.some((m) => looksTruncatedBubble(m))) return false;

  const last = String(opts.lastUserMessage || '').trim();
  if (!last) return true;

  const burst = (opts.recentUserBurst || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean);

  if (looksLikeIgnoredQuestionReply(last, msgs)) return false;
  if (looksLikeMissedBurstLastQuestion(burst, msgs)) return false;
  if (isStackedNearDuplicateBubbles(msgs)) return false;

  const recentAsst = (opts.recentAssistantMessages || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean);
  if (isNearDuplicateReply(msgs, recentAsst)) return false;
  if (looksLikeElaborationFollowUp(last) && isNearDuplicateReply(msgs, recentAsst.slice(-4))) {
    return false;
  }

  const burstBlock =
    burst.length > 1
      ? `사용자가 연속으로 보낸 메시지(한 턴 전체 맥락):
${burst.map((m, i) => `${i + 1}. "${m}"`).join('\n')}
답변은 위 메시지들을 모두 반영한 한 번의 반응이어야 합니다. 특히 마지막 줄이 질문·요청이면 반드시 내용으로 답해야 합니다. 앞부분만 받거나 마지막만 받아도 "no".
`
      : '';
  const recentBlock =
    recentAsst.length > 0
      ? `캐릭터의 직전 대사(참고·복붙 금지): ${recentAsst.slice(-3).map((m) => `"${m}"`).join(' / ')}
`
      : '';

  const userTurn = `${burstBlock}${recentBlock}사용자 이번 턴(마지막 줄): "${last}"
캐릭터 답변 후보: ${msgs.map((m) => `"${m}"`).join(' / ')}

이 답변이 이번 턴 유저 말 전체 맥락에 실제로 대응합니까? 직전 대사와 똑같은 복붙이면 "no".`;

  try {
    const raw = await opts.callModel(VERIFY_SYSTEM, userTurn);
    const ans = raw.trim().toLowerCase();
    if (ans.startsWith('yes')) return true;
    if (ans.startsWith('no')) return false;
    console.warn('[oc-chat] verify ambiguous response (expected yes/no)', {
      ans: ans.slice(0, 80),
      lastUserMessagePreview: last.slice(0, 80),
      candidateCount: msgs.length,
      burstCount: burst.length,
    });
    /* 연타+질문·왜 되묻기·직전 복붙 의심이면 애매해도 탈락 */
    if (burst.length > 1 && looksLikeUserQuestion(last)) return false;
    if (looksLikeElaborationFollowUp(last)) return false;
    return true;
  } catch (e) {
    console.warn('[oc-chat] verify call failed, accepting candidate', e);
    return true;
  }
}

export type OcChatVerifyFailReason =
  | 'command_ending'
  | 'punctuation_only'
  | 'mechanical_filter'
  | 'context_mismatch'
  | 'duplicate_reply'
  | 'stacked_filler';

export function buildOcChatRetryUserNotice(
  lastUserMessage: string,
  reason: OcChatVerifyFailReason = 'context_mismatch',
  recentUserBurst?: string[],
  recentAssistantMessages?: string[],
): string {
  const last = String(lastUserMessage || '').trim().slice(0, 400);
  if (
    reason === 'command_ending' ||
    reason === 'punctuation_only' ||
    reason === 'mechanical_filter'
  ) {
    return `[시스템 알림: 명령형 어미로 끝나는 문장이 있거나, 구두점만으로 이루어진 메시지(예: ".....")가 있었습니다. 명령형을 쓰지 말고, 할 말이 없다면 action을 read_only/ignore로 바꾸거나 실제 내용이 담긴 문장으로 다시 쓰세요. 이브면 평서문 끝 마침표도 빼세요. JSON만 출력.]`;
  }
  if (reason === 'stacked_filler') {
    return `[시스템 알림: 같은 취지·비슷한 말("방금 깼어"/"아직 멍해" 반복 등)을 messages에 여러 개로 쪼개 보냈습니다. messages는 최대 2개, 각 줄 내용이 달라야 합니다. 맞장구·상황 묘사는 한 문장으로 합치고 필요하면 질문 하나만 덧붙이세요. 유저 이번 턴("${last}")에 맞게 다시 쓰세요. JSON만 출력.]`;
  }
  if (reason === 'duplicate_reply') {
    const banned = (recentAssistantMessages || [])
      .map((m) => String(m || '').trim())
      .filter(Boolean)
      .slice(-4);
    const banLine = banned.length
      ? `금지(그대로·거의 그대로 재사용 금지): ${banned.map((m) => `"${m}"`).join(' / ')}.`
      : '직전 자기 대사를 그대로 다시 쓰지 마세요.';
    return `[시스템 알림: 방금 답이 직전 대사와 동일·거의 동일했습니다. ${banLine} 사용자 이번 턴("${last}" 포함) 맥락에 맞게 다른 문장·각도로 새로 짧게 답하세요. 할 말이 없으면 action을 read_only/ignore. JSON만 출력.]`;
  }
  const burst = (recentUserBurst || []).map((m) => String(m || '').trim()).filter(Boolean);
  if (burst.length > 1) {
    const listed = burst.map((m, i) => `${i + 1}) "${m.slice(0, 120)}"`).join(' ');
    const lastQ = looksLikeUserQuestion(burst[burst.length - 1] || '')
      ? ' 특히 마지막 질문이 있으면 그 내용에 반드시 답하고, 앞선 말(쉴게요·감사 등)만으로 대화를 끝내지 마세요.'
      : '';
    return `[시스템 알림: 방금 답변이 연속 메시지 전체 맥락을 반영하지 못했습니다(${listed}). 앞·뒤 메시지를 모두 읽고 한 번의 자연스러운 답으로 다시 쓰세요. 마지막만·앞부분만 편향 금지.${lastQ} JSON만 출력.]`;
  }
  return `[시스템 알림: 방금 답변이 사용자 이번 턴("${last}")과 맥락이 맞지 않았거나, 직전 대사를 반복했거나, 문장이 끊겼습니다. 같은 문장 반복 금지. 유저 말 핵심에 맞게 캐릭터답게 새로 짧게 답하세요. 되묻기·설명 요청이면 새 정보를 한 줄이라도 보태세요. JSON만 출력.]`;
}

export type VerifiedOcChatGenerateResult = {
  raw: string;
  behavior: OcChatBehavior;
  regenerated: boolean;
  verifyPassed: boolean;
};

/**
 * 생성 → (이브)기계적 필터 → 맥락 검증 → 실패 시 최대 2회 재생성.
 * ignore/read_only 등 messages=[] 는 검증 생략.
 * 직전 대사 복붙은 최종 시도에서도 통과시키지 않는다(같으면 read_only로 강등).
 */
export async function generateVerifiedOcChatResponse(opts: {
  lastUserMessage: string;
  /** 연타로 묶인 최근 유저 말들(시간순). 2개 이상이면 마지막 무시 검증 강화 */
  recentUserBurst?: string[];
  /** 직전 어시스턴트 말풍선들 — 복붙 반복 탈락용 */
  recentAssistantMessages?: string[];
  historyForModel: { role: string; content: string }[];
  generate: (
    messages: { role: string; content: string }[],
  ) => Promise<string>;
  verify: (system: string, userContent: string) => Promise<string>;
  parse: (raw: string) => OcChatBehavior;
  /** 이브만 마침표 제거·명령형 재생성을 켠다 */
  eveStyle?: boolean;
}): Promise<VerifiedOcChatGenerateResult> {
  let raw = await opts.generate(opts.historyForModel);
  let behavior = opts.parse(raw);
  let regenerated = false;
  let verifyPassed = true;
  const recentAsst = (opts.recentAssistantMessages || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean);

  const verifyOrFixOnce = async (b: OcChatBehavior): Promise<{
    behavior: OcChatBehavior;
    failReason: OcChatVerifyFailReason | null;
  }> => {
    if (!(b.action === 'respond' && b.messages.length > 0)) {
      return { behavior: b, failReason: null };
    }

    let failReason: OcChatVerifyFailReason | null = null;
    let next = b;

    if (opts.eveStyle) {
      const { fixed, needsRegeneration, failKind } = applyEveMechanicalFilters(
        next.messages,
      );
      next = { ...next, messages: fixed };
      if (needsRegeneration) {
        failReason =
          failKind === 'punctuation_only' ? 'punctuation_only' : 'command_ending';
      }
    }

    if (!failReason && isNearDuplicateReply(next.messages, recentAsst)) {
      failReason = 'duplicate_reply';
    }

    if (!failReason && isStackedNearDuplicateBubbles(next.messages)) {
      failReason = 'stacked_filler';
      console.warn('[oc-chat] stacked near-duplicate reply bubbles', {
        lastUserMessage: opts.lastUserMessage.slice(0, 120),
        messages: next.messages,
      });
    }

    if (!failReason) {
      const ok = await verifyOcChatRelevance({
        lastUserMessage: opts.lastUserMessage,
        recentUserBurst: opts.recentUserBurst,
        recentAssistantMessages: opts.recentAssistantMessages,
        candidateMessages: next.messages,
        callModel: opts.verify,
      });
      if (!ok) {
        failReason = isNearDuplicateReply(next.messages, recentAsst)
          ? 'duplicate_reply'
          : isStackedNearDuplicateBubbles(next.messages)
            ? 'stacked_filler'
            : 'context_mismatch';
      }
    }

    return { behavior: next, failReason };
  };

  const finalizeMessages = (b: OcChatBehavior): OcChatBehavior => {
    if (!(b.action === 'respond' || b.action === 'end_for_today') || !b.messages.length) {
      return b;
    }
    const collapsed = collapseSameIntentShortBubbles(b.messages);
    if (collapsed === b.messages || (collapsed.length === b.messages.length && collapsed.every((m, i) => m === b.messages[i]))) {
      return b;
    }
    return { ...b, messages: collapsed };
  };

  const regenerateOnce = async (previousRaw: string, failReason: OcChatVerifyFailReason) => {
    const retryHistory = [
      ...opts.historyForModel,
      { role: 'assistant', content: previousRaw },
      {
        role: 'user',
        content: buildOcChatRetryUserNotice(
          opts.lastUserMessage,
          failReason,
          opts.recentUserBurst,
          recentAsst,
        ),
      },
    ];
    const nextRaw = await opts.generate(retryHistory);
    return { raw: nextRaw, behavior: opts.parse(nextRaw) };
  };

  const eveFinalize = (b: OcChatBehavior): OcChatBehavior => {
    if (!opts.eveStyle || !b.messages.length) return b;
    const cleaned = b.messages
      .map((m) => stripEveTrailingPeriod(String(m || '').trim()))
      .filter((m) => m && !isEvePunctuationOnly(m));
    return {
      ...b,
      messages: cleaned,
      ...(cleaned.length === 0 && b.action === 'respond' ? { action: 'read_only' as const } : {}),
    };
  };

  const demoteDuplicate = (b: OcChatBehavior): OcChatBehavior => {
    if (!(b.action === 'respond' && b.messages.length > 0)) return b;
    if (!isNearDuplicateReply(b.messages, recentAsst)) return b;
    console.warn('[oc-chat] demote duplicate reply to read_only', {
      lastUserMessage: opts.lastUserMessage.slice(0, 120),
      messages: b.messages,
      recentAsst: recentAsst.slice(-3),
    });
    return {
      ...b,
      action: 'read_only',
      messages: [],
      moodNote: b.moodNote || '같은 말 반복 대신 읽만 함',
    };
  };

  // attempt0
  {
    const { behavior: fixed0, failReason: fail0 } = await verifyOrFixOnce(behavior);
    behavior = finalizeMessages(eveFinalize(fixed0));
    verifyPassed = !fail0;
    if (!fail0) return { raw, behavior, regenerated: false, verifyPassed: true };

    console.warn('[oc-chat] verification failed, regenerating (attempt 1)', {
      lastUserMessage: opts.lastUserMessage.slice(0, 120),
      original: behavior.messages,
      reason: fail0,
      burstCount: opts.recentUserBurst?.length || 0,
    });

    const regen1 = await regenerateOnce(raw, fail0);
    raw = regen1.raw;
    behavior = regen1.behavior;
    regenerated = true;

    const { behavior: fixed1, failReason: fail1 } = await verifyOrFixOnce(behavior);
    behavior = finalizeMessages(eveFinalize(fixed1));
    verifyPassed = !fail1;
    if (!fail1) return { raw, behavior, regenerated: true, verifyPassed: true };

    console.warn('[oc-chat] verification failed, regenerating (attempt 2)', {
      lastUserMessage: opts.lastUserMessage.slice(0, 120),
      original: behavior.messages,
      reason: fail1,
      burstCount: opts.recentUserBurst?.length || 0,
    });

    const regen2 = await regenerateOnce(raw, fail1);
    raw = regen2.raw;
    behavior = eveFinalize(regen2.behavior);
    const { behavior: fixed2, failReason: fail2 } = await verifyOrFixOnce(behavior);
    behavior = finalizeMessages(eveFinalize(fixed2));
    if (fail2 === 'duplicate_reply' || isNearDuplicateReply(behavior.messages, recentAsst)) {
      behavior = demoteDuplicate(behavior);
      verifyPassed = true;
      return { raw, behavior, regenerated: true, verifyPassed: true };
    }
    /* stacked_filler 등은 최후 후보를 collapse로 줄인 뒤 사용 */
    if (fail2 === 'stacked_filler') {
      behavior = finalizeMessages(behavior);
      verifyPassed = true;
      return { raw, behavior, regenerated: true, verifyPassed: true };
    }
    /* 맥락 불일치 등은 최후 후보를 쓰되, 복붙만은 위에서 차단 */
    verifyPassed = !fail2;
    return { raw, behavior, regenerated: true, verifyPassed };
  }
}
