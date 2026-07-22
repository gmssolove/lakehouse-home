'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VnSceneClient } from '@/components/vn/VnSceneClient';
import { VnSceneMissing } from '@/components/vn/VnSceneMissing';
import { VNEngine } from '@/components/vn/VNEngine';
import { VnPlayShell } from '@/components/vn/VnPlayShell';
import { VnEndingScreen } from '@/components/vn/VnEndingScreen';
import { getVNScene, VN_SCENES } from '@/data/vn/scenes';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { useAuth } from '@/lib/hooks/useAuth';
import { normalizeTrpgScenario } from '@/lib/trpg/normalize';
import {
  scenarioVnToEnginePayload,
  VN_NPC_CHARACTER,
  type ScenarioVnAmbient,
  type ScenarioVnBackground,
  type ScenarioVnBgm,
  type ScenarioVnDiceSfx,
  type ScenarioVnHandout,
  type ScenarioVnSpeaker,
} from '@/lib/vn/parseCcfoliaLog';
import { VnSpriteWarmCache } from '@/components/vn/VnSpriteWarmCache';
import { preloadVnImages } from '@/lib/vn/preloadVnImages';
import {
  anchorPoseToSlot,
  ALL_STAND_SLOTS,
  mergeStandPosBySlot,
  resolveStandPoseForSlot,
  standSlotPoseKey,
  type StandSlot,
} from '@/lib/vn/standPosBySlot';
import { normalizeStandPose, type StandPose } from '@/lib/vn/useStandPoseDrag';
import { normalizeHandoutLayoutOrDefault } from '@/lib/vn/handoutLayout';
import type { VNAssetResolvers, VNScene } from '@/components/vn/types';
import type { VNSaveData } from '@/lib/vn/vnSave';

type Props = {
  sceneId: string;
};

/**
 * /vn/[sceneId]
 * 1) 정적 data/vn 씬
 * 2) TRPG 시나리오 vnScene (Firebase)
 */
