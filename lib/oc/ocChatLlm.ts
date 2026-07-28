/**
 * OC 챗 LLM 호출 — Gemini 기본, Anthropic 선택.
 * Gemini: 최고 성능 모델 → 폴백 체인.
 */

import {
  joinOcChatSystemPrompt,
  type OcChatSystemPromptParts,
} from '@/lib/oc/ocChatPrompt';

export type OcChatLlmProvider = 'gemini' | 'anthropic';

export class OcChatUpstreamError extends Error {
  readonly provider: OcChatLlmProvider;
  readonly upstreamStatus: number;
  readonly upstreamBody: string;

  constructor(
    message: string,
    upstreamStatus: number,
    upstreamBody: string,
    provider: OcChatLlmProvider,
  ) {
    super(message);
    this.name = 'OcChatUpstreamError';
    this.provider = provider;
    this.upstreamStatus = upstreamStatus;
    this.upstreamBody = upstreamBody;
  }
}

type ClaudeSystemBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
};

type ClaudeUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type CallLlmOpts = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  enableCache?: boolean;
  logLabel?: string;
  /** verify 등 — Gemini 폴백 체인 대신 단일/짧은 모델 */
  geminiModels?: string[];
  /** Gemini thinkingBudget (일부 모델만). 0=비활성 */
  thinkingBudget?: number;
  /** Gemini 3.5+/3.6 Flash 계열 — minimal|low|medium|high */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
};

export function resolveOcChatProvider(): OcChatLlmProvider {
  const forced = (process.env.OC_CHAT_PROVIDER || 'gemini').trim().toLowerCase();
  if (forced === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
    }
    return 'anthropic';
  }
  if (forced && forced !== 'gemini') {
    throw new Error(
      `OC_CHAT_PROVIDER=${forced}는 지원하지 않습니다. gemini | anthropic`,
    );
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }
  return 'gemini';
}

/**
 * 최고 성능 → 안정 Flash → 경량 Lite
 * (2026-07 API: 3.1 Pro Preview → 3.6 Flash → 3.5 Flash-Lite → 3.1 Flash-Lite)
 */
export function geminiModelChain(explicit?: string): string[] {
  if (explicit?.trim()) return [explicit.trim()];
  const primary = (process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview').trim();
  const fallback = (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash').trim();
  const lite = (process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite').trim();
  const out: string[] = [];
  for (const m of [primary, fallback, lite, 'gemini-3.1-flash-lite']) {
    if (m && !out.includes(m)) out.push(m);
  }
  return out.length ? out : ['gemini-3.6-flash'];
}

export function geminiVerifyModel(): string {
  return (
    process.env.GEMINI_VERIFY_MODEL ||
    process.env.GEMINI_FALLBACK_MODEL ||
    'gemini-3.6-flash'
  ).trim();
}

function systemToText(system: string | OcChatSystemPromptParts): string {
  return typeof system === 'string' ? system : joinOcChatSystemPrompt(system);
}

function buildClaudeSystem(
  system: string | OcChatSystemPromptParts,
  enableCache: boolean,
): string | ClaudeSystemBlock[] {
  if (typeof system === 'string') return system;
  const blocks: ClaudeSystemBlock[] = [];
  const staticText = system.staticText.trim();
  const dynamicText = system.dynamicText.trim();
  if (staticText) {
    blocks.push(
      enableCache
        ? {
            type: 'text',
            text: staticText,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          }
        : { type: 'text', text: staticText },
    );
  }
  if (dynamicText) blocks.push({ type: 'text', text: dynamicText });
  return blocks.length ? blocks : [{ type: 'text', text: '판단해.' }];
}

function isGeminiRetryable(status: number, body: string): boolean {
  if (status === 408 || status === 429 || status === 502 || status >= 500) return true;
  if (/empty response|not found|not supported|INVALID_ARGUMENT|model.*does not exist/i.test(body)) {
    return true;
  }
  return false;
}

async function callGeminiOnce(
  model: string,
  system: string | OcChatSystemPromptParts,
  messages: { role: string; content: string }[],
  opts: CallLlmOpts,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다');
  const systemText = systemToText(system);
  /* thinking 모델은 maxOutputTokens에 thinking도 포함 — 여유 있게 */
  const maxTokens = opts.maxTokens ?? 2048;
  const temperature = opts.temperature ?? 0.85;
  const contents = (messages.length ? messages : [{ role: 'user', content: '판단해.' }]).map(
    (m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }),
  );

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens: maxTokens,
    responseMimeType: 'text/plain',
  };
  if (typeof opts.thinkingBudget === 'number') {
    generationConfig.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
  } else if (opts.thinkingLevel) {
    generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig,
    }),
  });
  const rawText = await res.text();
  let data: {
    error?: { message?: string; status?: string; code?: number };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  } = {};
  try {
    data = rawText ? (JSON.parse(rawText) as typeof data) : {};
  } catch {
    data = {};
  }

  /* 일부 Flash는 thinkingBudget 미지원 → thinking 없이 1회 재시도 */
  if (
    !res.ok &&
    res.status === 400 &&
    generationConfig.thinkingConfig &&
    /invalid argument/i.test(data.error?.message || rawText)
  ) {
    const { thinkingBudget: _tb, thinkingLevel: _tl, ...rest } = opts;
    return callGeminiOnce(model, system, messages, rest);
  }

  if (!res.ok) {
    const detail =
      data.error?.message?.trim() ||
      rawText.trim().slice(0, 500) ||
      `HTTP ${res.status}`;
    throw new OcChatUpstreamError(`Gemini ${res.status}: ${detail}`, res.status, rawText, 'gemini');
  }

  const text = (data.candidates || [])
    .flatMap((c) => c.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason || 'empty';
    throw new OcChatUpstreamError(
      `Gemini empty response (${reason})`,
      502,
      rawText.slice(0, 2000),
      'gemini',
    );
  }

  console.info('[oc-chat] usage', {
    label: opts.logLabel || 'generate',
    provider: 'gemini',
    model,
    historyMsgs: messages.length,
    input: data.usageMetadata?.promptTokenCount,
    output: data.usageMetadata?.candidatesTokenCount,
    total: data.usageMetadata?.totalTokenCount,
  });
  return text;
}

