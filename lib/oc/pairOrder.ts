import type { PairItem } from '@/lib/types/character';

export function movePairInList(pairs: PairItem[], id: string, direction: -1 | 1): PairItem[] {
  const index = pairs.findIndex((p) => p.id === id);
  if (index < 0) return pairs;

  const target = index + direction;
  if (target < 0 || target >= pairs.length) return pairs;

  const next = [...pairs];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function pairOrderMeta(pairs: PairItem[], id: string) {
  const index = pairs.findIndex((p) => p.id === id);
  return {
    index,
    total: pairs.length,
    canUp: index > 0,
    canDown: index >= 0 && index < pairs.length - 1,
  };
}