export function VnSceneResolver({ sceneId }: Props) {
  const { trpg, loaded } = useSiteContent();
  const staticScene = getVNScene(sceneId);

  const trpgPayload = useMemo(() => {
    if (staticScene) return null;
    const raw = trpg.find((s) => String(s.id) === String(sceneId));
    if (!raw) return null;
    const item = normalizeTrpgScenario(raw as Parameters<typeof normalizeTrpgScenario>[0]);
    const edit = item.vnEditable;
    const scene = item.vnScene;
    /* vnEditable 이 수정 원본 — 재생도 여기를 우선 (옛 vnScene.lines 가 덮어쓰지 않게) */
    const lines = edit?.lines?.length ? edit.lines : scene?.lines;
    if (!lines?.length) return null;

  /** 화자 병합 — vnEditable(수정본)을 나중에 올려 standPos 등 최신값 우선 */
  const speakerMap = new Map<string, ScenarioVnSpeaker>();
  for (const list of [scene?.speakers, edit?.speakers]) {
    for (const sp of list ?? []) {
      if (!sp?.key) continue;
      const prev = speakerMap.get(sp.key);
      const standPos = sp.standPos ?? sp.standPose ?? prev?.standPos ?? prev?.standPose;
      const standPosBySlot = sp.standPosBySlot ?? prev?.standPosBySlot;
      speakerMap.set(sp.key, {
        key: sp.key,
        displayName: sp.displayName || prev?.displayName || sp.key,
        color: sp.color || prev?.color,
        position: sp.position || prev?.position || 'center',
        sprite: sp.sprite?.trim() || prev?.sprite,
        treatAsNarration: sp.treatAsNarration ?? prev?.treatAsNarration,
        standPos: standPos ? { ...standPos } : undefined,
        standPosBySlot: standPosBySlot ? { ...standPosBySlot } : undefined,
        standAnimation: sp.standAnimation || prev?.standAnimation,
      });
    }
  }
    const speakers = speakerMap.size
      ? [...speakerMap.values()]
      : edit?.speakers ?? scene?.speakers ?? [];

    const backgroundMap = new Map<string, ScenarioVnBackground>();
    for (const list of [scene?.backgrounds, edit?.backgrounds]) {
      for (const bg of list ?? []) {
        if (!bg?.key) continue;
        const prev = backgroundMap.get(bg.key);
        backgroundMap.set(bg.key, {
          key: bg.key,
          label: bg.label || prev?.label || '',
          image: bg.image?.trim() || prev?.image,
        });
      }
    }
    const backgrounds = backgroundMap.size
      ? [...backgroundMap.values()]
      : edit?.backgrounds ?? scene?.backgrounds ?? [];

    const bgmMerged = new Map<string, ScenarioVnBgm>();
    for (const list of [scene?.bgms, edit?.bgms]) {
      for (const b of list ?? []) {
        if (!b?.key) continue;
        const prev = bgmMerged.get(b.key);
        bgmMerged.set(b.key, {
          key: b.key,
          label: b.label || prev?.label || '',
          audio: b.audio?.trim() || prev?.audio,
        });
      }
    }
    const bgms = bgmMerged.size ? [...bgmMerged.values()] : edit?.bgms ?? scene?.bgms ?? [];

    const ambientMerged = new Map<string, ScenarioVnAmbient>();
    for (const list of [scene?.ambients, edit?.ambients]) {
      for (const a of list ?? []) {
        if (!a?.key) continue;
        const prev = ambientMerged.get(a.key);
        ambientMerged.set(a.key, {
          key: a.key,
          label: a.label || prev?.label || '',
          audio: a.audio?.trim() || prev?.audio,
        });
      }
    }
    const ambients = ambientMerged.size
      ? [...ambientMerged.values()]
      : edit?.ambients ?? scene?.ambients ?? [];

    const handoutMerged = new Map<string, ScenarioVnHandout>();
    for (const list of [scene?.handouts, edit?.handouts]) {
      for (const h of list ?? []) {
        if (!h?.key) continue;
        const prev = handoutMerged.get(h.key);
        handoutMerged.set(h.key, {
          key: h.key,
          label: h.label || prev?.label || '',
          image: h.image?.trim() || prev?.image,
          layout: h.layout ?? prev?.layout,
        });
      }
    }
    const handouts = handoutMerged.size
      ? [...handoutMerged.values()]
      : edit?.handouts ?? scene?.handouts ?? [];

    const diceSfxMerged = new Map<string, ScenarioVnDiceSfx>();
    for (const list of [scene?.diceSfxList, edit?.diceSfxList]) {
      for (const d of list ?? []) {
        if (!d?.key) continue;
        const prev = diceSfxMerged.get(d.key);
        diceSfxMerged.set(d.key, {
          key: d.key,
          label: d.label || prev?.label || '',
          audio: d.audio?.trim() || prev?.audio,
        });
      }
    }
    const diceSfxList = diceSfxMerged.size
      ? [...diceSfxMerged.values()]
      : edit?.diceSfxList ?? scene?.diceSfxList ?? [];

    const maxOnStage = edit?.maxOnStage ?? scene?.maxOnStage ?? 3;
    const menuTheme = edit?.menuTheme ?? scene?.menuTheme;
    const chapterLoading = Boolean(edit?.chapterLoading ?? scene?.chapterLoading);
    const diceRollSfx = edit?.diceRollSfx ?? scene?.diceRollSfx;
    const diceResultSfx = edit?.diceResultSfx ?? scene?.diceResultSfx;
    const diceResultSfxByTone =
      edit?.diceResultSfxByTone ?? scene?.diceResultSfxByTone;

    const payload = scenarioVnToEnginePayload({
      id: scene?.id || item.id,
      title: scene?.title || item.title || '시나리오 VN',
      speakers,
      lines,
      backgrounds,
      bgms,
      ambients,
      handouts,
      diceSfxList,
      diceRollSfx,
      diceResultSfx,
      diceResultSfxByTone,
      maxOnStage,
      menuTheme,
      chapterLoading: chapterLoading || undefined,
    });
    return {
      ...payload,
      tutorialSteps: edit?.tutorialSteps,
      menuTheme,
      chapterLoading,
    };
  }, [staticScene, trpg, sceneId]);

  if (staticScene) {
    return <VnSceneClient scene={staticScene} scenes={VN_SCENES} />;
  }

  if (!loaded) {
    return (
      <div className="vn-ended">
        <p>불러오는 중…</p>
      </div>
    );
  }

  if (!trpgPayload) {
    return <VnSceneMissing sceneId={sceneId} />;
  }

  return (
    <ScenarioVnPlayClient
      scene={trpgPayload.scene}
      spriteMap={trpgPayload.spriteMap}
      backgroundMap={trpgPayload.backgroundMap}
      bgmMap={trpgPayload.bgmMap}
      ambientMap={trpgPayload.ambientMap}
      handoutMap={trpgPayload.handoutMap}
      handoutLayoutMap={trpgPayload.handoutLayoutMap}
      diceSfxMap={trpgPayload.diceSfxMap}
      diceRollSfx={trpgPayload.diceRollSfx}
      diceResultSfx={trpgPayload.diceResultSfx}
      diceResultSfxByTone={trpgPayload.diceResultSfxByTone}
      menuTheme={trpgPayload.menuTheme}
      tutorialSteps={trpgPayload.tutorialSteps}
      chapterLoading={trpgPayload.chapterLoading}
      scenarioId={sceneId}
    />
  );
}

