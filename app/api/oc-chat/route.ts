import { NextResponse } from 'next/server';
import {
  clampAffection,
  computeFreeChatAffinityDelta,
  todayKeyLocal,
} from '@/lib/oc/ocChatAffinity';
import {
  parseOcChatBehavior,
  parseOcChatProactive,
  PROACTIVE_AFFECTION_MIN,
} from '@/lib/oc/ocChatBehavior';
import { buildOcChatLiveContext } from '@/lib/oc/ocChatContext';
import { checkChatBanned, chatBanUserMessage } from '@/lib/oc/ocChatSafety';
import type { OcChatRecentAction } from '@/lib/oc/ocChatPresence';
import { buildWorldContextPromptLines, loadOcWorldData } from '@/lib/oc/ocChatWorld';
import {
  buildOcChatProactivePromptParts,
  buildOcChatSystemPromptParts,
  joinOcChatSystemPrompt,
  type OcChatSystemPromptParts,
} from '@/lib/oc/ocChatPrompt';
import { prepareOcChatModelMessages } from '@/lib/oc/ocChatModelMessages';
import type { OcCharacter } from '@/lib/types/character';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RTDB_CHARS_URL =
  'https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app/lhdata/oc_characters.json';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 24;
/** 말풍선 단위. 유저↔캐릭 왕복 ~20턴 이상 */
const HISTORY_MAX = 40;
const CONTENT_MAX = 2000;

type ChatIn = {
  role?: string;
  content?: string;
  at?: number;
  kind?: string;
  stickerId?: string;
  stickerUrl?: string;
};
type Provider = 'gemini' | 'groq' | 'anthropic';

type Body = {
  mode?: string;
  characterId?: string;
  visitorId?: string;
  messages?: ChatIn[];
  affection?: number;
  freeGainToday?: number;
  freeLossToday?: number;
  moodNote?: string;
  turnsToday?: number;
  hoursSinceLast?: number;
  closedForToday?: boolean;
  recentDeltaReasons?: string[];
  presence?: string;
  recentActions?: Array<{ at?: number; action?: string; presence?: string; note?: string }>;
};

type RateBucket = { count: number; resetAt: number };
const rateMap = new Map<string, RateBucket>();

function clientIp(req: Request): string {
  const xf = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '';
  return xf.split(',')[0]?.trim() || 'unknown';
}

function allowRate(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now >= hit.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (hit.count >= RATE_MAX) return false;
  hit.count += 1;
  return true;
}

function asCharacterList(raw: unknown): OcCharacter[] {
  if (Array.isArray(raw)) return raw as OcCharacter[];
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, OcCharacter>);
  }
  return [];
}

async function loadCharacter(characterId: string): Promise<OcCharacter | null> {
  const res = await fetch(RTDB_CHARS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('캐릭터 데이터를 불러오지 못했습니다');
  const list = asCharacterList(await res.json());
  const id = String(characterId);
  return list.find((c) => String(c?.id) === id) || null;
}

function resolveProvider(): Provider {
  const forced = (process.env.OC_CHAT_PROVIDER || '').trim().toLowerCase();
  if (forced === 'gemini' || forced === 'groq' || forced === 'anthropic') return forced;
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
  if (process.env.GROQ_API_KEY?.trim()) return 'groq';
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'anthropic';
  throw new Error(
    'API 키가 없습니다. .env.local에 GEMINI_API_KEY, GROQ_API_KEY 또는 ANTHROPIC_API_KEY를 넣어 주세요.',
  );
}

async function callGemini(system: string, messages: { role: string; content: string }[]) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다');
  const model = (process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.length
        ? messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))
        : [{ role: 'user', parts: [{ text: '판단해.' }] }],
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.85,
        responseMimeType: 'application/json',
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!res.ok) {
    const raw = data.error?.message || `Gemini HTTP ${res.status}`;
    if (/quota|rate.?limit|exceeded|limit:\s*0/i.test(raw)) {
      throw new Error(
        `Gemini 무료 할당량 초과/불가 (${model}). GROQ_API_KEY를 쓰거나 Google AI Studio 쿼터를 확인하세요.`,
      );
    }
    throw new Error(raw);
  }
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('모델이 빈 응답을 반환했습니다');
  return text;
}

