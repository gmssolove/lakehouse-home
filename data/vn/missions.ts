export type Mission = {
  id: string;
  title: string;
  description: string;
  chapterId: string;
};

export const MISSIONS: Mission[] = [
  {
    id: 'm_ep1_investigate_alley',
    title: '뒷골목의 이상 현상 조사',
    description: '괴이부 창설 첫날, 등굣길 뒷골목에서 감지된 이상 기척의 정체를 밝혀라.',
    chapterId: 'ep1',
  },
  {
    id: 'm_ep1_who_is_she',
    title: '저 전학생은 누구인가',
    description: '아침 골목의 구원자와 같은 얼굴의 전학생. 정체를 확인하라.',
    chapterId: 'ep1',
  },
];

export function getMission(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}
