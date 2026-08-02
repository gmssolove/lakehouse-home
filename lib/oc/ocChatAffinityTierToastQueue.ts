import {
  affinityTierChangeLead,
  didCrossAffinityTier,
  resolveAffinityTier,
  resolveAffinityTierIndex,
  resolveAffinityTiers,
} from '@/lib/oc/ocChatAffinity';
import type { OcChatbotConfig } from '@/lib/types/character';

export const OC_CHAT_TIER_TOAST_MS = 4300;
export const OC_CHAT_TIER_TOAST_FILL_DELAY_MS = 350;

export type OcChatAffinityTierToastPayload = {
  id: string;
  name: string;
  avatarUrl: string;
  initial: string;
  lead: string;
  tierLabel: string;
  /** 0-based 새 단계 */
  tierIndex: number;
  prevTierIndex: number;
  totalTiers: number;
  direction: 'up' | 'down';
};

const PENDING_PREFIX = 'lh_oc_chat_tier_toast:';

function pendingKey(characterId: string, visitorId: string): string {
  return `${PENDING_PREFIX}${characterId}::${visitorId}`;
}

function avatarInitial(name: string): string {
  const n = name.trim();
  return n ? n.slice(0, 1) : '?';
}

export function buildAffinityTierToastPayload(opts: {
  name: string;
  avatarUrl?: string;
  prevAffection: number;
  nextAffection: number;
  chatbot?: OcChatbotConfig | null;
}): OcChatAffinityTierToastPayload | null {
  if (!didCrossAffinityTier(opts.prevAffection, opts.nextAffection, opts.chatbot)) {
    return null;
  }
  const prevTierIndex = resolveAffinityTierIndex(opts.prevAffection, opts.chatbot);
  const tierIndex = resolveAffinityTierIndex(opts.nextAffection, opts.chatbot);
  if (prevTierIndex === tierIndex) return null;
  const tiers = resolveAffinityTiers(opts.chatbot);
  const tier = resolveAffinityTier(opts.nextAffection, opts.chatbot);
  const name = opts.name.trim() || '캐릭터';
  const direction: 'up' | 'down' = tierIndex > prevTierIndex ? 'up' : 'down';
  return {
    id: `tier-${Date.now()}-${tierIndex}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    avatarUrl: (opts.avatarUrl || '').trim(),
    initial: avatarInitial(name),
    lead: affinityTierChangeLead(name, direction),
    tierLabel: tier.label,
    tierIndex,
    prevTierIndex,
    totalTiers: Math.max(1, tiers.length),
    direction,
  };
}

export function peekPendingAffinityTierToasts(
  characterId: string,
  visitorId: string,
): OcChatAffinityTierToastPayload[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(pendingKey(characterId, visitorId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OcChatAffinityTierToastPayload[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.tierLabel) : [];
  } catch {
    return [];
  }
}

export function queuePendingAffinityTierToast(
  characterId: string,
  visitorId: string,
  payload: OcChatAffinityTierToastPayload,
): void {
  if (typeof window === 'undefined') return;
  const id = String(characterId || '').trim();
  const vid = String(visitorId || '').trim();
  if (!id || !vid) return;
  try {
    const cur = peekPendingAffinityTierToasts(id, vid);
    cur.push(payload);
    sessionStorage.setItem(pendingKey(id, vid), JSON.stringify(cur.slice(-8)));
  } catch {
    /* ignore */
  }
}

export function takePendingAffinityTierToasts(
  characterId: string,
  visitorId: string,
): OcChatAffinityTierToastPayload[] {
  const list = peekPendingAffinityTierToasts(characterId, visitorId);
  if (typeof window === 'undefined') return list;
  try {
    sessionStorage.removeItem(pendingKey(characterId, visitorId));
  } catch {
    /* ignore */
  }
  return list;
}
