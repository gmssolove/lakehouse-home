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
- 사용자가 한 말의 핵심(질문·요청·감정)을 무시하고 다른 반응만 하는 경우

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

export function defaultVerifyModel(): string {
  return (process.env.ANTHROPIC_VERIFY_MODEL || 'claude-haiku-4-5-20251001').trim();
}

export async function verifyOcChatRelevance(opts: {
  lastUserMessage: string;
  candidateMessages: string[];
  callModel: (system: string, userContent: string) => Promise<string>;
}): Promise<boolean> {
  const msgs = opts.candidateMessages.map((m) => String(m || '').trim()).filter(Boolean);
  if (!msgs.length) return true;
  if (msgs.some((m) => looksTruncatedBubble(m))) return false;

  const last = String(opts.lastUserMessage || '').trim();
  if (!last) return true;

  const userTurn = `사용자 마지막 메시지: "${last}"
캐릭터 답변 후보: ${msgs.map((m) => `"${m}"`).join(' / ')}

이 답변이 사용자 메시지에 실제로 대응합니까?`;

  try {
    const raw = await opts.callModel(VERIFY_SYSTEM, userTurn);
    const ans = raw.trim().toLowerCase();
    if (ans.startsWith('yes')) return true;
    if (ans.startsWith('no')) return false;
    console.warn('[oc-chat] verify ambiguous response (expected yes/no)', {
      ans: ans.slice(0, 80),
      lastUserMessagePreview: last.slice(0, 80),
      candidateCount: msgs.length,
    });
    /* 애매하면 통과 — 검증기 오탐으로 무한 재생성 방지 */
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
  | 'context_mismatch';

export function buildOcChatRetryUserNotice(
  lastUserMessage: string,
  reason: OcChatVerifyFailReason = 'context_mismatch',
): string {
  const last = String(lastUserMessage || '').trim().slice(0, 400);
  if (
    reason === 'command_ending' ||
    reason === 'punctuation_only' ||
    reason === 'mechanical_filter'
  ) {
    return `[시스템 알림: 명령형 어미로 끝나는 문장이 있거나, 구두점만으로 이루어진 메시지(예: ".....")가 있었습니다. 명령형을 쓰지 말고, 할 말이 없다면 action을 read_only/ignore로 바꾸거나 실제 내용이 담긴 문장으로 다시 쓰세요. 이브면 평서문 끝 마침표도 빼세요. JSON만 출력.]`;
  }
  return `[시스템 알림: 방금 답변이 사용자의 마지막 메시지("${last}")와 맥락이 맞지 않았거나 문장이 끊겼습니다. 사용자 메시지 내용에 실제로 대응하는 짧은 답변으로 다시 생성하세요. JSON만 출력.]`;
}

export type VerifiedOcChatGenerateResult = {
  raw: string;
  behavior: OcChatBehavior;
  regenerated: boolean;
  verifyPassed: boolean;
};

/**
 * 생성 → (이브)기계적 필터 → 맥락 검증 → 실패 시 최대 1회 재생성.
 * ignore/read_only 등 messages=[] 는 검증 생략.
 */
export async function generateVerifiedOcChatResponse(opts: {
  lastUserMessage: string;
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

    if (!failReason) {
      const ok = await verifyOcChatRelevance({
        lastUserMessage: opts.lastUserMessage,
        candidateMessages: next.messages,
        callModel: opts.verify,
      });
      if (!ok) failReason = 'context_mismatch';
    }

    return { behavior: next, failReason };
  };

  const regenerateOnce = async (previousRaw: string, failReason: OcChatVerifyFailReason) => {
    const retryHistory = [
      ...opts.historyForModel,
      { role: 'assistant', content: previousRaw },
      {
        role: 'user',
        content: buildOcChatRetryUserNotice(opts.lastUserMessage, failReason),
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

  // attempt0: initial generation + verification
  {
    const { behavior: fixed0, failReason: fail0 } = await verifyOrFixOnce(behavior);
    behavior = fixed0;
    verifyPassed = !fail0;
    if (!fail0) return { raw, behavior, regenerated: false, verifyPassed: true };

    console.warn('[oc-chat] verification failed, regenerating (attempt 1)', {
      lastUserMessage: opts.lastUserMessage.slice(0, 120),
      original: behavior.messages,
      reason:
        fail0 === 'context_mismatch'
          ? 'context_mismatch'
          : 'mechanical_filter_triggered',
    });

    // attempt1: regenerate + verification
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
      reason:
        fail1 === 'context_mismatch'
          ? 'context_mismatch'
          : 'mechanical_filter_triggered',
    });

    // attempt2: one more regeneration, but NO verification (fail-safe)
    const regen2 = await regenerateOnce(raw, fail1);
    raw = regen2.raw;
    behavior = eveFinalize(regen2.behavior);
    verifyPassed = true; // 3번째부터는 무조건 통과 취급
    return { raw, behavior, regenerated: true, verifyPassed: true };
  }
}
