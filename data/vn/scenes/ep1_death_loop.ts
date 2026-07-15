import type { VNScene } from '@/components/vn/types';

/** 콜드오픈 분기 — 돌아보기 */
const scene = {
  id: 'ep1_death_loop',
  title: '1화 — 죽음의 고리',
  location: '골목',
  lines: [
    {
      id: 'd1',
      background: 'alley_dark',
      narrationOnly: true,
      text: '뒤를 돌아본 순간, 공기가 한꺼번에 목을 틀어막았다.',
    },
    {
      id: 'd2',
      narrationOnly: true,
      effect: 'shake',
      text: '……역시, 죽는 건가.',
    },
    {
      id: 'd3',
      effect: 'blackout',
      text: '',
    },
  ],
} satisfies VNScene;

export default scene;
