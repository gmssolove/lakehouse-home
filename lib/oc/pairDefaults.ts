import type { PairItem } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';

/** 방패형(거꾸로 된 집) 실루엣 — flat top + bottom point */
export const PAIR_SHIELD_CLIP =
  'polygon(0% 0%, 100% 0%, 100% 90%, 50% 100%, 0% 90%)';

export function createEmptyPair(): PairItem {
  return {
    id: newId(),
    chars: ['캐릭터 1', '캐릭터 2'],
    img: '',
    imgFit: 'cover',
    imgPos: 'center top',
    relation: '',
    pairTitle: '',
    pairSub: '',
    desc: '',
    keywords: [],
    story: '',
  };
}
