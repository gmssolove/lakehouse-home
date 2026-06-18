import type { OcCharacter } from '@/lib/types/character';

/** PV 인트로에만 쓰이는 대사 (소개 desc / VN dialogue 와 분리) */
export function pickQuoteLines(c: OcCharacter): string[] {
  const pv = c.pvIntroLines?.filter((l) => l.text?.trim()).map((l) => l.text!.trim());
  if (pv?.length) return pv.slice(0, 3);

  // 이전 데이터 호환: vnLines가 인트로용으로만 쓰이던 경우
  const legacy = c.vnLines?.filter((l) => l.text?.trim()).map((l) => l.text!.trim());
  if (legacy?.length) return legacy.slice(0, 3);

  return [];
}

export function shouldShowPvIntro(character: OcCharacter, siteEnabled: boolean): boolean {
  if (character.pvIntroEnabled === false) return false;
  if (character.pvIntroEnabled === true) return pickQuoteLines(character).length > 0;
  return siteEnabled && pickQuoteLines(character).length > 0;
}
