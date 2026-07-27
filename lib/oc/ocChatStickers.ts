import stickersSeed from '@/data/oc-stickers.json';
import type { OcChatbotConfig, OcChatStickerStyle } from '@/lib/types/character';

export type OcStickerDef = {
  id: string;
  packId: string;
  imageUrl: string;
  tags: string[];
  intensity?: string;
};

export type OcStickerPack = {
  id: string;
  name?: string;
  stickers: OcStickerDef[];
};

type Seed = {
  packs?: Array<{
    id?: string;
    name?: string;
    stickers?: Array<{
      id?: string;
      imageUrl?: string;
      tags?: string[];
      intensity?: string;
    }>;
  }>;
};

export const OC_STICKER_TAG_OPTIONS = [
  '인사',
  '웃음/즐거움',
  '당황/부끄러움',
  '화남/짜증',
  '슬픔/시무룩',
  '놀람',
  '감사',
  '미안함/사과',
  '축하',
  '귀찮음/무관심',
  '애정/사랑',
  '거절/싫음',
  '생각중/고민',
  '굿나잇/인사(밤)',
] as const;

export function defaultStickerStyle(): OcChatStickerStyle {
  return { usesStickers: false, frequency: null, allowedPackIds: [] };
}

export function loadStickerPacks(): OcStickerPack[] {
  const seed = stickersSeed as Seed;
  return (seed.packs || [])
    .map((p) => {
      const packId = String(p.id || '').trim();
      if (!packId) return null;
      const stickers = (p.stickers || [])
        .map((s) => {
          const id = String(s.id || '').trim();
          const imageUrl = String(s.imageUrl || '').trim();
          if (!id || !imageUrl) return null;
          return {
            id,
            packId,
            imageUrl,
            tags: (s.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 4),
            intensity: s.intensity ? String(s.intensity) : undefined,
          } satisfies OcStickerDef;
        })
        .filter(Boolean) as OcStickerDef[];
      return { id: packId, name: p.name ? String(p.name) : undefined, stickers };
    })
    .filter(Boolean) as OcStickerPack[];
}

export function stickersForCharacter(chatbot?: OcChatbotConfig | null): OcStickerDef[] {
  const style = chatbot?.stickerStyle;
  if (!style?.usesStickers) return [];
  const allowed = new Set((style.allowedPackIds || []).map((x) => String(x).trim()).filter(Boolean));
  const packs = loadStickerPacks();
  const out: OcStickerDef[] = [];
  for (const pack of packs) {
    if (allowed.size && !allowed.has(pack.id)) continue;
    out.push(...pack.stickers);
  }
  return out;
}

export function resolveSticker(
  chatbot: OcChatbotConfig | undefined | null,
  pick: { id?: string; tags?: string[] } | null | undefined,
): OcStickerDef | null {
  if (!pick) return null;
  const pool = stickersForCharacter(chatbot);
  if (!pool.length) return null;
  const id = String(pick.id || '').trim();
  if (id) {
    const hit = pool.find((s) => s.id === id);
    if (hit) return hit;
  }
  const tags = (pick.tags || []).map((t) => t.trim()).filter(Boolean);
  if (!tags.length) return null;
  const scored = pool
    .map((s) => ({
      s,
      n: s.tags.filter((t) => tags.includes(t)).length,
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return scored[0]?.s || null;
}

export function stickerCatalogPromptLines(chatbot?: OcChatbotConfig | null): string[] {
  const style = chatbot?.stickerStyle || defaultStickerStyle();
  if (!style.usesStickers) {
    return ['스티커: 이 캐릭터는 이미지 스티커를 쓰지 않는다. sticker는 항상 null.'];
  }
  const pool = stickersForCharacter(chatbot);
  if (!pool.length) {
    return ['스티커: 사용 설정이지만 등록된 팩이 없다. sticker는 null.'];
  }
  const freq = style.frequency || 'medium';
  const lines = pool.slice(0, 40).map((s) => `- ${s.id} [${s.tags.join(', ')}]`);
  return [
    `스티커: 사용함 (빈도 ${freq}). 감정에 맞을 때만 sticker에 id를 넣고, 없으면 null.`,
    '허용 스티커:',
    ...lines,
  ];
}
