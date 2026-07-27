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

/**
 * 최근 N개 대화를 모델용으로 정리.
 * - 빈 메시지 제거
 * - 같은 role 연속은 한 턴으로 합침 (Anthropic 교대 규칙 + 버스트 입력)
 * - 시각 힌트를 붙여 시간순 맥락 강화
 */
export function prepareOcChatModelMessages(
  messages: InMsg[],
  opts?: { max?: number; withClock?: boolean },
): OcChatModelMessage[] {
  const max = opts?.max ?? 40;
  const withClock = opts?.withClock !== false;
  const sliced = messages.slice(-Math.max(1, max));
  const out: OcChatModelMessage[] = [];

  for (const m of sliced) {
    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';
    let body = ocChatMessageToModelContent(m);
    if (!body) continue;
    if (withClock) {
      const clock = clockLabel(m.at);
      if (clock) body = `[${clock}] ${body}`;
    }
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n${body}`;
    } else {
      out.push({ role, content: body });
    }
  }

  if (out.length && out[0].role === 'assistant') {
    out.unshift({ role: 'user', content: '(이전 대화에서 이어짐)' });
  }
  if (!out.length) {
    out.push({ role: 'user', content: '판단해.' });
  }
  return out;
}
