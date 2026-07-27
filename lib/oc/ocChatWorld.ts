import { readFile } from 'fs/promises';
import path from 'path';
import type { OcRelationCloseness, OcCharacter } from '@/lib/types/character';
import { todayKeyLocal } from '@/lib/oc/ocChatAffinity';

export type OcWorldCharacter = {
  id: string;
  name: string;
  identity?: string;
  routine?: string;
  traits?: string[];
  relationHint?: string;
  publicFacts?: Record<string, string>;
  privateFacts?: Record<string, string>;
  privacyThreshold?: OcRelationCloseness;
};

export type OcDailyEvent = {
  id: string;
  involves: string[];
  text: string;
};

export type OcWorldData = {
  worldCharacters: OcWorldCharacter[];
  dailyEvents: OcDailyEvent[];
};

const RTDB_WORLD_URL =
  'https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app/lhdata/oc_world.json';

const CLOSENESS_RANK: Record<OcRelationCloseness, number> = {
  distant: 0,
  wary: 1,
  familiar: 2,
  close: 3,
};

function asWorld(raw: unknown): OcWorldData {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const chars = Array.isArray(o.worldCharacters) ? o.worldCharacters : [];
  const events = Array.isArray(o.dailyEvents) ? o.dailyEvents : [];
  return {
    worldCharacters: chars
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        id: String(c.id || '').trim(),
        name: String(c.name || '').trim(),
        identity: String(c.identity || '').trim() || undefined,
        routine: String(c.routine || '').trim() || undefined,
        traits: Array.isArray(c.traits)
          ? c.traits.map((t) => String(t || '').trim()).filter(Boolean)
          : undefined,
        relationHint: String(c.relationHint || '').trim() || undefined,
        publicFacts:
          c.publicFacts && typeof c.publicFacts === 'object'
            ? Object.fromEntries(
                Object.entries(c.publicFacts as Record<string, unknown>).map(([k, v]) => [
                  k,
                  String(v ?? ''),
                ]),
              )
            : undefined,
        privateFacts:
          c.privateFacts && typeof c.privateFacts === 'object'
            ? Object.fromEntries(
                Object.entries(c.privateFacts as Record<string, unknown>).map(([k, v]) => [
                  k,
                  String(v ?? ''),
                ]),
              )
            : undefined,
        privacyThreshold: ((): OcRelationCloseness => {
          if (
            c.privacyThreshold === 'close' ||
            c.privacyThreshold === 'familiar' ||
            c.privacyThreshold === 'wary' ||
            c.privacyThreshold === 'distant'
          ) {
            return c.privacyThreshold;
          }
          return 'familiar';
        })(),
      }))
      .filter((c) => c.id && c.name),
    dailyEvents: events
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({
        id: String(e.id || '').trim(),
        involves: Array.isArray(e.involves)
          ? e.involves.map((x) => String(x || '').trim()).filter(Boolean)
          : [],
        text: String(e.text || '').trim(),
      }))
      .filter((e) => e.id && e.text),
  };
}

let memCache: { at: number; data: OcWorldData } | null = null;

async function loadSeedFile(): Promise<OcWorldData> {
  try {
    const file = path.join(process.cwd(), 'data', 'oc-world.json');
    const raw = await readFile(file, 'utf8');
    return asWorld(JSON.parse(raw));
  } catch {
    return { worldCharacters: [], dailyEvents: [] };
  }
}

/** 서버용 — RTDB 우선, 없으면 data/oc-world.json */
export async function loadOcWorldData(): Promise<OcWorldData> {
  const now = Date.now();
  if (memCache && now - memCache.at < 60_000) return memCache.data;
  try {
    const res = await fetch(RTDB_WORLD_URL, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json === 'object') {
        const data = asWorld(json);
        if (data.worldCharacters.length || data.dailyEvents.length) {
          memCache = { at: now, data };
          return data;
        }
      }
    }
  } catch {
    /* fall through */
  }
  const seed = await loadSeedFile();
  memCache = { at: now, data: seed };
  return seed;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function canKnowPrivate(
  closeness: OcRelationCloseness | undefined,
  threshold: OcRelationCloseness | undefined,
): boolean {
  const c = CLOSENESS_RANK[closeness || 'distant'];
  const t = CLOSENESS_RANK[threshold || 'close'];
  return c >= t;
}

