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
  /** 현재 환경음(루프) 키 — 없으면 null */
  ambient: string | null;
  /** 현재 표시 중인 핸드아웃 키 (없으면 null) */
  handout: string | null;
  sfx: string | null;
  missionsActive: string[];
  missionsCompleted: string[];
  /** 미션 id → 표시 제목 (시나리오에서 지정) */
  missionTitles: Record<string, string>;
  /** 방금 시작/완료된 미션 — 배너용 (수동 clear) */
  missionBanner: {
    id: string;
    title: string;
    status: 'start' | 'complete';
  } | null;
  choices: NonNullable<VNLine['choices']>;
  /** 현재 줄 표시용 풀텍스트 (타자는 DialogueBox에서 처리) */
  text: string;
  backgroundChanged: boolean;
  spritesChanged: boolean;
  atEnd: boolean;
  advance: () => void;
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

/** BGM 과 동일 — undefined 유지, null/"none" 끄기 */
function normalizeHandout(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v == null || v === '' || v === 'none' || v === '__none__') return null;
  return v;
}

function normalizeAmbient(v: string | null | undefined): string | null | undefined {
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

/** 중간 라인부터 시작할 때 이전 배경·스프라이트·BGM·핸드아웃·미션을 누적 반영 */
function hydrateThroughIndex(scene: VNScene, index: number) {
  let background: string | null = null;
  let sprites: VNSpriteSlot[] = [];
  let bgm: string | null = null;
  let ambient: string | null = null;
  let handout: string | null = null;
  let missionsActive: string[] = [];
  let missionsCompleted: string[] = [];
  const lines = scene.lines ?? [];
  for (let i = 0; i <= index && i < lines.length; i++) {
    const l = lines[i];
    if (l.background != null) background = l.background;
    if (l.sprites) sprites = l.sprites;
    const b = normalizeBgm(l.bgm);
    if (b !== undefined) bgm = b;
    const a = normalizeAmbient(l.ambient);
    if (a !== undefined) ambient = a;
    const h = normalizeHandout(l.handout);
    if (h !== undefined) handout = h;
    if (l.missionUpdate) {
      const m = foldMission(missionsActive, missionsCompleted, l.missionUpdate);
      missionsActive = m.missionsActive;
      missionsCompleted = m.missionsCompleted;
    }
  }
  return { background, sprites, bgm, ambient, handout, missionsActive, missionsCompleted };
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
  const [background, setBackground] = useState<string | null>(bootHydrate.background);
  const [sprites, setSprites] = useState<VNSpriteSlot[]>(bootHydrate.sprites);
  const [bgm, setBgm] = useState<string | null>(bootHydrate.bgm);
  const [ambient, setAmbient] = useState<string | null>(bootHydrate.ambient);
  const [handout, setHandout] = useState<string | null>(bootHydrate.handout);
  const [sfx, setSfx] = useState<string | null>(null);
  const [missionsActive, setMissionsActive] = useState<string[]>(bootHydrate.missionsActive);
  const [missionsCompleted, setMissionsCompleted] = useState<string[]>(
    bootHydrate.missionsCompleted,
  );
  const [missionTitles, setMissionTitles] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const l of initialScene.lines ?? []) {
      const mu = l.missionUpdate;
      if (mu?.id && mu.title?.trim()) map[mu.id] = mu.title.trim();
    }
    return map;
  });
  const missionsRef = useRef({
    active: bootHydrate.missionsActive,
    completed: bootHydrate.missionsCompleted,
  });
  missionsRef.current = { active: missionsActive, completed: missionsCompleted };
  const [missionBanner, setMissionBanner] = useState<{
    id: string;
    title: string;
    status: 'start' | 'complete';
  } | null>(null);
  const [backgroundChanged, setBackgroundChanged] = useState(false);
  const [spritesChanged, setSpritesChanged] = useState(false);

  const fadeClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spriteSwapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSpritesRef = useRef<VNSpriteSlot[] | null>(null);
  const prevBgRef = useRef<string | null>(bootHydrate.background);
  const prevSpritesRef = useRef(JSON.stringify(bootHydrate.sprites));
  const prevBgmRef = useRef<string | null>(bootHydrate.bgm);
  const prevAmbientRef = useRef<string | null>(bootHydrate.ambient);
  const prevHandoutRef = useRef<string | null>(bootHydrate.handout);
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
  const atEnd = !choices.length && lineIndex >= lines.length - 1;

  useEffect(() => {
    if (skipSceneReset.current) {
      skipSceneReset.current = false;
      return;
    }
    const idx = startLineId ? findLineIndex(initialScene, startLineId) : 0;
    const h = hydrateThroughIndex(initialScene, idx);
    setScene(initialScene);
    setLineIndex(idx);
    setBackground(h.background);
    setSprites(h.sprites);
    setBgm(h.bgm);
    setAmbient(h.ambient);
    setHandout(h.handout);
    setSfx(null);
    setMissionsActive(h.missionsActive);
    setMissionsCompleted(h.missionsCompleted);
    setMissionTitles(() => {
      const map: Record<string, string> = {};
      for (const l of initialScene.lines ?? []) {
        const m = l.missionUpdate;
        if (m?.id && m.title?.trim()) map[m.id] = m.title.trim();
      }
      return map;
    });
    setMissionBanner(null);
    suppressBannerRef.current = true;
    const bootLine = initialScene.lines?.[idx];
    const mu = bootLine?.missionUpdate;
    missionAppliedRef.current = mu
      ? `${initialScene.id}:${bootLine.id}:${mu.status}:${mu.id}`
      : `${initialScene.id}:${idx}:reset`;
    prevBgRef.current = h.background;
    prevSpritesRef.current = JSON.stringify(h.sprites);
    prevBgmRef.current = h.bgm;
    prevAmbientRef.current = h.ambient;
    prevHandoutRef.current = h.handout;
  }, [initialScene.id, startLineId]);

  useEffect(() => {
    if (!active || !line) return;

    if (fadeClearRef.current) clearTimeout(fadeClearRef.current);

    /* 이전 배경전환 대기분이 있으면 즉시 반영 후 새 줄 처리 */
    if (spriteSwapRef.current) {
      clearTimeout(spriteSwapRef.current);
      spriteSwapRef.current = null;
      if (pendingSpritesRef.current) {
        const pending = pendingSpritesRef.current;
        pendingSpritesRef.current = null;
        prevSpritesRef.current = JSON.stringify(pending);
        setSprites(pending);
      }
    }

    let bgFlag = false;
    let spFlag = false;
    let bgSpriteExit = false;

    if (line.background != null && line.background !== prevBgRef.current) {
      prevBgRef.current = line.background;
      setBackground(line.background);
      bgFlag = true;
    }
    /* sprites 키가 있으면(undefined 포함) 동기화 — hideStandings 는 undefined 로 클리어 */
    if (Object.prototype.hasOwnProperty.call(line, 'sprites')) {
      const nextSprites = line.sprites ?? [];
      const nextKey = JSON.stringify(nextSprites);
      const hadSprites = prevSpritesRef.current !== '[]' && prevSpritesRef.current.length > 2;
      /* 배경만 바뀌어도 전원 퇴장 후 재등장 */
      if (bgFlag && hadSprites && nextSprites.length > 0) {
        bgSpriteExit = true;
        prevSpritesRef.current = '[]';
        setSprites([]);
        spFlag = true;
        pendingSpritesRef.current = nextSprites;
        spriteSwapRef.current = setTimeout(() => {
          spriteSwapRef.current = null;
          const pending = pendingSpritesRef.current ?? nextSprites;
          pendingSpritesRef.current = null;
          prevSpritesRef.current = JSON.stringify(pending);
          setSprites(pending);
          setBackgroundChanged(false);
          setSpritesChanged(false);
        }, 420);
      } else if (nextKey !== prevSpritesRef.current) {
        prevSpritesRef.current = nextKey;
        setSprites(nextSprites);
        spFlag = true;
      }
    }
    const nextBgm = normalizeBgm(line.bgm);
    if (nextBgm !== undefined && nextBgm !== prevBgmRef.current) {
      prevBgmRef.current = nextBgm;
      setBgm(nextBgm);
    }
    const nextAmbient = normalizeAmbient(line.ambient);
    if (nextAmbient !== undefined && nextAmbient !== prevAmbientRef.current) {
      prevAmbientRef.current = nextAmbient;
      setAmbient(nextAmbient);
    }
    const nextHandout = normalizeHandout(line.handout);
    if (nextHandout !== undefined && nextHandout !== prevHandoutRef.current) {
      prevHandoutRef.current = nextHandout;
      setHandout(nextHandout);
    }
    if (line.sfx && !line.missionUpdate && line.effect !== 'diceRoll') setSfx(line.sfx);
    else setSfx(null);

    setBackgroundChanged(bgFlag);
    setSpritesChanged(spFlag);

    if (!bgSpriteExit) {
      fadeClearRef.current = setTimeout(() => {
        setBackgroundChanged(false);
        setSpritesChanged(false);
      }, 700);
    }

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
    if (mu.title?.trim()) {
      setMissionTitles((prev) => ({ ...prev, [mu.id]: mu.title!.trim() }));
    }

    if (!suppressBannerRef.current) {
      const banner = {
        id: mu.id,
        title: (mu.title || '').trim() || mu.id,
        status: (mu.status === 'complete' ? 'complete' : 'start') as 'start' | 'complete',
      };
      /* 대사 도착 직후 살짝 기다렸다가 미션 배너 */
      const t = window.setTimeout(() => {
        setMissionBanner(banner);
      }, 200);
      suppressBannerRef.current = false;
      return () => window.clearTimeout(t);
    }
    suppressBannerRef.current = false;
  }, [active, lineIndex, line, scene.id]);

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
      setBackground(h.background);
      setSprites(h.sprites);
      setBgm(h.bgm);
      setAmbient(h.ambient);
      setHandout(h.handout);
      setSfx(null);
      prevBgRef.current = h.background;
      prevSpritesRef.current = JSON.stringify(h.sprites);
      prevBgmRef.current = h.bgm;
      prevAmbientRef.current = h.ambient;
      prevHandoutRef.current = h.handout;
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
      setBackground(h.background);
      setSprites(h.sprites);
      setBgm(h.bgm);
      setAmbient(h.ambient);
      setHandout(h.handout);
      setSfx(null);
      const activeM = missions?.missionsActive ?? h.missionsActive;
      const doneM = missions?.missionsCompleted ?? h.missionsCompleted;
      setMissionsActive(activeM);
      setMissionsCompleted(doneM);
      setMissionBanner(null);
      const jumpLine = next.lines?.[idx];
      const mu = jumpLine?.missionUpdate;
      missionAppliedRef.current = mu
        ? `${next.id}:${jumpLine.id}:${mu.status}:${mu.id}`
        : `${next.id}:${idx}:jump`;
      prevBgRef.current = h.background;
      prevSpritesRef.current = JSON.stringify(h.sprites);
      prevBgmRef.current = h.bgm;
      prevAmbientRef.current = h.ambient;
      prevHandoutRef.current = h.handout;
      return true;
    },
    [resolveScene],
  );

  const advance = useCallback(() => {
    if (!active) return;
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
  }, [active, choices.length, lineIndex, lines.length, scene.nextSceneId, goScene]);

  const pickChoice = useCallback(
    (nextSceneId: string) => {
      void goScene(nextSceneId);
    },
    [goScene],
  );

  const reset = useCallback(() => {
    setScene(initialScene);
    setLineIndex(0);
    setBackground(null);
    setSprites([]);
    setBgm(null);
    setAmbient(null);
    setHandout(null);
    setSfx(null);
    setMissionsActive([]);
    setMissionsCompleted([]);
    setMissionTitles({});
    setMissionBanner(null);
  }, [initialScene]);

  const clearMissionBanner = useCallback(() => {
    setMissionBanner(null);
  }, []);

  return {
    scene,
    lineIndex,
    line,
    background,
    sprites,
    bgm,
    ambient,
    handout,
    sfx,
    missionsActive,
    missionsCompleted,
    missionTitles,
    missionBanner,
    choices,
    text,
    backgroundChanged,
    spritesChanged,
    atEnd,
    advance,
    pickChoice,
    reset,
    jumpTo,
    clearMissionBanner,
  };
}
