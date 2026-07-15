import type { VNScene } from '@/components/vn/types';

const scene = {
  id: 'test_scene_branch_b',
  title: '테스트 분기 B',
  lines: [
    {
      id: 'b1',
      speaker: '이즈미',
      text: '응. 말 줄이는 연습도 나쁘지 않지.',
      background: 'night_street',
      sprites: [{ character: 'izumi', expression: 'smile', position: 'center' }],
    },
    {
      id: 'b2',
      text: '둘은 짧게 고개를 끄덕이고, 가로등 밖으로 걸음을 옮겼다.',
      sprites: [],
    },
  ],
} satisfies VNScene;

export default scene;
