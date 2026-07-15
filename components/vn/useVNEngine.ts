'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VNAnyScene, VNLine, VNScene, VNSpriteSlot } from './types';
import { isDialogueScene, isExplorationScene } from './types';

export type UseVNEngineOptions = {
  scene: VNScene;
  scenes?: Record<string, VNAnyScene>;
  loadScene?: (sceneId: string) => Promise<VNAnyScene | null> | VNAnyScene | null;
  onEnd?: () => void;
  /** exploration 등 엔진 밖 씬으로 이동 */
  onNavigateScene?: (sceneId: string) => void;
  active?: boolean;
  /** 이어하기: 해당 라인 id부터 시작 */
  startLineId?: string;
};

export type VNEngineState = {
  scene: VNScene;
  lineIndex: number;
  line: VNLine | null;
  background: string | null;
  sprites: VNSpriteSlot[];
  bgm: string | null;
  sfx: string | null;
  missionsActive: string[];
  missionsCompleted: string[];
  /** 방금 완료된 미션 id — 배너용 (수동 clear) */
  missionBannerId: string | null;
  choices: NonNullable<VNLine['choices']>;
  isTyping: boolean;
  typedLen: number;
  displayText: string;
  backgroundChanged: boolean;
  spritesChanged: boolean;
  atEnd: boolean;
  advance: () => void;
  skipTyping: () => void;
  pickChoice: (nextSceneId: string) => void;
  reset: () => void;
  jumpTo: (
    sceneId: string,
    lineId: string,
    missions?: { missionsActive: string[]; missionsCompleted: string[] },
  ) => Promise<boolean>;
  clearMissionBanner: () => void;
};

function lineText(line: VNLine | null) {
  if (!line) return '...';
  if (line.effect === 'blackout' || line.effect === 'titlecard') return '';
  return (line.text || '').trim() || '...';
}

function findLineIndex(scene: VNScene, lineId: string) {
  const idx = (scene.lines ?? []).findIndex((l) => l.id === lineId);
  return idx >= 0 ? idx : 0;
}

function normalizeBgm(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v == null || v === '' || v === 'none') return null;
  return v;
}

function foldMission(
  active: string[],
  completed: string[],
  update: NonNullable<VNLine['missionUpdate']>,
) {
  let nextActive = active.filter((id) => id !== update.id);
  let nextCompleted = completed.filter((id) => id !== update.id);
  if (update.status === 'start') {
    if (!nextCompleted.includes(update.id)) nextActive = [...nextActive, update.id];
  } else {
    nextCompleted = [...nextCompleted, update.id];
  }
  return { missionsActive: nextActive, missionsCompleted: nextCompleted };
}

/** 중간 라인부터 시작할 때 이전 배경·스프라이트·BGM·미션을 누적 반영 */
function hydrateThroughIndex(scene: VNScene, index: number) {
  let background: string | null = null;
  let sprites: VNSpriteSlot[] = [];
  let bgm: string | null = null;
  let missionsActive: string[] = [];
  let missionsCompleted: string[] = [];
  const lines = scene.lines ?? [];
  for (let i = 0; i <= index && i < lines.length; i++) {
    const l = lines[i];
    if (l.background != null) background = l.background;
    if (l.sprites) sprites = l.sprites;
    const b = normalizeBgm(l.bgm);
    if (b !== undefined) bgm = b;
    if (l.missionUpdate) {
      const m = foldMission(missionsActive, missionsCompleted, l.missionUpdate);
      missionsActive = m.missionsActive;
      missionsCompleted = m.missionsCompleted;
    }
  }
  return { background, sprites, bgm, missionsActive, missionsCompleted };
}

