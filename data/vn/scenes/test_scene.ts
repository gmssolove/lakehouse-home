import type { VNScene } from '@/components/vn/types';

/** 테스트 · 이브 & 이즈미 */
const scene = {
  id: 'test_scene',
  title: '테스트 · 이브 & 이즈미',
  lines: [
    {
      id: '1',
      speaker: '이브',
      text: '……여기, 생각보다 조용하네.',
      background: 'night_street',
      sprites: [{ character: 'ivee', expression: 'neutral', position: 'left' }],
    },
    {
      id: '2',
      speaker: '이즈미',
      text: '네가 먼저 말했잖아. 오늘은 아무 말도 하지 말자고.',
      sprites: [
        { character: 'ivee', expression: 'smile', position: 'left' },
        { character: 'izumi', expression: 'neutral', position: 'right' },
      ],
    },
    {
      id: '3',
      text: '가로등 아래로 바람이 스치고, 둘 사이의 공기가 잠깐 가라앉는다.',
      background: 'cafe_window',
      sprites: [
        { character: 'ivee', expression: 'smile', position: 'left' },
        { character: 'izumi', expression: 'smile', position: 'right' },
      ],
    },
    {
      id: '4',
      speaker: '이브',
      text: '그래도…… 하나만 물을게.',
      sprites: [
        { character: 'ivee', expression: 'neutral', position: 'left' },
        { character: 'izumi', expression: 'neutral', position: 'right' },
      ],
      choices: [
        { text: '어디에 가고 싶어?', nextSceneId: 'test_scene_branch_a' },
        { text: '오늘은 여기까지 하자.', nextSceneId: 'test_scene_branch_b' },
      ],
    },
  ],
} satisfies VNScene;

export default scene;
