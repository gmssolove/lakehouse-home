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

export type OcChatLlmResolved = {
  provider: OcChatLlmProvider;
  model: string;
  cascadeIndex: number;
  cascadeLen: number;
  wasFallback: boolean;
  temperature: number;
};

/** 429 분류 — free-tier 일일(RPD) vs 분당(RPM) 등 */
export type Gemini429Kind = 'rpd' | 'rpm' | 'other';

export type Gemini429Info = {
  kind: Gemini429Kind;
  isFreeTier: boolean;
  retryDelayMs: number;
  quotaId: string;
  quotaMetric: string;
  quotaValue: string;
  messagePreview: string;
};

export type CallLlmOpts = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  enableCache?: boolean;
  logLabel?: string;
  /**
   * chat = 캐릭터 응답(쿼타 우선). aux = verify/memory(부담 시 스킵·lite만).
   */
  priority?: 'chat' | 'aux';
  /** verify 등 — Gemini 폴백 체인 대신 단일/짧은 모델 */
  geminiModels?: string[];
  /** Gemini thinkingBudget (일부 모델만). 0=비활성 */
  thinkingBudget?: number;
  /** Gemini 3.5+/3.6 Flash 계열 — minimal|low|medium|high */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  /** 실제 성공한 모델(캐스케이드 단계) — 호출측 로그/응답용 */
  onModelResolved?: (info: OcChatLlmResolved) => void;
};

/** 모델별 쿨다운(isolate 메모리). RPD/429 직후 같은 모델 연타 방지 */
const modelCooldownUntil = new Map<string, number>();
/** 최근 채팅 쿼타 압박 — aux(verify/memory) 스킵용 */
let chatQuotaPressureUntil = 0;

const SAME_MODEL_RETRIES = 2; /* 첫 시도 외 추가 재시도 횟수 */
/*
 * chat 503: Worker 한 요청 안에서 Pro를 여러 번 길게 붙잡으면
 * Cloudflare 제한으로 또 503이 난다 → 서버는 짧게, 클라이언트에서 여러 번 재요청.
 */
const CHAT_OVERLOAD_SAME_MODEL_RETRIES = 1;
const RETRY_WAIT_MIN_MS = 800;
const RETRY_WAIT_CAP_MS = 8_000;
const MODEL_COOLDOWN_CAP_MS = 120_000;
const CHAT_PRESSURE_MS = 180_000;

export function parseGemini429(body: string): Gemini429Info | null {
  if (!body || !/429|RESOURCE_EXHAUSTED|quota|rate/i.test(body)) return null;
  let quotaId = '';
  let quotaMetric = '';
  let quotaValue = '';
  let retryDelayMs = 0;
  let message = '';
  try {
    const data = JSON.parse(body) as {
      error?: {
        message?: string;
        details?: Array<Record<string, unknown>>;
      };
    };
    message = String(data.error?.message || '');
    for (const d of data.error?.details || []) {
      const type = String(d['@type'] || '');
      if (type.includes('QuotaFailure')) {
        const violations = d.violations as Array<Record<string, unknown>> | undefined;
        const v = violations?.[0];
        if (v) {
          quotaId = String(v.quotaId || '');
          quotaMetric = String(v.quotaMetric || '');
          quotaValue = String(v.quotaValue || '');
        }
      }
      if (type.includes('RetryInfo')) {
        const rd = String(d.retryDelay || '');
        const sec = Number(rd.replace(/s$/i, ''));
        if (Number.isFinite(sec) && sec > 0) retryDelayMs = Math.round(sec * 1000);
      }
    }
  } catch {
    message = body.slice(0, 400);
  }
  if (!retryDelayMs) {
    const m = message.match(/retry in\s+([\d.]+)\s*s/i);
    if (m) retryDelayMs = Math.round(Number(m[1]) * 1000);
  }
  if (!retryDelayMs) retryDelayMs = 2000;

  const id = `${quotaId} ${quotaMetric} ${message}`;
  const isFreeTier = /free[_ ]?tier|FreeTier/i.test(id);
  let kind: Gemini429Kind = 'other';
  if (/PerDay|RequestsPerDay|rpd/i.test(id)) kind = 'rpd';
  else if (/PerMinute|PerMin|rpm|tokensperminute/i.test(id)) kind = 'rpm';

  return {
    kind,
    isFreeTier,
    retryDelayMs,
    quotaId,
    quotaMetric,
    quotaValue,
    messagePreview: message.replace(/\s+/g, ' ').trim().slice(0, 220),
  };
}

