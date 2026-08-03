/** OC 채팅 → LLM messages 정규화 */

export type OcChatModelMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type InMsg = {
  role?: string;
  content?: string;
  at?: number;
  kind?: string;
  stickerId?: string;
  stickerUrl?: string;
};

function clockLabel(at?: number): string {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return '';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(at));
  } catch {
    return '';
  }
}

/** 스티커·빈 내용도 모델이 볼 수 있게 한 줄로 */
export function ocChatMessageToModelContent(m: InMsg): string {
  const raw = String(m.content || '').trim();
  const kind = String(m.kind || 'chat');
  if (kind === 'sticker') {
    const tag = m.stickerId ? `스티커:${m.stickerId}` : '스티커';
    return raw ? `${raw} (${tag})` : `(${tag})`;
  }
  if (kind === 'choice' && raw) return `(선택) ${raw}`;
  return raw;
}

function looksLikeQuestionLine(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[?？]/.test(t)) return true;
  return /(뭐\s*해|뭐하|뭐\s*하고|어디|언제|누구|왜|어때|인가요|나요|까요|습니까|가요|해요\s*$|예요\s*$)/.test(
    t,
  );
}

/**
 * 최근 N개 대화를 모델용으로 정리.
 * - 빈 메시지 제거
 * - 같은 role 연속은 한 턴으로 합침 (Anthropic 교대 규칙 + 버스트 입력)
 * - 유저 연타는 번호 매기고 마지막 줄에 최신 표시 → 질문 누락 완화
 * - 시각 힌트를 붙여 시간순 맥락 강화
 */
export function prepareOcChatModelMessages(
  messages: InMsg[],
  opts?: { max?: number; withClock?: boolean; maxModelTurns?: number },
): OcChatModelMessage[] {
  /* 말풍선 상한 — 기본 36 ≈ 유저↔캐릭 왕복 ~18턴 */
  const max = opts?.max ?? 36;
  const withClock = opts?.withClock !== false;
  /* 합친 뒤 모델 턴(role 교대) 상한 — 기본 36개 메시지 ≈ 18왕복 */
  const maxModelTurns = opts?.maxModelTurns ?? 36;
  const sliced = messages.slice(-Math.max(1, max));
  const out: OcChatModelMessage[] = [];

  type Part = { body: string; clock: string };
  let pendingUserParts: Part[] = [];

  const flushUserParts = () => {
    if (!pendingUserParts.length) return;
    const parts = pendingUserParts;
    pendingUserParts = [];
    let content: string;
    if (parts.length === 1) {
      const p = parts[0]!;
      content = p.clock ? `[${p.clock}] ${p.body}` : p.body;
    } else {
      const lines = parts.map((p, i) => {
        const head = p.clock ? `[${p.clock}] ` : '';
        const isLast = i === parts.length - 1;
        const mark = isLast
          ? looksLikeQuestionLine(p.body)
            ? ' ← 최신(질문·요청 — 반드시 반영)'
            : ' ← 최신(반드시 반영)'
          : '';
        return `${i + 1}. ${head}${p.body}${mark}`;
      });
      content = [
        '(유저가 연타로 보낸 말 — 아래를 한 턴으로 읽고 답할 것. 마지막 줄을 빠뜨리지 말 것)',
        ...lines,
      ].join('\n');
    }
    const last = out[out.length - 1];
    if (last && last.role === 'user') {
      last.content = `${last.content}\n${content}`;
    } else {
      out.push({ role: 'user', content });
    }
  };

  for (const m of sliced) {
    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';
    let body = ocChatMessageToModelContent(m);
    if (!body) continue;
    const clock = withClock ? clockLabel(m.at) : '';

    if (role === 'user') {
      pendingUserParts.push({ body, clock });
      continue;
    }

    flushUserParts();
    const line = clock ? `[${clock}] ${body}` : body;
    const last = out[out.length - 1];
    if (last && last.role === 'assistant') {
      last.content = `${last.content}\n${line}`;
    } else {
      out.push({ role: 'assistant', content: line });
    }
  }
  flushUserParts();

  const trimmed =
    out.length > maxModelTurns ? out.slice(-maxModelTurns) : out;

  if (trimmed.length && trimmed[0]!.role === 'assistant') {
    trimmed.unshift({ role: 'user', content: '(이전 대화에서 이어짐)' });
  }
  if (!trimmed.length) {
    trimmed.push({ role: 'user', content: '판단해.' });
  }
  return trimmed;
}