function ScenarioVnPlayClient({
  scene,
  spriteMap,
  backgroundMap,
  bgmMap,
  ambientMap,
  handoutMap,
  handoutLayoutMap,
  diceSfxMap,
  diceRollSfx,
  diceResultSfx,
  diceResultSfxByTone,
  menuTheme,
  tutorialSteps,
  chapterLoading,
  scenarioId,
}: {
  scene: VNScene;
  spriteMap: Record<string, string>;
  backgroundMap: Record<string, string>;
  bgmMap: Record<string, string>;
  ambientMap: Record<string, string>;
  handoutMap: Record<string, string>;
  handoutLayoutMap?: Record<string, import('@/lib/vn/menuTheme').HandoutLayout>;
  diceSfxMap: Record<string, string>;
  diceRollSfx?: string;
  diceResultSfx?: string;
  diceResultSfxByTone?: import('@/lib/vn/parseCcfoliaLog').ScenarioVnDiceResultSfxByTone;
  menuTheme?: import('@/lib/vn/menuTheme').ScenarioVnMenuTheme;
  tutorialSteps?: import('@/components/vn/VnTutorial').VnTutorialStep[];
  chapterLoading?: boolean;
  scenarioId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const { trpg, saveTrpg } = useSiteContent();
  const [startLineId, setStartLineId] = useState<string | undefined>(() => {
    const raw = searchParams.get('line');
    return raw?.trim() || undefined;
  });
  const [active, setActive] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [ended, setEnded] = useState(false);
  const [key, setKey] = useState(0);

  const trpgRef = useRef(trpg);
  trpgRef.current = trpg;
  /** pending: `character::slot` → pose */
  const pendingPosesRef = useRef<Record<string, StandPose>>({});
  const poseSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poseSaveChainRef = useRef(Promise.resolve());
  /** pending 포즈를 화면에 즉시 반영하기 위한 버전 */
  const [poseTick, setPoseTick] = useState(0);
  const pendingHandoutPosesRef = useRef<
    Record<string, import('@/lib/vn/menuTheme').HandoutLayout>
  >({});
  const handoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [handoutPoseTick, setHandoutPoseTick] = useState(0);

  /** Firebase 화자 standPosBySlot + 드래그 중 pending — 줄에 구운 좌표보다 우선 */
  const speakerStandPoses = useMemo(() => {
    const map: Record<string, StandPose> = {};
    const raw = trpg.find((s) => String(s.id) === String(scenarioId));
    if (raw) {
      const item = normalizeTrpgScenario(
        raw as Parameters<typeof normalizeTrpgScenario>[0],
      );
      const speakers =
        item.vnEditable?.speakers?.length
          ? item.vnEditable.speakers
          : item.vnScene?.speakers ?? [];
      for (const sp of speakers) {
        if (!sp?.key) continue;
        const by = sp.standPosBySlot;
        if (by) {
          for (const slot of ALL_STAND_SLOTS) {
            const pose = resolveStandPoseForSlot(sp, slot);
            const sk = standSlotPoseKey(sp.key, slot);
            map[sk] = pose;
            if (sp.displayName?.trim()) {
              map[standSlotPoseKey(sp.displayName.trim(), slot)] = pose;
            }
          }
        }
        const legacy = sp.standPos ?? sp.standPose;
        if (legacy) {
          for (const slot of ALL_STAND_SLOTS) {
            const pose = resolveStandPoseForSlot(sp, slot);
            const sk = standSlotPoseKey(sp.key, slot);
            if (!map[sk]) map[sk] = pose;
          }
          const pose = normalizeStandPose(legacy);
          map[sp.key] = pose;
          map[sp.key.trim()] = pose;
          if (sp.displayName?.trim()) map[sp.displayName.trim()] = pose;
        }
      }
    }
    for (const [k, p] of Object.entries(pendingPosesRef.current)) {
      map[k] = p;
      map[k.trim()] = p;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trpg, scenarioId, poseTick]);

  const flushStandPoses = useCallback(() => {
    if (poseSaveTimerRef.current) {
      clearTimeout(poseSaveTimerRef.current);
      poseSaveTimerRef.current = null;
    }
    const patches = { ...pendingPosesRef.current };
    if (!Object.keys(patches).length) return poseSaveChainRef.current;

    poseSaveChainRef.current = poseSaveChainRef.current
      .then(async () => {
        if (!isAdmin) return;

        const patchSpeakers = (list: ScenarioVnSpeaker[] | undefined) =>
          (list ?? []).map((sp) => {
            let bySlot = { ...(sp.standPosBySlot || {}) };
            let changed = false;
            for (const slot of ALL_STAND_SLOTS) {
              const sk = standSlotPoseKey(sp.key, slot);
              const alt = sp.displayName?.trim()
                ? standSlotPoseKey(sp.displayName.trim(), slot)
                : '';
              const p = patches[sk] || (alt ? patches[alt] : undefined);
              if (p) {
                bySlot = mergeStandPosBySlot(bySlot, { [slot]: p });
                changed = true;
              }
            }
            /* 레거시 키(슬롯 없음) → center */
            const legacy =
              patches[sp.key] ||
              patches[sp.key.trim()] ||
              (sp.displayName?.trim() ? patches[sp.displayName.trim()] : undefined);
            if (legacy && !patches[standSlotPoseKey(sp.key, 'center')]) {
              bySlot = mergeStandPosBySlot(bySlot, { center: legacy });
              changed = true;
            }
            if (!changed) return sp;
            return {
              ...sp,
              standPosBySlot: bySlot,
              standPos: bySlot.center ?? sp.standPos,
            };
          });

        const next = trpgRef.current.map((raw) => {
          if (String(raw.id) !== String(scenarioId)) return raw;
          const item = normalizeTrpgScenario(
            raw as Parameters<typeof normalizeTrpgScenario>[0],
          );
          const edit = item.vnEditable;
          const sceneSpeakers = item.vnScene?.speakers;
          if (!edit?.speakers?.length && !sceneSpeakers?.length) return raw;

          const editPatched = patchSpeakers(
            edit?.speakers?.length ? edit.speakers : sceneSpeakers ?? [],
          );
          const scenePatched = patchSpeakers(
            sceneSpeakers?.length ? sceneSpeakers : editPatched,
          );

          return {
            ...item,
            vnEditable: {
              speakers: editPatched,
              lines: edit?.lines ?? item.vnScene?.lines ?? [],
              backgrounds: edit?.backgrounds ?? item.vnScene?.backgrounds,
              bgms: edit?.bgms ?? item.vnScene?.bgms,
              ambients: edit?.ambients ?? item.vnScene?.ambients,
              handouts: edit?.handouts ?? item.vnScene?.handouts,
              diceSfxList: edit?.diceSfxList ?? item.vnScene?.diceSfxList,
              diceRollSfx: edit?.diceRollSfx ?? item.vnScene?.diceRollSfx,
              diceResultSfx: edit?.diceResultSfx ?? item.vnScene?.diceResultSfx,
              diceResultSfxByTone:
                edit?.diceResultSfxByTone ?? item.vnScene?.diceResultSfxByTone,
              maxOnStage: edit?.maxOnStage ?? item.vnScene?.maxOnStage,
              tutorialSteps: edit?.tutorialSteps,
              menuTheme: edit?.menuTheme ?? item.vnScene?.menuTheme,
              chapterLoading: edit?.chapterLoading ?? item.vnScene?.chapterLoading,
            },
            vnScene: item.vnScene
              ? {
                  ...item.vnScene,
                  speakers: scenePatched,
                  menuTheme: edit?.menuTheme ?? item.vnScene?.menuTheme,
                  chapterLoading:
                    edit?.chapterLoading ?? item.vnScene?.chapterLoading,
                }
              : {
                  id: item.id,
                  title: item.title,
                  speakers: editPatched,
                  lines: edit?.lines ?? [],
                  maxOnStage: edit?.maxOnStage ?? 3,
                  menuTheme: edit?.menuTheme,
                  chapterLoading: edit?.chapterLoading,
                },
          };
        });

        await saveTrpg(next);

        for (const [k, saved] of Object.entries(patches)) {
          const cur = pendingPosesRef.current[k];
          if (
            cur &&
            cur.x === saved.x &&
            cur.y === saved.y &&
            cur.scale === saved.scale
          ) {
            delete pendingPosesRef.current[k];
          }
        }
        setPoseTick((t) => t + 1);
      })
      .catch((err) => {
        console.warn('[vn] standPos 저장 실패', err);
      });

    return poseSaveChainRef.current;
  }, [isAdmin, scenarioId, saveTrpg]);

  const handoutLayouts = useMemo(() => {
    const map: Record<string, import('@/lib/vn/menuTheme').HandoutLayout> = {
      ...(handoutLayoutMap || {}),
    };
    const raw = trpg.find((s) => String(s.id) === String(scenarioId));
    if (raw) {
      const item = normalizeTrpgScenario(
        raw as Parameters<typeof normalizeTrpgScenario>[0],
      );
      const list =
        item.vnEditable?.handouts?.length
          ? item.vnEditable.handouts
          : item.vnScene?.handouts ?? [];
      for (const h of list) {
        if (!h?.key || !h.layout) continue;
        map[h.key] = normalizeHandoutLayoutOrDefault(h.layout);
      }
    }
    for (const [k, p] of Object.entries(pendingHandoutPosesRef.current)) {
      map[k] = p;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trpg, scenarioId, handoutLayoutMap, handoutPoseTick]);

  const flushHandoutPoses = useCallback(() => {
    if (handoutSaveTimerRef.current) {
      clearTimeout(handoutSaveTimerRef.current);
      handoutSaveTimerRef.current = null;
    }
    const patches = { ...pendingHandoutPosesRef.current };
    if (!Object.keys(patches).length) return poseSaveChainRef.current;

    poseSaveChainRef.current = poseSaveChainRef.current
      .then(async () => {
        if (!isAdmin) return;

        /** edit·scene 핸드아웃을 키로 합친 뒤 layout만 패치 — image 유실 방지 */
        const mergeHandoutLists = (
          a: ScenarioVnHandout[] | undefined,
          b: ScenarioVnHandout[] | undefined,
        ): ScenarioVnHandout[] => {
          const map = new Map<string, ScenarioVnHandout>();
          for (const list of [a, b]) {
            for (const h of list ?? []) {
              if (!h?.key) continue;
              const prev = map.get(h.key);
              map.set(h.key, {
                key: h.key,
                label: h.label || prev?.label || '',
                image: h.image?.trim() || prev?.image,
                layout: h.layout ?? prev?.layout,
              });
            }
          }
          return [...map.values()];
        };

        const applyPatches = (list: ScenarioVnHandout[]) =>
          list.map((h) => {
            const p = patches[h.key] || patches[h.key.trim()];
            if (!p) return h;
            return {
              ...h,
              layout: normalizeHandoutLayoutOrDefault({
                ...h.layout,
                ...p,
                radius: p.radius ?? h.layout?.radius,
              }),
            };
          });

        const next = trpgRef.current.map((raw) => {
          if (String(raw.id) !== String(scenarioId)) return raw;
          const item = normalizeTrpgScenario(
            raw as Parameters<typeof normalizeTrpgScenario>[0],
          );
          const edit = item.vnEditable;
          const merged = mergeHandoutLists(item.vnScene?.handouts, edit?.handouts);
          const patched = applyPatches(merged);

          return {
            ...item,
            vnEditable: {
              speakers: edit?.speakers ?? item.vnScene?.speakers ?? [],
              lines: edit?.lines ?? item.vnScene?.lines ?? [],
              backgrounds: edit?.backgrounds ?? item.vnScene?.backgrounds,
              bgms: edit?.bgms ?? item.vnScene?.bgms,
              ambients: edit?.ambients ?? item.vnScene?.ambients,
              handouts: patched,
              diceSfxList: edit?.diceSfxList ?? item.vnScene?.diceSfxList,
              diceRollSfx: edit?.diceRollSfx ?? item.vnScene?.diceRollSfx,
              diceResultSfx: edit?.diceResultSfx ?? item.vnScene?.diceResultSfx,
              diceResultSfxByTone:
                edit?.diceResultSfxByTone ?? item.vnScene?.diceResultSfxByTone,
              maxOnStage: edit?.maxOnStage ?? item.vnScene?.maxOnStage,
              tutorialSteps: edit?.tutorialSteps,
              menuTheme: edit?.menuTheme ?? item.vnScene?.menuTheme,
              chapterLoading: edit?.chapterLoading ?? item.vnScene?.chapterLoading,
            },
            vnScene: item.vnScene
              ? {
                  ...item.vnScene,
                  handouts: patched,
                  menuTheme: edit?.menuTheme ?? item.vnScene?.menuTheme,
                  chapterLoading:
                    edit?.chapterLoading ?? item.vnScene?.chapterLoading,
                }
              : {
                  id: item.id,
                  title: item.title,
                  speakers: edit?.speakers ?? [],
                  lines: edit?.lines ?? [],
                  handouts: patched,
                  maxOnStage: edit?.maxOnStage ?? 3,
                  menuTheme: edit?.menuTheme,
                  chapterLoading: edit?.chapterLoading,
                },
          };
        });

        await saveTrpg(next);

        for (const [k, saved] of Object.entries(patches)) {
          const cur = pendingHandoutPosesRef.current[k];
          if (
            cur &&
            cur.x === saved.x &&
            cur.y === saved.y &&
            cur.scale === saved.scale &&
            (cur.radius ?? 0) === (saved.radius ?? 0)
          ) {
            delete pendingHandoutPosesRef.current[k];
          }
        }
        setHandoutPoseTick((t) => t + 1);
      })
      .catch((err) => {
        console.warn('[vn] handout layout 저장 실패', err);
      });

    return poseSaveChainRef.current;
  }, [isAdmin, scenarioId, saveTrpg]);

  const flushStandPosesRef = useRef(flushStandPoses);
  flushStandPosesRef.current = flushStandPoses;
  const flushHandoutPosesRef = useRef(flushHandoutPoses);
  flushHandoutPosesRef.current = flushHandoutPoses;

  /* 언마운트 시에만 flush — deps에 flush 넣으면 저장마다 cleanup→재저장 루프 */
  useEffect(() => {
    return () => {
      void flushStandPosesRef.current();
      void flushHandoutPosesRef.current();
    };
  }, []);

  const onStandPoseChange = useCallback(
    (characterKey: string, pose: StandPose, slot: StandSlot = 'center') => {
      if (!isAdmin) return;
      const ck = characterKey.trim();
      const sk = standSlotPoseKey(ck, slot);
      pendingPosesRef.current[sk] = anchorPoseToSlot(pose, slot);
      setPoseTick((t) => t + 1);

      if (poseSaveTimerRef.current) clearTimeout(poseSaveTimerRef.current);
      poseSaveTimerRef.current = setTimeout(() => {
        poseSaveTimerRef.current = null;
        void flushStandPoses();
      }, 450);
    },
    [isAdmin, flushStandPoses],
  );

  const onHandoutPoseChange = useCallback(
    (handoutKey: string, pose: import('@/lib/vn/menuTheme').HandoutLayout) => {
      if (!isAdmin) return;
      const k = handoutKey.trim();
      pendingHandoutPosesRef.current[k] = normalizeHandoutLayoutOrDefault(pose);
      /* 플레이 중 위치조정은 종료/언마운트 때 flush — 클릭마다 저장하면 핸드아웃이 깨짐 */
    },
    [isAdmin],
  );

  const goBack = useCallback(() => {
    void Promise.all([flushStandPoses(), flushHandoutPoses()]).finally(() => {
      router.push(`/trpg/${encodeURIComponent(scenarioId)}`);
    });
  }, [flushStandPoses, flushHandoutPoses, router, scenarioId]);

  const beginClose = useCallback(() => {
    void flushStandPoses();
    void flushHandoutPoses();
    setLeaving(true);
    /* vnLeaveToBlack 0.55s 와 맞춤 — 검정으로 덮인 뒤 엔딩 */
    window.setTimeout(() => {
      setActive(false);
      setLeaving(false);
      setEnded(true);
    }, 580);
  }, [flushStandPoses, flushHandoutPoses]);

  const resolvers: VNAssetResolvers = useMemo(
    () => ({
      spriteUrl: (character, expression) => {
        if (character === VN_NPC_CHARACTER) {
          return '/vn/characters/npc_generic.svg';
        }
        const expr = (expression || '').trim();
        if (
          expr &&
          (/^https?:\/\//i.test(expr) || expr.startsWith('data:') || expr.startsWith('blob:'))
        ) {
          return expr;
        }
        const fromMap = spriteMap[character];
        if (fromMap) return fromMap;
        /* 키 대소문자/공백 차이 보정 */
        const hit = Object.entries(spriteMap).find(([k]) => k.trim() === character.trim());
        return hit?.[1];
      },
      backgroundUrl: (bgKey) => {
        if (!bgKey || bgKey === 'black') return undefined;
        if (/^https?:\/\//i.test(bgKey) || bgKey.startsWith('data:') || bgKey.startsWith('blob:')) {
          return bgKey;
        }
        return backgroundMap[bgKey] || `/vn/backgrounds/${bgKey}.png`;
      },
      bgmUrl: (bgmKey) => {
        if (!bgmKey || bgmKey === 'none') return undefined;
        if (
          /^https?:\/\//i.test(bgmKey) ||
          bgmKey.startsWith('data:') ||
          bgmKey.startsWith('blob:')
        ) {
          return bgmKey;
        }
        return bgmMap[bgmKey] || `/vn/bgm/${bgmKey}.mp3`;
      },
      ambientUrl: (ambientKey) => {
        if (!ambientKey || ambientKey === 'none') return undefined;
        if (
          /^https?:\/\//i.test(ambientKey) ||
          ambientKey.startsWith('data:') ||
          ambientKey.startsWith('blob:')
        ) {
          return ambientKey;
        }
        return ambientMap[ambientKey] || `/vn/ambient/${ambientKey}.mp3`;
      },
      handoutUrl: (handoutKey) => {
        if (!handoutKey || handoutKey === 'none') return undefined;
        if (
          /^https?:\/\//i.test(handoutKey) ||
          handoutKey.startsWith('data:') ||
          handoutKey.startsWith('blob:')
        ) {
          return handoutKey;
        }
        return handoutMap[handoutKey];
      },
      sfxUrl: (sfxKey) => {
        if (!sfxKey) return undefined;
        if (
          /^https?:\/\//i.test(sfxKey) ||
          sfxKey.startsWith('data:') ||
          sfxKey.startsWith('blob:') ||
          sfxKey.startsWith('/')
        ) {
          return sfxKey;
        }
        /* 등록된 다이스/업로드 맵만 — 없는 키에 가짜 /vn/sfx/*.mp3 만들지 않음 */
        return diceSfxMap[sfxKey] || undefined;
      },
    }),
    [spriteMap, backgroundMap, bgmMap, ambientMap, handoutMap, diceSfxMap],
  );

  useEffect(() => {
    void preloadVnImages([
      ...Object.values(spriteMap),
      ...Object.values(backgroundMap),
      ...Object.values(handoutMap),
      '/vn/characters/npc_generic.svg',
    ]);
  }, [spriteMap, backgroundMap, handoutMap]);

  const restart = useCallback(() => {
    setStartLineId(undefined);
    setEnded(false);
    setLeaving(false);
    setActive(true);
    setKey((k) => k + 1);
  }, []);

  const loadSaveNavigate = useCallback(
    (data: VNSaveData) => {
      const qs = new URLSearchParams();
      if (data.lineId && data.lineId !== '__explore__') qs.set('line', data.lineId);
      const q = qs.toString();
      router.push(`/vn/${data.sceneId}${q ? `?${q}` : ''}`);
    },
    [router],
  );

  return (
    <div className="vn-stage active" id="detail-screen">
      <VnSpriteWarmCache
        urls={[...Object.values(spriteMap), '/vn/characters/npc_generic.svg']}
      />
      <VnPlayShell
        menuBackgroundUrl={menuTheme?.background || undefined}
        menuBackgroundBlur={menuTheme?.blur}
        tutorialSteps={tutorialSteps}
        onExit={goBack}
        onNewGame={() => {
          setStartLineId(undefined);
          router.replace(`/vn/${scenarioId}`);
        }}
        onContinueSave={(data) => {
          setStartLineId(
            data.lineId && data.lineId !== '__explore__' ? data.lineId : undefined,
          );
          setKey((k) => k + 1);
          loadSaveNavigate(data);
        }}
      >
        {({ returnToMenu }) => (
          <>
            {active || leaving || ended ? (
              <VNEngine
                key={`${key}-${startLineId ?? 'start'}`}
                scene={scene}
                scenes={{ [scene.id]: scene }}
                resolvers={resolvers}
                active={active && !ended}
                leaving={leaving && !ended}
                holdBgm={ended}
                startLineId={startLineId}
                onEnd={beginClose}
                onClose={beginClose}
                onExit={goBack}
                onMainMenu={returnToMenu}
                onLoadSaveNavigate={loadSaveNavigate}
                onStandPoseChange={isAdmin ? onStandPoseChange : undefined}
                onStandPoseFlush={isAdmin ? () => void flushStandPoses() : undefined}
                speakerStandPoses={speakerStandPoses}
                handoutLayouts={handoutLayouts}
                onHandoutPoseChange={isAdmin ? onHandoutPoseChange : undefined}
                onHandoutPoseFlush={isAdmin ? () => void flushHandoutPoses() : undefined}
                diceRollSfxDefault={diceRollSfx}
                diceResultSfxDefault={diceResultSfx}
                diceResultSfxByTone={diceResultSfxByTone}
                chapterLoading={chapterLoading}
              />
            ) : null}
            {ended ? (
              <VnEndingScreen
                onRestart={restart}
                onMainMenu={() => {
                  setEnded(false);
                  setLeaving(false);
                  setActive(true);
                  returnToMenu();
                }}
              />
            ) : null}
          </>
        )}
      </VnPlayShell>
    </div>
  );
}
