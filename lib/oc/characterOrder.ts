import type { OcCharacter } from '@/lib/types/character';

export function buildCharacterNumberMap(characters: OcCharacter[]): Map<string, number> {
  const map = new Map<string, number>();
  characters.forEach((c, i) => map.set(String(c.id), i + 1));
  return map;
}

export function getCharacterNumber(characters: OcCharacter[], id: string | number): number {
  return buildCharacterNumberMap(characters).get(String(id)) ?? 0;
}
