import type { ExplorationScene } from '@/components/vn/types';

/** 동아리실 포인트앤클릭 테스트 */
const scene = {
  id: 'ep1_clubroom_explore',
  type: 'exploration',
  title: '1화 — 동아리실 탐색',
  location: '동아리실',
  background: 'cafe_window',
  bgm: 'gakuen_light',
  nextSceneId: 'ep1_encounter',
  hotspots: [
    {
      id: 'desk',
      label: '책상',
      x: 18,
      y: 52,
      width: 22,
      height: 18,
      oneTime: false,
      lines: [
        {
          id: 'desk_1',
          speaker: '오무로',
          text: '서류가 잔뜩 쌓여 있다. ……우리 부실인데 왜 이렇게 지저분한 거지?',
        },
        {
          id: 'desk_2',
          narrationOnly: true,
          text: '구석에 『괴이 조사 노트』라 적힌 공책이 눈에 띄었다.',
        },
      ],
    },
    {
      id: 'window',
      label: '창문',
      x: 62,
      y: 22,
      width: 20,
      height: 28,
      oneTime: false,
      lines: [
        {
          id: 'win_1',
          narrationOnly: true,
          text: '오후 햇살이 부드럽게 들어온다. 바깥은 평화롭기만 하다.',
        },
      ],
    },
    {
      id: 'blackboard',
      label: '칠판',
      x: 38,
      y: 18,
      width: 24,
      height: 22,
      oneTime: true,
      lines: [
        {
          id: 'bb_1',
          speaker: '오무로',
          text: '「괴이부 정기 회의 — 목요일」…… 아직 부원이 나만 있는데?',
        },
      ],
    },
    {
      id: 'myako',
      label: '먀코',
      x: 72,
      y: 55,
      width: 16,
      height: 32,
      oneTime: false,
      lines: [
        {
          id: 'myako_1',
          speaker: '먀코',
          text: '냐아…… (쿠션 위에서 하품을 한다)',
        },
        {
          id: 'myako_2',
          speaker: '오무로',
          text: '그래, 너라도 있어서 다행이다. ……부원 등록은 안 되지만.',
        },
      ],
    },
  ],
} satisfies ExplorationScene;

export default scene;
