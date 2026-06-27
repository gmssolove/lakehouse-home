import type { TrpgPlayerProfile } from '@/lib/types/site-content';

export function movePlayerInList(players: TrpgPlayerProfile[], id: string, direction: -1 | 1) {
  const index = players.findIndex((p) => p.id === id);
  if (index < 0) return players;

  const target = index + direction;
  if (target < 0 || target >= players.length) return players;

  const next = [...players];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function playerOrderMeta(players: TrpgPlayerProfile[], id: string) {
  const index = players.findIndex((p) => p.id === id);
  return {
    index,
    total: players.length,
    canUp: index > 0,
    canDown: index >= 0 && index < players.length - 1,
  };
}
