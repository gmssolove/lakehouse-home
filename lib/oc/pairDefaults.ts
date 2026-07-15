import type { PairItem } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';

/** 방패형(거꾸로 된 집) 실루엣 — flat top + bottom point */
export const PAIR_SHIELD_CLIP =
  'polygon(0% 0%, 100% 0%, 100% 90%, 50% 100%, 0% 90%)';

/** OC char-card 와 동일 비율 (oc-rebuild `.char-card`) */
export const OC_CARD_ASPECT = '3 / 4.55';
export const PAIR_CARD_ASPECT = OC_CARD_ASPECT;
export const PAIR_CARD_W = 158;
export const PAIR_CARD_H = 240;
/** @deprecated skew 펼침용 — OC 카드 통일 후 미사용 */
export const PAIR_CARD_W_ACTIVE = 158;

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
    chemistry: [
      { label: '긴장감', value: 50 },
      { label: '신뢰도', value: 50 },
      { label: '친밀도', value: 50 },
    ],
    honorifics: { aToB: '', bToA: '' },
    charNotes: [{ role: '', note: '' }, { role: '', note: '' }],
    commissions: [],
    gallery: [],
  };
}