export function useVNEngine({
  scene: initialScene,
  scenes,
  loadScene,
  onEnd,
  onNavigateScene,
  active = true,
  startLineId,
}: UseVNEngineOptions): VNEngineState {
  const bootIndex = startLineId ? findLineIndex(initialScene, startLineId) : 0;
  const bootHydrate = hydrateThroughIndex(initialScene, bootIndex);

  const [scene, setScene] = useState(initialScene);
  const [lineIndex, setLineIndex] = useState(bootIndex);
  const [typedLen, setTypedLen] = useState(0);
  const [background, setBackground] = useState<string | null>(bootHydrate.background);
  const [sprites, setSprites] = useState<VNSpriteSlot[]>(bootHydrate.sprites);
  const [bgm, setBgm] = useState<string | null>(bootHydrate.bgm);
  const [sfx, setSfx] = useState<string | null>(null);
  const [missionsActive, setMissionsActive] = useState<string[]>(bootHydrate.missionsActive);
  const [missionsCompleted, setMissionsCompleted] = useState<string[]>(
    bootHydrate.missionsCompleted,
  );
  const missionsRef = useRef({
    active: bootHydrate.missionsActive,
    completed: bootHydrate.missionsCompleted,
  });
  missionsRef.current = { active: missionsActive, completed: missionsCompleted };
  const [missionBannerId, setMissionBannerId] = useState<string | null>(null);
  const [backgroundChanged, setBackgroundChanged] = useState(false);
  const [spritesChanged, setSpritesChanged] = useState(false);

  const fadeClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBgRef = useRef<string | null>(bootHydrate.background);
  const prevSpritesRef = useRef(JSON.stringify(bootHydrate.sprites));
  const prevBgmRef = useRef<string | null>(bootHydrate.bgm);
  const bootLineForMission = initialScene.lines?.[bootIndex];
  const bootMission = bootLineForMission?.missionUpdate;
  const missionAppliedRef = useRef(
    bootMission
      ? `${initialScene.id}:${bootLineForMission.id}:${bootMission.status}:${bootMission.id}`
      : `${initialScene.id}:${bootIndex}:boot`,
  );
  const suppressBannerRef = useRef(true);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onNavigateRef = useRef(onNavigateScene);
  onNavigateRef.current = onNavigateScene;
  const skipSceneReset = useRef(false);

  const lines = scene.lines ?? [];
  const line = lines[lineIndex] ?? null;
  const text = lineText(line);
  const choices = useMemo(() => line?.choices?.filter((c) => c.text?.trim()) ?? [], [line]);
  const isTyping = typedLen < text.length;
  const displayText = typedLen > 0 ? text.slice(0, typedLen) : '';
  const atEnd = !choices.length && lineIndex >= lines.length - 1 && !isTyping;

  useEffect(() => {
    if (skipSceneReset.current) {
      skipSceneReset.current = false;
      return;
    }
    const idx = startLineId ? findLineIndex(initialScene, startLineId) : 0;
    const h = hydrateThroughIndex(initialScene, idx);
    setScene(initialScene);
    setLineIndex(idx);
    setTypedLen(0);
    setBackground(h.background);
    setSprites(h.sprites);
    setBgm(h.bgm);
    setSfx(null);
    setMissionsActive(h.missionsActive);
    setMissionsCompleted(h.missionsCompleted);
    setMissionBannerId(null);
    suppressBannerRef.current = true;
    const bootLine = initialScene.lines?.[idx];
    const mu = bootLine?.missionUpdate;
    missionAppliedRef.current = mu
      ? `${initialScene.id}:${bootLine.id}:${mu.status}:${mu.id}`
      : `${initialScene.id}:${idx}:reset`;
    prevBgRef.current = h.background;
    prevSpritesRef.current = JSON.stringify(h.sprites);
    prevBgmRef.current = h.bgm;
  }, [initialScene.id, startLineId]);

  useEffect(() => {
    if (!active || !line) return;

    if (fadeClearRef.current) clearTimeout(fadeClearRef.current);

    let bgFlag = false;
    let spFlag = false;

    if (line.background != null && line.background !== prevBgRef.current) {
      prevBgRef.current = line.background;
      setBackground(line.background);
      bgFlag = true;
    }
    if (line.sprites) {
      const nextKey = JSON.stringify(line.sprites);
      if (nextKey !== prevSpritesRef.current) {
        prevSpritesRef.current = nextKey;
        setSprites(line.sprites);
        spFlag = true;
      }
    }
    const nextBgm = normalizeBgm(line.bgm);
    if (nextBgm !== undefined && nextBgm !== prevBgmRef.current) {
      prevBgmRef.current = nextBgm;
      setBgm(nextBgm);
    }
    if (line.sfx) setSfx(line.sfx);
    else setSfx(null);

    setBackgroundChanged(bgFlag);
    setSpritesChanged(spFlag);

    fadeClearRef.current = setTimeout(() => {
      setBackgroundChanged(false);
      setSpritesChanged(false);
    }, 700);

    return () => {
      if (fadeClearRef.current) clearTimeout(fadeClearRef.current);
    };
  }, [active, lineIndex, line, scene.id]);

  useEffect(() => {
    if (!active || !line?.missionUpdate) {
      suppressBannerRef.current = false;
      return;
    }
    const mu = line.missionUpdate;
    const mKey = `${scene.id}:${line.id}:${mu.status}:${mu.id}`;
    if (missionAppliedRef.current === mKey) {
      suppressBannerRef.current = false;
      return;
    }
    missionAppliedRef.current = mKey;

    const { active: prevA, completed: prevC } = missionsRef.current;
    const folded = foldMission(prevA, prevC, mu);
    setMissionsActive(folded.missionsActive);
    setMissionsCompleted(folded.missionsCompleted);

    if (mu.status === 'complete' && !suppressBannerRef.current) {
      setMissionBannerId(mu.id);
    }
    suppressBannerRef.current = false;
  }, [active, lineIndex, line, scene.id]);

  useEffect(() => {
    if (!active) return;
    setTypedLen(0);
  }, [active, lineIndex, text, scene.id]);

  useEffect(() => {
    if (!active || typedLen >= text.length) return;
    const ms = line?.narrationOnly ? 105 : 58;
    const t = window.setTimeout(() => setTypedLen((n) => n + 1), ms);
    return () => window.clearTimeout(t);
  }, [active, text, typedLen, line?.narrationOnly]);

  const skipTyping = useCallback(() => {
    setTypedLen(text.length);
  }, [text]);

  const resolveScene = useCallback(
    async (sceneId: string): Promise<VNAnyScene | null> => {
      if (scenes?.[sceneId]) return scenes[sceneId];
      if (loadScene) {
        const loaded = await loadScene(sceneId);
        if (loaded) return loaded;
      }
      return null;
    },
    [loadScene, scenes],
  );

  const goScene = useCallback(
    async (sceneId: string) => {
      const next = await resolveScene(sceneId);
      if (!next) {
        onEndRef.current?.();
        return;
      }
      if (isExplorationScene(next)) {
        onNavigateRef.current?.(sceneId);
        return;
      }
      if (!isDialogueScene(next)) {
        onEndRef.current?.();
        return;
      }
      const h = hydrateThroughIndex(next, 0);
      skipSceneReset.current = true;
      setScene(next);
      setLineIndex(0);
      setTypedLen(0);
      setBackground(h.background);
      setSprites(h.sprites);
      setBgm(h.bgm);
      setSfx(null);
      prevBgRef.current = h.background;
      prevSpritesRef.current = JSON.stringify(h.sprites);
      prevBgmRef.current = h.bgm;
    },
    [resolveScene],
  );

  const jumpTo = useCallback(
    async (
      sceneId: string,
      lineId: string,
      missions?: { missionsActive: string[]; missionsCompleted: string[] },
    ) => {
      const next = await resolveScene(sceneId);
      if (!next || isExplorationScene(next) || !isDialogueScene(next)) return false;
      const idx = findLineIndex(next, lineId);
      const h = hydrateThroughIndex(next, idx);
      skipSceneReset.current = true;
      suppressBannerRef.current = true;
      setScene(next);
      setLineIndex(idx);
      setTypedLen(0);
      setBackground(h.background);
      setSprites(h.sprites);
      setBgm(h.bgm);
      setSfx(null);
      const activeM = missions?.missionsActive ?? h.missionsActive;
      const doneM = missions?.missionsCompleted ?? h.missionsCompleted;
      setMissionsActive(activeM);
      setMissionsCompleted(doneM);
      setMissionBannerId(null);
      const jumpLine = next.lines?.[idx];
      const mu = jumpLine?.missionUpdate;
      missionAppliedRef.current = mu
        ? `${next.id}:${jumpLine.id}:${mu.status}:${mu.id}`
        : `${next.id}:${idx}:jump`;
      prevBgRef.current = h.background;
      prevSpritesRef.current = JSON.stringify(h.sprites);
      prevBgmRef.current = h.bgm;
      return true;
    },
    [resolveScene],
  );

  const advance = useCallback(() => {
    if (!active) return;
    if (isTyping) {
      skipTyping();
      return;
    }
    if (choices.length) return;
    if (lineIndex >= lines.length - 1) {
      if (scene.nextSceneId) {
        void goScene(scene.nextSceneId);
        return;
      }
      onEndRef.current?.();
      return;
    }
    setLineIndex((i) => i + 1);
  }, [
    active,
    choices.length,
    isTyping,
    lineIndex,
    lines.length,
    skipTyping,
    scene.nextSceneId,
    goScene,
  ]);

  const pickChoice = useCallback(
    (nextSceneId: string) => {
      void goScene(nextSceneId);
    },
    [goScene],
  );

  const reset = useCallback(() => {
    setScene(initialScene);
    setLineIndex(0);
    setTypedLen(0);
    setBackground(null);
    setSprites([]);
    setBgm(null);
    setSfx(null);
    setMissionsActive([]);
    setMissionsCompleted([]);
    setMissionBannerId(null);
  }, [initialScene]);

  const clearMissionBanner = useCallback(() => {
    setMissionBannerId(null);
  }, []);

  return {
    scene,
    lineIndex,
    line,
    background,
    sprites,
    bgm,
    sfx,
    missionsActive,
    missionsCompleted,
    missionBannerId,
    choices,
    isTyping,
    typedLen,
    displayText,
    backgroundChanged,
    spritesChanged,
    atEnd,
    advance,
    skipTyping,
    pickChoice,
    reset,
    jumpTo,
    clearMissionBanner,
  };
}
