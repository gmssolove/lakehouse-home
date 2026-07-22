export type {
  VNAnyScene,
  VNAssetResolvers,
  VNChoice,
  VNLine,
  VNScene,
  ExplorationScene,
  Hotspot,
  VNSpriteSlot,
} from './types';
export { isDialogueScene, isExplorationScene } from './types';
export { BackgroundLayer } from './BackgroundLayer';
export { CharacterSprite, SpriteLayer } from './CharacterSprite';
export { DialogueBox } from './DialogueBox';
export type { DialogueBoxChoice } from './DialogueBox';
export { VnLocationLabel } from './VnLocationLabel';
export { VnLocationBanner } from './VnLocationBanner';
export { ExplorationView } from './ExplorationView';
export { MainMenu, closeVnToArchiveOrMenu, exitVnApp } from './MainMenu';
export { VNEngine } from './VNEngine';
export { useVNEngine } from './useVNEngine';
export type { UseVNEngineOptions, VNEngineState } from './useVNEngine';
export { useVnBgm } from './useVnBgm';
export { useVnSfx } from './useVnSfx';
export { VnSceneClient } from './VnSceneClient';
export { VnSceneMissing } from './VnSceneMissing';
export { VnSystemMenu } from './VnSystemMenu';
export type { VnLogEntry } from './VnSystemMenu';
export { VnChoicePanel } from './VnChoicePanel';
export type { VnChoiceItem } from './VnChoicePanel';
export { VnDiceLayer } from './VnDiceLayer';
export { VnHandoutLayer } from './VnHandoutLayer';
export { VnMissionBanner } from './VnMissionBanner';
export type { VnMissionBannerData } from './VnMissionBanner';
export { VnMissionJournal } from './VnMissionJournal';
export { VnTauriHotkeys } from './VnTauriHotkeys';
export { VnSceneResolver } from './VnSceneResolver';
export { VnPlayShell } from './VnPlayShell';
export { VnInGameMenu } from './VnInGameMenu';
export { VnTutorial } from './VnTutorial';
export { VnEndingScreen } from './VnEndingScreen';
export { VnChapterLoading } from './VnChapterLoading';

/** 씬을 id → 씬 맵으로 묶을 때 사용 */
export function indexScenes(list: import('./types').VNAnyScene[]) {
  return Object.fromEntries(list.map((s) => [s.id, s]));
}