async function callGroq(system: string, messages: { role: string; content: string }[]) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY가 설정되지 않았습니다');
  const model = (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim();

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...(messages.length ? messages : [{ role: 'user', content: '판단해.' }]),
      ],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Groq HTTP ${res.status}`);
  }
  const text = (data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('모델이 빈 응답을 반환했습니다');
  return text;
}

async function callClaude(
  system: string | OcChatSystemPromptParts,
  messages: { role: string; content: string }[],
) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다');
  const model = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();

  const systemBlocks =
    typeof system === 'string'
      ? [
          {
            type: 'text' as const,
            text: system,
            cache_control: { type: 'ephemeral' as const },
          },
        ]
      : [
          {
            type: 'text' as const,
            text: system.staticText,
            cache_control: { type: 'ephemeral' as const },
          },
          ...(system.dynamicText.trim()
            ? [{ type: 'text' as const, text: system.dynamicText }]
            : []),
        ];

  const maxAttempts = 3;
  let lastErr = '';
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
        max_tokens: 768,
        temperature: 0.85,
        system: systemBlocks,
        messages: (messages.length ? messages : [{ role: 'user', content: '판단해.' }]).map(
          (m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          }),
        ),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      content?: Array<{ type?: string; text?: string }>;
    };
    if (res.ok) {
      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('모델이 빈 응답을 반환했습니다');
      return text;
    }

    const raw = data.error?.message || `Anthropic HTTP ${res.status}`;
    lastErr = raw;
    if (/credit|billing|quota|rate.?limit|exceeded/i.test(raw)) {
      throw new Error(
        `Claude API는 별도 결제가 필요합니다 (${model}). 무료로 쓰려면 GEMINI/GROQ를 사용하세요.`,
      );
    }
    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) break;
    await new Promise((r) => setTimeout(r, 450 * attempt + Math.floor(Math.random() * 200)));
  }
  throw new Error(lastErr || 'Anthropic 요청 실패');
}

async function callChatModel(
  system: string | OcChatSystemPromptParts,
  messages: Array<{
    role: string;
    content: string;
    at?: number;
    kind?: string;
    stickerId?: string;
    stickerUrl?: string;
  }>,
) {
  const prepared = prepareOcChatModelMessages(messages, { max: HISTORY_MAX, withClock: true });
  const provider = resolveProvider();
  const flat =
    typeof system === 'string' ? system : joinOcChatSystemPrompt(system);
  if (provider === 'gemini') return callGemini(flat, prepared);
  if (provider === 'groq') return callGroq(flat, prepared);
  return callClaude(system, prepared);
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const characterId = String(body.characterId || '').trim();
  const visitorId = String(body.visitorId || '').trim().slice(0, 80);
  if (!characterId || !visitorId) {
    return NextResponse.json({ error: 'characterId / visitorId 필요' }, { status: 400 });
  }

  const ip = clientIp(req);
  if (!allowRate(`${ip}:${visitorId}`)) {
    return NextResponse.json({ error: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const mode = String(body.mode || 'chat').trim().toLowerCase();
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages
    .slice(-HISTORY_MAX)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').trim().slice(0, CONTENT_MAX),
      at: typeof m.at === 'number' && Number.isFinite(m.at) ? m.at : undefined,
      kind: typeof m.kind === 'string' ? m.kind : undefined,
      stickerId: typeof (m as ChatIn).stickerId === 'string' ? (m as ChatIn).stickerId : undefined,
      stickerUrl: typeof (m as ChatIn).stickerUrl === 'string' ? (m as ChatIn).stickerUrl : undefined,
    }))
    .filter((m) => m.content);

  try {
    const character = await loadCharacter(characterId);
    if (!character) {
      return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다' }, { status: 404 });
    }
    if (!character.chatbot?.enabled) {
      return NextResponse.json({ error: '이 캐릭터는 챗봇이 꺼져 있습니다' }, { status: 403 });
    }

    const affectionIn = clampAffection(
      typeof body.affection === 'number' ? body.affection : 0,
    );
    const moodNote = String(body.moodNote || '').trim().slice(0, 200) || undefined;
    const hoursSinceLast =
      typeof body.hoursSinceLast === 'number' && Number.isFinite(body.hoursSinceLast)
        ? Math.max(0, body.hoursSinceLast)
        : undefined;

    if (mode === 'proactive') {
      if (affectionIn < PROACTIVE_AFFECTION_MIN) {
        return NextResponse.json({
          reachOut: false,
          messages: [],
          delay: 'short',
        });
      }
      const live = buildOcChatLiveContext({
        messages,
        affection: affectionIn,
        chatbot: character.chatbot,
      });
      const world = await loadOcWorldData();
      const worldLines = buildWorldContextPromptLines({ character, world });
      const system = buildOcChatProactivePromptParts(character, {
        affection: affectionIn,
        moodNote,
        hoursSinceLast,
        live,
        messages,
        worldLines,
      });
      const raw = await callChatModel(
        system,
        messages.map((m) => ({
          role: m.role,
          content: m.content,
          at: m.at,
          kind: m.kind,
          stickerId: m.stickerId,
          stickerUrl: m.stickerUrl,
        })),
      );
      const decision = parseOcChatProactive(raw);
      return NextResponse.json(decision);
    }

    if (!messages.length) {
      return NextResponse.json({ error: '메시지가 비어 있습니다' }, { status: 400 });
    }
    if (messages[messages.length - 1]?.role !== 'user') {
      return NextResponse.json({ error: '마지막 메시지는 user여야 합니다' }, { status: 400 });
    }

    const lastUser = messages[messages.length - 1]?.content || '';
    const ban = checkChatBanned(lastUser);
    if (ban.blocked) {
      return NextResponse.json(
        { error: chatBanUserMessage(ban.reason), banned: true },
        { status: 400 },
      );
    }

    const freeGainToday =
      typeof body.freeGainToday === 'number' && Number.isFinite(body.freeGainToday)
        ? Math.max(0, body.freeGainToday)
        : 0;
    const freeLossToday =
      typeof body.freeLossToday === 'number' && Number.isFinite(body.freeLossToday)
        ? Math.max(0, body.freeLossToday)
        : 0;
    const turnsToday =
      typeof body.turnsToday === 'number' && Number.isFinite(body.turnsToday)
        ? Math.max(0, body.turnsToday)
        : 0;
    const closedForToday = body.closedForToday === true;
    const recentDeltaReasons = Array.isArray(body.recentDeltaReasons)
      ? body.recentDeltaReasons.map((x) => String(x || '').trim()).filter(Boolean).slice(-8)
      : [];
    const presenceRaw = String(body.presence || '').trim().toLowerCase();
    const presence =
      presenceRaw === 'online' || presenceRaw === 'offline' ? presenceRaw : undefined;
    const recentActions = Array.isArray(body.recentActions)
      ? body.recentActions
          .map((a) => {
            const at = typeof a?.at === 'number' ? a.at : 0;
            const action = String(a?.action || '').trim();
            const p = String(a?.presence || '').trim();
            if (!at || !action || (p !== 'online' && p !== 'offline')) return null;
            return {
              at,
              action,
              presence: p as 'online' | 'offline',
              note: String(a?.note || '').trim() || undefined,
            };
          })
          .filter(Boolean)
          .slice(-8)
      : [];

    const prior = messages.slice(0, -1);
    const lastBefore = [...prior]
      .reverse()
      .find((m) => typeof m.at === 'number')?.at;
    const live = buildOcChatLiveContext({
      messages,
      affection: affectionIn,
      chatbot: character.chatbot,
      lastContactBeforeMs: lastBefore,
    });
    const world = await loadOcWorldData();
    const worldLines = buildWorldContextPromptLines({ character, world });

    const system = buildOcChatSystemPromptParts(character, {
      affection: affectionIn,
      moodNote,
      turnsToday,
      hoursSinceLast,
      closedForToday,
      live,
      messages,
      lastContactBeforeMs: lastBefore,
      worldLines,
      presence,
      recentActions: recentActions as OcChatRecentAction[],
    });
    const rawReply = await callChatModel(
      system,
      messages.map((m) => ({
        role: m.role,
        content: m.content,
        at: m.at,
        kind: m.kind,
        stickerId: m.stickerId,
        stickerUrl: m.stickerUrl,
      })),
    );
    const behavior = parseOcChatBehavior(rawReply);
    const userText = messages[messages.length - 1]?.content || '';

    let proposed = behavior.affinityDelta;
    if (behavior.action === 'ignore' || behavior.action === 'read_only') {
      proposed = Math.min(proposed, 0);
    }
    const { delta, dailyGainNext, dailyLossNext } = computeFreeChatAffinityDelta({
      proposed,
      userText,
      dailyGainSoFar: freeGainToday,
      dailyLossSoFar: freeLossToday,
      recentReasons: recentDeltaReasons,
      deltaReason: behavior.deltaReason,
    });
    behavior.affinityDelta = delta;
    const affection = clampAffection(affectionIn + delta);
    const replyText = behavior.messages.join('\n') || '';

    return NextResponse.json({
      behavior,
      reply: replyText,
      affinityDelta: delta,
      affection,
      freeGainToday: dailyGainNext,
      freeLossToday: dailyLossNext,
      freeGainDate: todayKeyLocal(),
      deltaReason: behavior.deltaReason,
    });
  } catch (err) {
    let provider: Provider | 'unknown' = 'unknown';
    try {
      provider = resolveProvider();
    } catch {
      /* keys not configured */
    }
    const message = err instanceof Error ? err.message : '채팅 실패';
    console.error('[oc-chat] request failed', {
      provider,
      characterId,
      visitorId,
      mode,
      message,
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
    });
    const status =
      /API_KEY|키가 없/i.test(message) ? 503 : /할당량|결제|billing|quota/i.test(message) ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
