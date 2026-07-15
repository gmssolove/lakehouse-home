import type { VNScene } from '@/components/vn/types';

/** 1화 — 운명의 개척 */
const scene = {
  id: 'ep1_encounter',
  title: '1화 — 운명의 개척',
  location: '교실 앞 복도',
  lines: [
    {
      id: 's3_01',
      background: 'school_gate_morning',
      bgm: 'gakuen_light',
      narrationOnly: true,
      text: '온몸의 털이 곤두서는 공포에 휩싸여, 나도 모르게 뒷걸음질을 쳤다. 기괴한 뒷골목에서 벗어나 탁 트인 대로변으로 나오자마자 숨통이 탁 트였다.',
    },
    {
      id: 's3_02',
      background: 'school_gate_morning',
      speaker: '오무로',
      text: '하아, 하아……! 방금 그건 진짜 위험했다. 지각이 문제가 아니라 목숨이 날아갈 뻔한 기분인데……?',
    },
    {
      id: 's3_03',
      background: 'school_corridor',
      narrationOnly: true,
      text: '죽어라 뛰어 교내로 들어섰다. 계단을 단숨에 뛰어올라 마침내 교실 뒷문 앞에 도착했을 때, 시간은 정확히 8시 29분. 세이프다.',
    },
    {
      id: 's3_04',
      background: 'school_corridor',
      speaker: '오무로',
      text: '후우, 살았다…… 바람이나 좀 쐬고 들어갈까.',
    },
    {
      id: 's3_05',
      background: 'school_corridor',
      narrationOnly: true,
      text: '숨을 고르며 복도로 나가려던 찰나, 교실 뒷문 바로 앞을 가로막고 서 있는 묘한 분위기의 두 사람 때문에 발을 멈췄다.',
    },
    {
      id: 's3_06',
      background: 'school_corridor',
      speaker: '이브',
      text: '……비켜, 엔도. 안 들려?',
    },
    {
      id: 's3_07',
      background: 'school_corridor',
      narrationOnly: true,
      text: '차갑고 날카로운 목소리. 새침하게 가라앉은 흑발의 미소녀— 이브가 불쾌하다는 듯 미간을 찌푸린 채 상대를 쏘아보고 있었다.',
    },
    {
      id: 's3_08',
      background: 'school_corridor',
      narrationOnly: true,
      text: '그 앞을 가로막은 채 문틀에 나른하게 기대어 서 있는 녀석은, 이즈미. 녀석은 당황하기는커녕 특유의 생글생글한 미소를 띠며 고개를 살짝 숙였다.',
    },
    {
      id: 's3_09',
      background: 'school_corridor',
      speaker: '이즈미',
      text: '들려, 들려. 들리니까 이러고 있지.',
    },
    {
      id: 's3_10',
      background: 'school_corridor',
      speaker: '이브',
      text: '……비키라고, 진짜.',
    },
    {
      id: 's3_11',
      background: 'school_corridor',
      narrationOnly: true,
      text: '이브가 이마를 짚으며 어이없다는 듯 헛웃음을 터뜨리더니, 이즈미의 옆구리를 팔꿈치로 세게 밀치고 복도로 걸어 나가 버렸다.',
    },
    {
      id: 's3_12',
      background: 'school_corridor',
      narrationOnly: true,
      text: '이즈미는 억 소리를 내며 밀려나면서도, 멀어지는 이브의 뒷모습에서 끈질기게 시선을 떼지 않고 픽 웃었다.',
    },
    {
      id: 's3_13',
      background: 'school_corridor',
      speaker: '이즈미',
      text: '큭, 저렇게 매일 지독하게 굴어대니 질리지가 않지.',
    },
    {
      id: 's3_14',
      background: 'school_corridor',
      speaker: '오무로',
      text: '…….',
    },
    {
      id: 's3_15',
      background: 'school_corridor',
      narrationOnly: true,
      text: '문 바로 뒤에서 본의 아니게 그 꼴을 다 지켜본 내 얼굴이 썩어 들어갔다. 지독한 건 저 새끼 같은데, 진짜 별꼴이다 싶었다.',
    },
  ],
} satisfies VNScene;

export default scene;
