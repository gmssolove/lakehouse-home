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
} from '@/lib/oc/ocChatPrompt';
import { prepareOcChatModelMessages } from '@/lib/oc/ocChatModelMessages';
import { generateVerifiedOcChatResponse } from '@/lib/oc/ocChatVerify';
import {
  callOcChatLlm,
  geminiVerifyModel,
  OcChatUpstreamError,
  resolveOcChatProvider,
} from '@/lib/oc/ocChatLlm';
import { isEveCharacter, stripEveTrailingPeriod } from '@/lib/oc/ocChatEveStyle';
import { OC_CHAT_API_HISTORY } from '@/lib/oc/ocChat';
import type { OcCharacter } from '@/lib/types/character';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RTDB_CHARS_URL =
  'https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app/lhdata/oc_characters.json';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 24;
/** 말풍선 단위. ~18턴 왕복 — OC_CHAT_API_HISTORY와 동기 */
const HISTORY_MAX = OC_CHAT_API_HISTORY;
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

async function callChatModel(
  system: Parameters<typeof callOcChatLlm>[0],
  messages: Array<{
    role: string;
    content: string;
    at?: number;
    kind?: string;
    stickerId?: string;
    stickerUrl?: string;
  }>,
) {
  const prepared = prepareOcChatModelMessages(messages, {
    max: HISTORY_MAX,
    withClock: true,
    maxModelTurns: HISTORY_MAX,
  });
  return callOcChatLlm(system, prepared, {
    enableCache: true,
    logLabel: 'chat',
  });
}

async function callVerifyModel(system: string, userContent: string) {
  const provider = resolveOcChatProvider();
  if (provider === 'gemini') {
    return callOcChatLlm(system, [{ role: 'user', content: userContent }], {
      maxTokens: 64,
      temperature: 0,
      thinkingLevel: 'minimal',
      logLabel: 'verify',
      geminiModels: [geminiVerifyModel()],
    });
  }
  return callOcChatLlm(system, [{ role: 'user', content: userContent }], {
    model: process.env.ANTHROPIC_VERIFY_MODEL || 'claude-haiku-4-5-20251001',
    maxTokens: 16,
    temperature: 0,
    enableCache: false,
    logLabel: 'verify',
  });
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
      if (isEveCharacter(character) && decision.messages?.length) {
        decision.messages = decision.messages.map((m) =>
          stripEveTrailingPeriod(String(m || '').trim()),
        );
      }
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
      userBurstCount: (() => {
        let n = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.role !== 'user') break;
          n += 1;
        }
        return n;
      })(),
      lastUserPreview: (messages[messages.length - 1]?.content || '').slice(0, 80),
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
    const historyIn = messages.map((m) => ({
      role: m.role,
      content: m.content,
      at: m.at,
      kind: m.kind,
      stickerId: m.stickerId,
      stickerUrl: m.stickerUrl,
    }));
    const prepared = prepareOcChatModelMessages(historyIn, {
      max: HISTORY_MAX,
      withClock: true,
      maxModelTurns: HISTORY_MAX,
    });
    const userText = messages[messages.length - 1]?.content || '';
    const recentUserBurst: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role !== 'user') break;
      recentUserBurst.unshift(messages[i]!.content);
    }
    const recentAssistantMessages = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .slice(-8);
    resolveOcChatProvider();
    const verified = await generateVerifiedOcChatResponse({
      lastUserMessage: userText,
      recentUserBurst,
      recentAssistantMessages,
      historyForModel: prepared,
      generate: (msgs) =>
        callOcChatLlm(system, msgs, {
          enableCache: true,
          logLabel: 'chat',
          temperature: 0.92,
        }),
      verify: callVerifyModel,
      parse: parseOcChatBehavior,
      eveStyle: isEveCharacter(character),
    });
    console.info('[oc-chat] model raw', {
      characterId,
      visitorId: visitorId.slice(0, 8),
      rawLen: verified.raw.length,
      rawPreview: verified.raw.slice(0, 1200),
      regenerated: verified.regenerated,
      verifyPassed: verified.verifyPassed,
      historyMsgs: prepared.length,
      userBurstCount: (() => {
        let n = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.role !== 'user') break;
          n += 1;
        }
        return n;
      })(),
    });
    const behavior = verified.behavior;

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
    let provider: 'gemini' | 'anthropic' | 'unknown' = 'unknown';
    try {
      provider = resolveOcChatProvider();
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
