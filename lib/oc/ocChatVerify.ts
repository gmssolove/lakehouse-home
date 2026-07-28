import type { OcChatBehavior } from '@/lib/oc/ocChatBehavior';

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
    /* 애매하면 통과 — 검증기 오탐으로 무한 재생성 방지 */
    return true;
  } catch (e) {
    console.warn('[oc-chat] verify call failed, accepting candidate', e);
    return true;
  }
}

export function buildOcChatRetryUserNotice(lastUserMessage: string): string {
  const last = String(lastUserMessage || '').trim().slice(0, 400);
  return `[시스템 알림: 방금 답변이 사용자의 마지막 메시지("${last}")와 맥락이 맞지 않았거나 문장이 끊겼습니다. 사용자 메시지 내용에 실제로 대응하는 짧은 답변으로 다시 생성하세요. JSON만 출력.]`;
}

export type VerifiedOcChatGenerateResult = {
  raw: string;
  behavior: OcChatBehavior;
  regenerated: boolean;
  verifyPassed: boolean;
};

/**
 * 생성 → 맥락 검증 → 실패 시 최대 1회 재생성.
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
}): Promise<VerifiedOcChatGenerateResult> {
  let raw = await opts.generate(opts.historyForModel);
  let behavior = opts.parse(raw);
  let regenerated = false;
  let verifyPassed = true;

  if (behavior.action === 'respond' && behavior.messages.length > 0) {
    const ok = await verifyOcChatRelevance({
      lastUserMessage: opts.lastUserMessage,
      candidateMessages: behavior.messages,
      callModel: opts.verify,
    });
    verifyPassed = ok;
    if (!ok) {
      console.warn('[oc-chat] verification failed, regenerating once', {
        lastUserMessage: opts.lastUserMessage.slice(0, 120),
        original: behavior.messages,
      });
      const retryHistory = [
        ...opts.historyForModel,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: buildOcChatRetryUserNotice(opts.lastUserMessage),
        },
      ];
      raw = await opts.generate(retryHistory);
      behavior = opts.parse(raw);
      regenerated = true;
      /* 재생성 결과는 재검증하지 않음 (최대 1회) */
      verifyPassed = true;
    }
  }

  return { raw, behavior, regenerated, verifyPassed };
}
