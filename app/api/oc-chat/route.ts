import { NextResponse } from 'next/server';
import {
  clampAffection,
  computeFreeChatAffinityDelta,
  PROACTIVE_AFFECTION_MIN,
  todayKeyLocal,
} from '@/lib/oc/ocChatAffinity';
import {
  parseOcChatBehavior,
  parseOcChatProactive,
} from '@/lib/oc/ocChatBehavior';
import { buildOcChatLiveContext } from '@/lib/oc/ocChatContext';
import { checkChatBanned, chatBanUserMessage } from '@/lib/oc/ocChatSafety';
import type { OcChatRecentAction } from '@/lib/oc/ocChatPresence';
import { resolveRecentActionsForPrompt } from '@/lib/oc/ocChatPresence';
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
  proactiveKind?: string;
  openThreads?: Array<{ id?: string; summary?: string }>;
};

type RateBucket = { count: number; resetAt: number };
const rateMap = new Map<string, RateBucket>();

class OcChatUpstreamError extends Error {
  readonly provider = 'anthropic' as const;
  readonly upstreamStatus: number;
  readonly upstreamBody: string;

  constructor(message: string, upstreamStatus: number, upstreamBody: string) {
    super(message);
    this.name = 'OcChatUpstreamError';
    this.upstreamStatus = upstreamStatus;
    this.upstreamBody = upstreamBody;
  }
}

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

function resolveProvider(): 'anthropic' {
  const forced = (process.env.OC_CHAT_PROVIDER || '').trim().toLowerCase();
  if (forced && forced !== 'anthropic') {
    throw new Error(
      `OC_CHAT_PROVIDER=${forced}는 지원하지 않습니다. anthropic(Claude Sonnet)만 사용합니다.`,
    );
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
  }
  return 'anthropic';
}

function ocChatSystemText(system: string | OcChatSystemPromptParts): string {
  return typeof system === 'string' ? system : joinOcChatSystemPrompt(system);
}

async function callClaude(
  system: string | OcChatSystemPromptParts,
  messages: { role: string; content: string }[],
) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다');
  const model = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
  const systemText = ocChatSystemText(system);

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
        max_tokens: 768,
        temperature: 0.85,
        system: systemText,
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
      return text;
    }

    lastStatus = res.status;
    lastBody = rawText;
    const errType = data.error?.type?.trim();
    const errMsg = data.error?.message?.trim();
    lastDetail =
      errType && errMsg
        ? `${errType}: ${errMsg}`
        : rawText.trim() && !rawText.trim().startsWith('{')
          ? rawText.trim().slice(0, 500)
          : rawText.trim().slice(0, 500) || `HTTP ${res.status}`;

    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) break;
    await new Promise((r) => setTimeout(r, 450 * attempt + Math.floor(Math.random() * 200)));
  }

  throw new OcChatUpstreamError(
    lastStatus === 403 && /request not allowed|forbidden/i.test(lastDetail)
      ? `Anthropic ${lastStatus}: ${lastDetail} (Worker 출구 지역이 Anthropic 미지원일 수 있음 — 관리자에게 문의)`
      : `Anthropic ${lastStatus}: ${lastDetail}`,
    lastStatus,
    lastBody,
  );
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
  resolveProvider();
  return callClaude(system, prepared);
}

function httpStatusForChatError(err: unknown, message: string): number {
  if (err instanceof OcChatUpstreamError) {
    if (err.upstreamStatus === 429) return 429;
    if (/API_KEY|키가 없/i.test(message)) return 503;
    return 502;
  }
  if (/API_KEY|키가 없/i.test(message)) return 503;
  if (/할당량|결제|billing|quota/i.test(message)) return 429;
  return 502;
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
      const proactiveKind =
        String(body.proactiveKind || '').trim() === 'task' ? 'task' : 'emotion';
      const openThreads = Array.isArray(body.openThreads)
        ? body.openThreads
            .map((t) => ({
              id: String(t?.id || '').trim() || undefined,
              summary: String(t?.summary || '').trim(),
            }))
            .filter((t) => t.summary)
            .slice(0, 8)
        : undefined;
      const system = buildOcChatProactivePromptParts(character, {
        affection: affectionIn,
        moodNote,
        hoursSinceLast,
        live,
        messages,
        worldLines,
        proactiveKind,
        openThreads,
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
    const recentActionsRaw = Array.isArray(body.recentActions)
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
      : [];
    const recentActions = resolveRecentActionsForPrompt(
      recentActionsRaw as OcChatRecentAction[],
      messages,
    );

    console.info('[oc-chat] inbound', {
      characterId,
      visitorId: visitorId.slice(0, 8),
      mode: 'chat',
      msgCount: messages.length,
      recentActionsRawCount: recentActionsRaw.length,
      recentActionsCount: recentActions.length,
      recentActions: recentActions.map((a) => ({
        at: a.at,
        action: a.action,
        presence: a.presence,
        note: a.note ? String(a.note).slice(0, 40) : undefined,
      })),
    });

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
    console.info('[oc-chat] model raw', {
      characterId,
      visitorId: visitorId.slice(0, 8),
      rawLen: rawReply.length,
      rawPreview: rawReply.slice(0, 1200),
    });
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
    /* delta는 점수 바닥(0)에 막혀도 일일 손실·토스트용으로 그대로 반환 */
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
    let provider: 'anthropic' | 'unknown' = 'unknown';
    try {
      provider = resolveProvider();
    } catch {
      /* keys not configured */
    }
    const message = err instanceof Error ? err.message : '채팅 실패';
    const status = httpStatusForChatError(err, message);
    const payload: Record<string, unknown> = {
      error: message,
      code: 'OC_CHAT_UPSTREAM',
      provider,
    };
    if (err instanceof OcChatUpstreamError) {
      payload.upstreamStatus = err.upstreamStatus;
      payload.upstreamBody = err.upstreamBody.slice(0, 8000);
    }
    console.error('[oc-chat] request failed', {
      provider,
      characterId,
      visitorId,
      mode,
      message,
      upstreamStatus: err instanceof OcChatUpstreamError ? err.upstreamStatus : undefined,
      upstreamBodyPreview:
        err instanceof OcChatUpstreamError ? err.upstreamBody.slice(0, 400) : undefined,
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
    });
    return NextResponse.json(payload, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