export function noteGeminiModelCooldown(model: string, waitMs: number, reason: string) {
  const until = Date.now() + Math.min(Math.max(waitMs, 1000), MODEL_COOLDOWN_CAP_MS);
  const prev = modelCooldownUntil.get(model) || 0;
  if (until > prev) modelCooldownUntil.set(model, until);
  console.warn('[oc-chat] gemini model cooldown', {
    model,
    reason,
    waitMs: until - Date.now(),
    untilIso: new Date(until).toISOString(),
  });
}

export function isGeminiModelCooling(model: string): boolean {
  const until = modelCooldownUntil.get(model) || 0;
  if (until <= Date.now()) {
    if (until) modelCooldownUntil.delete(model);
    return false;
  }
  return true;
}

export function markChatQuotaPressure(info?: Gemini429Info | null) {
  chatQuotaPressureUntil = Date.now() + CHAT_PRESSURE_MS;
  console.warn('[oc-chat] chat quota pressure', {
    untilIso: new Date(chatQuotaPressureUntil).toISOString(),
    kind: info?.kind,
    quotaId: info?.quotaId,
    isFreeTier: info?.isFreeTier,
  });
}

function clampRetryWaitMs(ms: number): number {
  return Math.min(RETRY_WAIT_CAP_MS, Math.max(RETRY_WAIT_MIN_MS, Math.round(ms)));
}

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

/**
 * verify/memory용 — Flash/Pro를 기본으로 쓰지 않음(채팅 RPD 보호).
 * GEMINI_VERIFY_MODEL이 Flash/Pro면 경고 후 lite로 대체.
 */
