import type { VNScene } from '@/components/vn/types';

const scene = {
  id: 'test_scene_branch_a',
  title: '테스트 분기 A',
  lines: [
    {
      id: 'a1',
      speaker: '이즈미',
      text: '……바닷가. 밤에만 가도 되는 곳이 있어.',
      background: 'cafe_window',
      sprites: [
        { character: 'ivee', expression: 'smile', position: 'left' },
        { character: 'izumi', expression: 'smile', position: 'right' },
      ],
    },
    {
      id: 'a2',
      speaker: '이브',
      text: '그럼, 거기로.',
    },
  ],
} satisfies VNScene;

export default scene;
