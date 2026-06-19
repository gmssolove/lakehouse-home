import type { PairItem } from '@/lib/types/character';

export function pairCover(pair: PairItem) {
  return {
    src: pair.img?.trim() || pair.charImgs?.[0]?.trim() || '',
    fit: pair.imgFit || pair.charImgFit?.[0] || 'cover',
    pos: pair.imgPos || pair.charImgPos?.[0] || 'center top',
    frame: pair.imgFrame,
  };
}

export function pairCardTitle(pair: PairItem) {
  return pair.pairTitle?.trim() || pair.relation?.trim() || `${pair.chars[0]} & ${pair.chars[1]}`;
}

export function pairCardSub(pair: PairItem) {
  const sub = pair.pairSub?.trim();
  if (sub) return sub;
  const a = pair.chars[0]?.trim();
  const b = pair.chars[1]?.trim();
  if (a && b) return `${a} · ${b}`;
  return '';
}

/** @deprecated pairCardTitle 사용 */
export function pairDisplayName(pair: PairItem) {
  return pairCardTitle(pair);
}