export function geminiAuxModelChain(): string[] {
  const explicit = (process.env.GEMINI_VERIFY_MODEL || '').trim();
  const lite = (process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite').trim();
  const chatTier = new Set(
    [
      process.env.GEMINI_MODEL,
      process.env.GEMINI_FALLBACK_MODEL,
      'gemini-3.1-pro-preview',
      'gemini-3.6-flash',
    ]
      .map((s) => (s || '').trim())
      .filter(Boolean),
  );
  const out: string[] = [];
  if (explicit) {
    if (chatTier.has(explicit) || /pro-preview|gemini-3\.6-flash$/i.test(explicit)) {
      console.warn(
        '[oc-chat] GEMINI_VERIFY_MODEL points at chat-tier model; using lite for aux',
        { explicit, lite },
      );
    } else if (!out.includes(explicit)) {
      out.push(explicit);
    }
  }
  for (const m of [lite, 'gemini-3.1-flash-lite']) {
    if (m && !out.includes(m)) out.push(m);
  }
  return out.length ? out : ['gemini-3.1-flash-lite'];
}

/** @deprecated use geminiAuxModelChain — Flash 기본값 제거 */
export function geminiVerifyModel(): string {
  return geminiAuxModelChain()[0] || 'gemini-3.5-flash-lite';
}

/** verify/memory 등 aux 호출을 잠시 쉴지 — 채팅 쿼타 보호 */
export function shouldSkipGeminiAuxWork(): boolean {
  if (Date.now() < chatQuotaPressureUntil) return true;
  const chatModels = geminiModelChain().slice(0, 2);
  return chatModels.some((m) => isGeminiModelCooling(m));
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
  const temperature = opts.temperature ?? 0.85;
  const priority = opts.priority || 'chat';
  let lastErr: OcChatUpstreamError | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    if (isGeminiModelCooling(model)) {
      console.warn('[oc-chat] gemini skip cooling model', {
        label: opts.logLabel || 'generate',
        model,
        cascadeIndex: i,
        priority,
        tryNext: models[i + 1] || null,
      });
      continue;
    }

    /* chat은 과부하 대비 같은 모델 재시도 여유를 더 둠(폴백으로 품질 낮추지 않음) */
    const maxAttempts =
      1 + (priority === 'chat' ? CHAT_OVERLOAD_SAME_MODEL_RETRIES : SAME_MODEL_RETRIES);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const text = await callGeminiOnce(model, system, messages, {
          ...opts,
          model,
        });
        const resolved: OcChatLlmResolved = {
          provider: 'gemini',
          model,
          cascadeIndex: i,
          cascadeLen: models.length,
          wasFallback: i > 0,
          temperature,
        };
        console.info('[oc-chat] model used', {
          label: opts.logLabel || 'generate',
          priority,
          ...resolved,
          chain: models,
        });
        opts.onModelResolved?.(resolved);
        return text;
      } catch (e) {
        if (!(e instanceof OcChatUpstreamError)) throw e;
        lastErr = e;
        const retryable =
          isGeminiRetryable(e.upstreamStatus, e.upstreamBody) ||
          /empty response/i.test(e.message);
        const info429 =
          e.upstreamStatus === 429 ? parseGemini429(e.upstreamBody) : null;
        /* 과부하는 품질(모델) 유지 — 같은 모델만 더 기다려 재시도, Flash로 내리지 않음 */
        const isOverload =
          e.upstreamStatus === 503 ||
          /UNAVAILABLE|overloaded|high demand/i.test(
            `${e.message}\n${e.upstreamBody || ''}`,
          );

        const retriesLeft = attempt < maxAttempts && retryable;
        /*
         * free-tier RPD(일일)는 수초 대기로 안 풀리는 경우가 많음 → 같은 모델 1회만 재시도.
         * RPM/기타 429는 최대 SAME_MODEL_RETRIES회.
         * 503도 같은 모델 재시도(품질 유지). 폴백 모델로 바로 내리지 않음.
         */
        const allowRetry =
          retriesLeft &&
          !(info429?.kind === 'rpd' && info429.isFreeTier && attempt >= 2);

        if (allowRetry) {
          const rawWait =
            info429?.kind === 'rpd' && info429.isFreeTier
              ? 2_000 * attempt
              : info429?.retryDelayMs
                ? Math.min(info429.retryDelayMs, RETRY_WAIT_CAP_MS)
                : isOverload
                  ? 900 * attempt
                  : e.upstreamStatus === 429
                    ? 1500 * attempt
                    : 400 * attempt;
          const waitMs = clampRetryWaitMs(rawWait);
          console.warn('[oc-chat] gemini retry same model', {
            label: opts.logLabel || 'generate',
            priority,
            model,
            cascadeIndex: i,
            attempt,
            nextAttempt: attempt + 1,
            waitMs,
            status: e.upstreamStatus,
            overload: isOverload,
            kind: info429?.kind,
            isFreeTier: info429?.isFreeTier,
            quotaId: info429?.quotaId,
            quotaValue: info429?.quotaValue,
            messagePreview: info429?.messagePreview,
          });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        /* 이 모델은 포기 — 이후 요청이 같은 모델을 바로 두드리지 않게 쿨다운 */
        if (e.upstreamStatus === 429 && priority === 'chat') {
          markChatQuotaPressure(info429);
        }
        if (info429) {
          const coolMs =
            info429.kind === 'rpd'
              ? Math.min(info429.retryDelayMs || 60_000, MODEL_COOLDOWN_CAP_MS)
              : Math.min(Math.max(info429.retryDelayMs, 5_000), 30_000);
          noteGeminiModelCooldown(
            model,
            coolMs,
            `${info429.kind}:${info429.quotaId || '429'}`,
          );
        }

        /*
         * chat 과부하(503): 품질 다른 폴백 모델로 내리지 않음.
         * 쿼타/모델없음 등만 체인 다음으로.
         */
        const tryNext =
          i < models.length - 1 &&
          retryable &&
          !(isOverload && priority === 'chat');
        console.warn('[oc-chat] gemini model failed', {
          label: opts.logLabel || 'generate',
          priority,
          model,
          cascadeIndex: i,
          status: e.upstreamStatus,
          attempt,
          overload: isOverload,
          kind: info429?.kind,
          isFreeTier: info429?.isFreeTier,
          quotaId: info429?.quotaId,
          quotaValue: info429?.quotaValue,
          retryDelayMs: info429?.retryDelayMs,
          messagePreview: info429?.messagePreview,
          tryNext: tryNext ? models[i + 1] : null,
          chain: models,
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
      const resolved: OcChatLlmResolved = {
        provider: 'anthropic',
        model,
        cascadeIndex: 0,
        cascadeLen: 1,
        wasFallback: false,
        temperature,
      };
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
      console.info('[oc-chat] model used', {
        label: opts.logLabel || 'generate',
        ...resolved,
      });
      opts.onModelResolved?.(resolved);
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
