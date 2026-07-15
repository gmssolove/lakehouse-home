import type { VNScene } from '@/components/vn/types';

/** 콜드오픈 분기 — 이브와 만남 */
const scene = {
  id: 'ep1_encounter_ivee',
  title: '1화 — 이브와의 조우',
  location: '뒷골목 입구',
  lines: [
    {
      id: 'i1',
      background: 'alley_entrance',
      narrationOnly: true,
      text: '앞만 보고 달렸다. 발밑에 그림자가 한 박자 늦게 따라붙는다.',
    },
    {
      id: 'i2',
      speaker: '????',
      text: '……거기, 잠깐.',
      sprites: [{ character: 'ivee', expression: 'neutral', position: 'center' }],
    },
    {
      id: 'i3',
      speaker: '이브',
      text: '혼자 돌아다니면 안 돼. 이런 골목은.',
      sprites: [{ character: 'ivee', expression: 'smile', position: 'center' }],
    },
  ],
} satisfies VNScene;

export default scene;
