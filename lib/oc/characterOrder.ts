import type { OcCharacter } from '@/lib/types/character';

function creationOrder(a: OcCharacter, b: OcCharacter): number {
  const na = Number(a.id);
  const nb = Number(b.id);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return String(a.id).localeCompare(String(b.id));
}

export function buildCharacterNumberMap(characters: OcCharacter[]): Map<string, number> {
  const sorted = [...characters].sort(creationOrder);
  const map = new Map<string, number>();
  sorted.forEach((c, i) => map.set(String(c.id), i + 1));
  return map;
}

export function getCharacterNumber(characters: OcCharacter[], id: string | number): number {
  return buildCharacterNumberMap(characters).get(String(id)) ?? 0;
}
