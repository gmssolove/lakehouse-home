import type { VNScene } from '@/components/vn/types';

/** 1화 — 가장 아름답고 거대한 괴이 */
const scene = {
  id: 'ep1_rescue',
  title: '1화 — 가장 아름답고 거대한 괴이',
  location: '골목',
  nextSceneId: 'ep1_classroom',
  lines: [
    {
      id: 'r_01',
      background: 'alley_dark',
      effect: 'blackout',
      narrationOnly: true,
      text: '',
    },
    {
      id: 'r_02',
      background: 'alley_dark',
      narrationOnly: true,
      text: '시야 전체가 검게 물드는 감각. 아, 나 여기서 죽는 건가— 그런 생각이 스치는 순간.',
    },
    {
      id: 'r_03',
      background: 'alley_dark',
      sprites: [{ character: 'ivee', expression: 'cold', position: 'center' }],
      narrationOnly: true,
      text: '무언가 새하얀 것이 시야를 가로질렀다. 슬로우 모션처럼, 그러나 실제로는 눈 한 번 깜빡일 새도 없이.',
    },
    {
      id: 'r_04',
      background: 'alley_dark',
      sprites: [{ character: 'ivee', expression: 'cold', position: 'center' }],
      narrationOnly: true,
      text: '덩어리가 반으로 갈라지며 허공에 흩어졌다. 비명도, 저항도 없었다. 그냥 — 없어졌다.',
    },
    {
      id: 'r_05',
      background: 'alley_dark',
      sprites: [{ character: 'ivee', expression: 'cold', position: 'center' }],
      narrationOnly: true,
      text: '그 자리엔 한 소녀가 무심하게 서 있었다. 방금 뭔가를 처치했다기보다는, 길가에 떨어진 쓰레기를 무심코 밟고 지나간 듯한 얼굴로.',
    },
    {
      id: 'r_06',
      speaker: '오무로',
      text: '……어, 저기, 방금 그건— 당신 지금 뭘 한 거—',
    },
    {
      id: 'r_07',
      speaker: '이브',
      text: '……밖에 나가지 마.',
    },
    {
      id: 'r_08',
      narrationOnly: true,
      text: '그게 다였다. 소녀는 더 이상의 설명도, 눈길도 주지 않고 돌아서서 골목 저편으로 걸음을 옮겼다.',
    },
    {
      id: 'r_09',
      sprites: [],
      narrationOnly: true,
      text: '순식간에 그녀의 뒷모습이 어둠 속으로 녹아들듯 사라졌다.',
    },
    {
      id: 'r_10',
      background: 'alley_entrance',
      narrationOnly: true,
      text: '혼자 남겨진 나는 한참을 그 자리에 못 박힌 듯 서 있었다.',
    },
    {
      id: 'r_11',
      speaker: '오무로',
      text: '……방금, 나 구해준 거 맞지? 근데 왜 구원자보다는…… 세상에서 제일 아름답고 거대한 괴이를 본 기분이지?',
    },
    {
      id: 'r_12',
      speaker: '오무로',
      text: '아니 잠깐, 지금 그게 중요한 게 아니잖아. 시간, 시간—!',
    },
    {
      id: 'r_13',
      narrationOnly: true,
      text: '휴대폰을 다시 꺼내 확인한 시간은 08시 27분. 죽을 뻔한 것치고는 상황 파악이 지나치게 빨랐다. 나는 정신없이 다시 뛰기 시작했다.',
    },
  ],
} satisfies VNScene;

export default scene;
