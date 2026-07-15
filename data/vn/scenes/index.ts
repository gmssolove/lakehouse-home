import type { VNAnyScene } from '@/components/vn/types';
import { indexScenes } from '@/components/vn';
import ep1ColdOpen from './ep1_cold_open';
import ep1Rescue from './ep1_rescue';
import ep1Classroom from './ep1_classroom';
import ep1ClubroomExplore from './ep1_clubroom_explore';
import ep1DeathLoop from './ep1_death_loop';
import ep1Encounter from './ep1_encounter';
import ep1EncounterIvee from './ep1_encounter_ivee';
import testScene from './test_scene';
import testBranchA from './test_scene_branch_a';
import testBranchB from './test_scene_branch_b';
import effectsDemo from './effects_demo';

/**
 * 씬 스크립트는 .ts (satisfies VNScene | ExplorationScene) 로 둔다.
 * 새 씬: data/vn/scenes/*.ts 추가 후 아래 배열에 넣기
 */
export const VN_SCENE_LIST: VNAnyScene[] = [
  ep1ColdOpen,
  ep1Rescue,
  ep1Classroom,
  ep1DeathLoop,
  ep1Encounter,
  ep1EncounterIvee,
  ep1ClubroomExplore,
  testScene,
  testBranchA,
  testBranchB,
  effectsDemo,
];

/** 메인 메뉴「시작하기」진입 씬 */
export const VN_FIRST_SCENE_ID = VN_SCENE_LIST[0]?.id ?? 'ep1_cold_open';

export const VN_SCENES = indexScenes(VN_SCENE_LIST);

export function getVNScene(id: string): VNAnyScene | null {
  return VN_SCENES[id] ?? null;
}
