import type { VNScene } from '@/components/vn/types';

/** 연출 기능 데모 — /vn/effects_demo */
const scene = {
  id: 'effects_demo',
  title: '연출 테스트',
  lines: [
    {
      id: 'e0',
      speaker: '시스템',
      text: '연출 테스트 씬입니다. 클릭해서 다음으로.',
      background: 'night_street',
    },
    {
      id: 'e_caption',
      speaker: '이브',
      text: '……기억나. 그때도 이런 밤이었지.',
      caption: '3시간 전',
      sprites: [{ character: 'ivee', expression: 'neutral', position: 'left' }],
    },
    {
      id: 'e_narration',
      text: '가로등 아래, 시간이 잠시 멈춘 것 같았다.',
      narrationOnly: true,
      background: 'cafe_window',
      sprites: [],
    },
    {
      id: 'e_shake',
      speaker: '이즈미',
      text: '……방금, 땅이 흔들린 것 같은데.',
      effect: 'shake',
      sprites: [
        { character: 'ivee', expression: 'neutral', position: 'left' },
        { character: 'izumi', expression: 'neutral', position: 'right' },
      ],
    },
    {
      id: 'e_blackout',
      text: '',
      effect: 'blackout',
      sprites: [],
    },
    {
      id: 'e_title',
      text: '',
      effect: 'titlecard',
      titleText: 'KISARAGI',
      sprites: [],
    },
    {
      id: 'e_end',
      speaker: '시스템',
      text: '연출 테스트 끝.',
      background: 'night_street',
      sprites: [{ character: 'ivee', expression: 'smile', position: 'center' }],
    },
  ],
} satisfies VNScene;

export default scene;