export function closenessLabel(c: OcRelationCloseness | undefined): string {
  switch (c) {
    case 'close':
      return '챙김/친함';
    case 'familiar':
      return '귀찮지만 알 정도';
    case 'wary':
      return '경계';
    case 'distant':
    default:
      return '무관심·거의 모름';
  }
}

/** 날짜+OC id로 결정적 추출 — 크론 없이 하루 고정 */
export function pickDailyEventsForOc(opts: {
  events: OcDailyEvent[];
  ocId: string;
  relatedWorldIds: string[];
  dayKey?: string;
  max?: number;
}): OcDailyEvent[] {
  const day = opts.dayKey || todayKeyLocal();
  const related = new Set(opts.relatedWorldIds);
  const pool = opts.events.filter(
    (e) => e.involves.length === 0 || e.involves.some((id) => related.has(id)),
  );
  if (!pool.length) return [];
  const max = Math.min(opts.max ?? 2, pool.length);
  const seed = hashStr(`${day}:${opts.ocId}`);
  const count = seed % (max + 1); /* 0~max */
  if (count === 0) return [];
  const shuffled = [...pool].sort(
    (a, b) => hashStr(`${day}:${opts.ocId}:${a.id}`) - hashStr(`${day}:${opts.ocId}:${b.id}`),
  );
  return shuffled.slice(0, count);
}

export function buildWorldContextPromptLines(opts: {
  character: OcCharacter;
  world: OcWorldData;
}): string[] {
  const rels = opts.character.relationships || [];
  const byId = new Map(opts.world.worldCharacters.map((c) => [c.id, c]));
  const linked = rels
    .map((r) => {
      const wid = (r.worldCharacterId || '').trim();
      const wc = wid ? byId.get(wid) : undefined;
      return { rel: r, wc };
    })
    .filter((x) => x.wc);

  const relatedIds = linked.map((x) => x.wc!.id);
  const todays = pickDailyEventsForOc({
    events: opts.world.dailyEvents,
    ocId: String(opts.character.id),
    relatedWorldIds: relatedIds,
  });

  const lines: string[] = [
    '주변 인물 (공통 세계 — 객관 사실. 너의 감정은 관계 closeness/note로만):',
    '플레이어(방문자)와는 메신저/채팅으로 알게 된 사이다. 실제로 매일 학교에서 붙어 다니는 설정으로 단정하지 마라.',
  ];

  if (!linked.length) {
    lines.push('- (연결된 주변 인물 없음 — 지어내지 말고 모르면 모른다고 해라)');
  } else {
    for (const { rel, wc } of linked) {
      const c = rel.closeness || 'distant';
      const facts: string[] = [];
      if (wc!.identity) facts.push(wc!.identity);
      if (wc!.routine) facts.push(`루틴: ${wc!.routine}`);
      const pub = wc!.publicFacts
        ? Object.entries(wc!.publicFacts)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')
        : '';
      if (pub) facts.push(`공개정보: ${pub}`);
      if (canKnowPrivate(c, wc!.privacyThreshold) && wc!.privateFacts) {
        const priv = Object.entries(wc!.privateFacts)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        if (priv) facts.push(`친하면 알 법한 정보: ${priv}`);
      }
      lines.push(
        `- ${wc!.name} [${closenessLabel(c)}] ${rel.relation || ''} ${rel.note ? `(${rel.note})` : ''}`.trim(),
      );
      if (facts.length) lines.push(`  · ${facts.join(' / ')}`);
    }
  }

  lines.push('', '[오늘 인지하고 있는 주변 상황]');
  if (!todays.length) {
    lines.push('- 오늘은 특별히 눈에 띈 주변 일 없음. 물어보면 짧게 "몰라"/단답.');
  } else {
    for (const ev of todays) {
      const names = ev.involves
        .map((id) => byId.get(id)?.name || id)
        .join(', ');
      lines.push(`- ${names}: ${ev.text}`);
    }
  }
  lines.push(
    '※ 목록/관계에 없는 인물·팩트는 절대 지어내지 말고 모른다고 답할 것.',
    '※ 경계/무관심인 인물은 먼저 꺼내지 말고, 캐물어도 짧게만.',
    '※ 챙김/친한 인물만 짧은 감정·디테일을 섞어도 된다.',
  );
  return lines;
}
