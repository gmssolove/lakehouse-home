import type { TrpgPlayerInfoField } from '@/lib/types/site-content';

export const DEFAULT_PLAYER_INFO_FIELDS: TrpgPlayerInfoField[] = [
  { key: '나이', value: '' },
  { key: '성별', value: '' },
  { key: '직업', value: '' },
  { key: '키', value: '' },
  { key: '몸무게', value: '' },
];

export function mergePlayerInfoFields(fields?: TrpgPlayerInfoField[]): TrpgPlayerInfoField[] {
  const list = [...(fields ?? [])];
  for (const def of DEFAULT_PLAYER_INFO_FIELDS) {
    if (!list.some((f) => f.key === def.key)) list.push({ ...def });
  }
  return list;
}
