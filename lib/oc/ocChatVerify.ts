import type { OcChatBehavior } from '@/lib/oc/ocChatBehavior';
import {
  applyEveMechanicalFilters,
  isEvePunctuationOnly,
  stripEveTrailingPeriod,
} from '@/lib/oc/ocChatEveStyle';

const VERIFY_SYSTEM = `당신은 대화 품질 검사기입니다. 사용자의 마지막 메시지와, 그에 대한 캐릭터의 답변 후보를 보고 판단하세요.

다음 중 하나라도 해당하면 "no":
- 답변이 사용자가 실제로 한 말과 무관한 화제로 새는 경우
- 사용자가 묻지 않은 것에 답하는 경우
- 문장이 접속사·조사·명사 등으로 뚝 끊겨서 문법적으로 안 끝난 경우
- 의미 없는 필러만 있고 실질 반응이 없는 경우
- 실질 질문에 단순 맞장구·감사만으로 답을 대체한 경우
- 사용자가 한 말의 핵심(질문·요청·감정·되묻기)을 무시하는 경우
- 연속 메시지 중 앞부분만 반영하고 가장 최근 유저 말을 무시하는 경우
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

  if (looksLikeIgnoredQuestionReply(last, msgs)) return false;

  const recentAsst = (opts.recentAssistantMessages || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean);
  if (isNearDuplicateReply(msgs, recentAsst)) return false;
  if (looksLikeElaborationFollowUp(last) && isNearDuplicateReply(msgs, recentAsst.slice(-4))) {
    return false;
  }

  const burst = (opts.recentUserBurst || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean);
  const burstBlock =
    burst.length > 1
      ? `사용자가 연속으로 보낸 메시지:
${burst.map((m, i) => `${i + 1}. "${m}"`).join('\n')}
답변은 반드시 마지막(가장 최근) 메시지에 대응해야 합니다. 앞 메시지에만 답하고 마지막을 무시하면 "no".
`
      : '';
  const recentBlock =
    recentAsst.length > 0
      ? `캐릭터의 직전 대사(참고·복붙 금지): ${recentAsst.slice(-3).map((m) => `"${m}"`).join(' / ')}
`
      : '';

  const userTurn = `${burstBlock}${recentBlock}사용자 마지막 메시지: "${last}"
캐릭터 답변 후보: ${msgs.map((m) => `"${m}"`).join(' / ')}

이 답변이 사용자 마지막 메시지에 실제로 대응합니까? 직전 대사와 똑같은 복붙이면 "no".`;

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
  | 'duplicate_reply';

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
  if (reason === 'duplicate_reply') {
    const banned = (recentAssistantMessages || [])
      .map((m) => String(m || '').trim())
      .filter(Boolean)
      .slice(-4);
    const banLine = banned.length
      ? `금지(그대로·거의 그대로 재사용 금지): ${banned.map((m) => `"${m}"`).join(' / ')}.`
      : '직전 자기 대사를 그대로 다시 쓰지 마세요.';
    return `[시스템 알림: 방금 답이 직전 대사와 동일·거의 동일했습니다. ${banLine} 사용자 마지막 말("${last}")에 맞게 다른 문장·각도로 새로 짧게 답하세요. 할 말이 없으면 action을 read_only/ignore. JSON만 출력.]`;
  }
  const burst = (recentUserBurst || []).map((m) => String(m || '').trim()).filter(Boolean);
  if (burst.length > 1) {
    return `[시스템 알림: 방금 답변이 연속 메시지 중 앞부분만 받고 가장 최근 메시지("${last}")를 무시했습니다. 최근 메시지(특히 질문)에 실제로 대응하는 짧은 답으로 다시 쓰세요. 앞 말에만 감사·맞장구 하고 끝내지 마세요. JSON만 출력.]`;
  }
  return `[시스템 알림: 방금 답변이 사용자의 마지막 메시지("${last}")와 맥락이 맞지 않았거나, 직전 대사를 반복했거나, 문장이 끊겼습니다. 같은 문장 반복 금지. 마지막 유저 말의 핵심에 맞게 캐릭터답게 새로 짧게 답하세요. 되묻기·설명 요청이면 새 정보를 한 줄이라도 보태세요. JSON만 출력.]`;
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
          : 'context_mismatch';
      }
    }

    return { behavior: next, failReason };
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
    behavior = fixed0;
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
    behavior = fixed1;
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
    behavior = eveFinalize(fixed2);
    if (fail2 === 'duplicate_reply' || isNearDuplicateReply(behavior.messages, recentAsst)) {
      behavior = demoteDuplicate(behavior);
      verifyPassed = true;
      return { raw, behavior, regenerated: true, verifyPassed: true };
    }
    /* 맥락 불일치 등은 최후 후보를 쓰되, 복붙만은 위에서 차단 */
    verifyPassed = !fail2;
    return { raw, behavior, regenerated: true, verifyPassed };
  }
}