export async function callGemini(
  system: string | OcChatSystemPromptParts,
  messages: { role: string; content: string }[],
  opts: CallLlmOpts = {},
): Promise<string> {
  const models = opts.geminiModels?.length
    ? opts.geminiModels
    : geminiModelChain(opts.model);
  let lastErr: OcChatUpstreamError | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await callGeminiOnce(model, system, messages, { ...opts, model });
      } catch (e) {
        if (!(e instanceof OcChatUpstreamError)) throw e;
        lastErr = e;
        const retryable =
          isGeminiRetryable(e.upstreamStatus, e.upstreamBody) ||
          /empty response/i.test(e.message);
        const retrySame = retryable && attempt < maxAttempts;
        if (retrySame) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        const tryNext = i < models.length - 1 && retryable;
        console.warn('[oc-chat] gemini model failed', {
          model,
          status: e.upstreamStatus,
          tryNext: tryNext ? models[i + 1] : null,
        });
        if (tryNext) break;
        throw e;
      }
    }
  }

  throw (
    lastErr ||
    new OcChatUpstreamError('Gemini 호출 실패', 502, '', 'gemini')
  );
}

async function callClaude(
  system: string | OcChatSystemPromptParts,
  messages: { role: string; content: string }[],
  opts: CallLlmOpts = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다');
  const model = (opts.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
  const systemPayload = buildClaudeSystem(system, opts.enableCache !== false);
  const maxTokens = opts.maxTokens ?? 768;
  const temperature = opts.temperature ?? 0.85;

  const maxAttempts = 3;
  let lastStatus = 0;
  let lastBody = '';
  let lastDetail = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPayload,
        messages: (messages.length ? messages : [{ role: 'user', content: '판단해.' }]).map(
          (m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          }),
        ),
      }),
    });
    const rawText = await res.text();
    let data: {
      error?: { message?: string; type?: string };
      content?: Array<{ type?: string; text?: string }>;
      usage?: ClaudeUsage;
    } = {};
    try {
      data = rawText ? (JSON.parse(rawText) as typeof data) : {};
    } catch {
      data = {};
    }
    if (res.ok) {
      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('모델이 빈 응답을 반환했습니다');
      const u = data.usage || {};
      console.info('[oc-chat] usage', {
        label: opts.logLabel || 'generate',
        provider: 'anthropic',
        model,
        historyMsgs: messages.length,
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens || 0,
        cacheCreate: u.cache_creation_input_tokens || 0,
        cacheHit: (u.cache_read_input_tokens || 0) > 0,
      });
      return text;
    }

    lastStatus = res.status;
    lastBody = rawText;
    const errType = data.error?.type?.trim();
    const errMsg = data.error?.message?.trim();
    lastDetail =
      errType && errMsg
        ? `${errType}: ${errMsg}`
        : rawText.trim().slice(0, 500) || `HTTP ${res.status}`;

    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) break;
    await new Promise((r) => setTimeout(r, 450 * attempt + Math.floor(Math.random() * 200)));
  }

  throw new OcChatUpstreamError(
    `Anthropic ${lastStatus}: ${lastDetail}`,
    lastStatus,
    lastBody,
    'anthropic',
  );
}

export async function callOcChatLlm(
  system: string | OcChatSystemPromptParts,
  messages: { role: string; content: string }[],
  opts: CallLlmOpts = {},
): Promise<string> {
  const provider = resolveOcChatProvider();
  if (provider === 'gemini') {
    return callGemini(system, messages, opts);
  }
  return callClaude(system, messages, opts);
}
