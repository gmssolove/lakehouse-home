'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackgroundLayer } from './BackgroundLayer';
import { SpriteLayer } from './CharacterSprite';
import { DialogueBox } from './DialogueBox';
import { VnChoicePanel } from './VnChoicePanel';
import { VnDiceLayer } from './VnDiceLayer';
import { VnFxLayer } from './VnFxLayer';
import { VnChapterLoading } from './VnChapterLoading';
import { VnHandoutLayer } from './VnHandoutLayer';
import { VnLocationBanner } from './VnLocationBanner';
import { VnMissionBanner } from './VnMissionBanner';
import { VnMissionJournal } from './VnMissionJournal';
import { VnSystemMenu, type VnLogEntry } from './VnSystemMenu';
import { VnSpriteWarmCache } from './VnSpriteWarmCache';
import { useVNEngine } from './useVNEngine';
import { useVnBgm } from './useVnBgm';
import { useVnAmbient } from './useVnAmbient';
import { useVnSfx } from './useVnSfx';
import { playLineVoice, stopLineVoice } from '@/lib/vn/playLineVoice';
import { useVnAutoPlay } from '@/lib/vn/useVnAutoPlay';
import {
  skipVnTyping,
  useVnTypingDriver,
  useVnTypingFlag,
} from '@/lib/vn/vnTypingStore';
import { useAuth } from '@/lib/hooks/useAuth';
import { spriteSlotToStandPose, type StandPose } from '@/lib/vn/useStandPoseDrag';
import {
  anchorPoseToSlot,
  isCrowdSlot,
  standSlotPoseKey,
  parseStandSlotPoseKey,
  type StandSlot,
} from '@/lib/vn/standPosBySlot';
import { separateStandX } from '@/lib/vn/separateStandX';
import { VN_STAND_LAYOUT } from '@/lib/vn/standLayout';
import { pickDiceCutinKey, VN_NPC_CHARACTER } from '@/lib/vn/parseCcfoliaLog';
import { collectSceneSpriteUrls, preloadVnImages } from '@/lib/vn/preloadVnImages';
import { isDialogueFx, normalizeMotion } from '@/lib/vn/motions';
import type { VNAnyScene, VNAssetResolvers, VNScene } from './types';
import { isExplorationScene } from './types';
import type { VNSaveData } from '@/lib/vn/vnSave';
import styles from './vn-engine.module.css';

type Props = {
  scene: VNScene;
  scenes?: Record<string, VNAnyScene>;
  loadScene?: (sceneId: string) => Promise<VNAnyScene | null> | VNAnyScene | null;
  resolvers?: VNAssetResolvers;
  active?: boolean;
  leaving?: boolean;
  onEnd?: () => void;
  onClose?: () => void;
  /** 시스템 메뉴「메인으로」 */
  onMainMenu?: () => void;
  /** 시스템 메뉴「나가기」— 시나리오 복귀 등 */
  onExit?: () => void;
  /**
   * 엔딩 화면 중에도 엔진을 마운트해 두고 BGM만 유지할 때.
   * UI는 그리지 않고 오디오 훅만 살아 있게 함.
   */
  holdBgm?: boolean;
  /** exploration 등 외부 라우팅 */
  onNavigateScene?: (sceneId: string) => void;
  onLoadSaveNavigate?: (data: VNSaveData) => void;
  className?: string;
  startLineId?: string;
  /** 시나리오별 세이브 묶음. 없으면 scene.id */
  saveScopeId?: string;
  /** 관리자: 재생 중 스탠딩 위치 저장 (현재 좌석 슬롯 버전) */
  onStandPoseChange?: (
    characterKey: string,
    pose: StandPose,
    slot: StandSlot,
  ) => void;
  /** 위치 조정 종료 시 pending 포즈 즉시 저장 */
  onStandPoseFlush?: () => void;
  /**
   * 화자×슬롯 최신 포즈. 키는 `character` 또는 `character::left|center|right|crowd0~4`.
   * 대사 줄에 구워진 x/y/scale 보다 우선.
   */
  speakerStandPoses?: Record<string, StandPose>;
  /** 핸드아웃 키 → 위치·크기·모서리 */
  handoutLayouts?: Record<string, import('@/lib/vn/menuTheme').HandoutLayout>;
  /** 관리자: 재생 중 핸드아웃 위치·크기 저장 */
  onHandoutPoseChange?: (
    handoutKey: string,
    pose: import('@/lib/vn/menuTheme').HandoutLayout,
  ) => void;
  onHandoutPoseFlush?: () => void;
  /** 씬 기본 다이스 굴림/결과 효과음 키 */
  diceRollSfxDefault?: string;
  diceResultSfxDefault?: string;
  diceResultSfxByTone?: import('@/lib/vn/parseCcfoliaLog').ScenarioVnDiceResultSfxByTone;
  /** 씬 기본 다이스 컷인 GIF 키 (종류별 미지정 폴백) */
  diceRollCutinDefault?: string;
  diceCutinByTone?: import('@/lib/vn/parseCcfoliaLog').ScenarioVnDiceCutinByTone;
  diceCutinMap?: Record<string, string>;
  diceCutinList?: import('@/lib/vn/parseCcfoliaLog').ScenarioVnDiceCutin[];
  /**
   * @deprecated 줄별 chapterLoadingBefore/After 사용.
   * true면 줄별 미지정 챕터에 before 로딩 적용 (구 데이터 호환).
   */
  chapterLoading?: boolean;
};

const defaultResolvers: Required<
  Pick<VNAssetResolvers, 'backgroundUrl' | 'spriteUrl' | 'bgmUrl' | 'ambientUrl' | 'sfxUrl' | 'handoutUrl'>
> = {
  backgroundUrl: (key) => `/vn/backgrounds/${key}.png`,
  spriteUrl: (character, expression) => `/vn/characters/${character}_${expression}.png`,
  bgmUrl: (key) => `/vn/bgm/${key}.mp3`,
  ambientUrl: (key) => `/vn/ambient/${key}.mp3`,
  sfxUrl: (key) => `/vn/sfx/${key}.mp3`,
  handoutUrl: (key) => `/vn/handouts/${key}.png`,
};

function mergeResolvers(resolvers?: VNAssetResolvers): VNAssetResolvers {
  return {
    backgroundUrl: resolvers?.backgroundUrl ?? defaultResolvers.backgroundUrl,
    spriteUrl: resolvers?.spriteUrl ?? defaultResolvers.spriteUrl,
    bgmUrl: resolvers?.bgmUrl ?? defaultResolvers.bgmUrl,
    ambientUrl: resolvers?.ambientUrl ?? defaultResolvers.ambientUrl,
    sfxUrl: resolvers?.sfxUrl ?? defaultResolvers.sfxUrl,
    handoutUrl: resolvers?.handoutUrl ?? defaultResolvers.handoutUrl,
  };
}

export function VNEngine({
  scene,
  scenes,
  loadScene,
  resolvers: resolversProp,
  active = true,
  leaving = false,
  holdBgm = false,
  onEnd,
  onClose,
  onMainMenu,
  onExit,
  onNavigateScene,
  onLoadSaveNavigate,
  className = '',
  startLineId,
  saveScopeId,
  onStandPoseChange,
  onStandPoseFlush,
  speakerStandPoses,
  handoutLayouts: handoutLayoutsProp,
  onHandoutPoseChange,
  onHandoutPoseFlush,
  diceRollSfxDefault,
  diceResultSfxDefault,
  diceResultSfxByTone,
  diceRollCutinDefault,
  diceCutinByTone,
  diceCutinMap,
  diceCutinList,
  chapterLoading: chapterLoadingEnabled = false,
}: Props) {
  const { isAdmin } = useAuth();
  const saveScope = saveScopeId?.trim() || scene.id;
  const standPoseEditable = Boolean(isAdmin && (onStandPoseChange || onHandoutPoseChange));
  const resolvers = useMemo(() => mergeResolvers(resolversProp), [resolversProp]);
  const eng = useVNEngine({
    scene,
    scenes,
    loadScene,
    onEnd,
    onNavigateScene,
    active: active && !leaving,
    startLineId,
  });

  const bgUrl =
    eng.background && eng.background !== 'black'
      ? resolvers.backgroundUrl?.(eng.background) ?? eng.background
      : undefined;

  const resolveSprite = useCallback(
    (character: string, expression: string) =>
      resolvers.spriteUrl?.(character, expression) ?? undefined,
    [resolvers],
  );

  /* 현재 줄 전후 스탠딩만 DOM 웜캐시 — 전체 씬은 Image() 선행 로드 */
  const warmSpriteUrls = useMemo(() => {
    const lines = eng.scene.lines ?? [];
    const from = Math.max(0, eng.lineIndex - 3);
    const slice = lines.slice(from, eng.lineIndex + 35);
    return collectSceneSpriteUrls(slice, resolveSprite);
  }, [eng.scene.lines, eng.lineIndex, resolveSprite]);

  useEffect(() => {
    if (!active) return;
    void preloadVnImages(collectSceneSpriteUrls(eng.scene.lines ?? [], resolveSprite));
  }, [active, eng.scene.id, eng.scene.lines, resolveSprite]);

  /* 현재 줄 기준 앞으로 20줄 스탠딩을 우선 로드 */
  useEffect(() => {
    if (!active) return;
    const lines = eng.scene.lines ?? [];
    const from = Math.max(0, eng.lineIndex);
    const slice = lines.slice(from, from + 20);
    void preloadVnImages(collectSceneSpriteUrls(slice, resolveSprite));
  }, [active, eng.lineIndex, eng.scene.lines, resolveSprite]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const list = eng.sprites ?? [];
    // eslint-disable-next-line no-console
    console.debug(
      '[VN sprites]',
      list.map((s) => ({
        character: s.character,
        position: s.position,
        x: s.x,
        y: s.y,
        scale: s.scale,
        anim: s.anim,
        expression: String(s.expression || '').slice(0, 48),
        resolvedUrl: resolveSprite(s.character, s.expression)?.slice(0, 72),
      })),
    );
  }, [eng.line?.id, eng.sprites, resolveSprite]);

  const resolveBgm = useCallback(
    (key: string) => {
      if (!key || key === 'none') return undefined;
      return resolvers.bgmUrl?.(key) ?? undefined;
    },
    [resolvers],
  );

  const resolveAmbient = useCallback(
    (key: string) => {
      if (!key || key === 'none') return undefined;
      return resolvers.ambientUrl?.(key) ?? undefined;
    },
    [resolvers],
  );

  const resolveSfx = useCallback(
    (key: string) => resolvers.sfxUrl?.(key) ?? undefined,
    [resolvers],
  );

  const resolveDiceCutin = useCallback(
    (key: string) => {
      const raw = key.trim();
      if (!raw) return undefined;
      if (
        /^https?:\/\//i.test(raw) ||
        raw.startsWith('data:') ||
        raw.startsWith('blob:') ||
        raw.startsWith('/')
      ) {
        return raw;
      }
      return diceCutinMap?.[raw];
    },
    [diceCutinMap],
  );

  const resolveHandout = useCallback(
    (key: string) => resolvers.handoutUrl?.(key) ?? undefined,
    [resolvers],
  );

  /* 엔딩 중·퇴장 페이드·챕터 로딩 홀드 */
  const [chapterGate, setChapterGate] = useState<
    'off' | 'loading' | 'revealing' | 'ready'
  >('off');
  const [bgmHoldKey, setBgmHoldKey] = useState<string | null | undefined>(undefined);
  const chapterLoadLineRef = useRef<string | null>(null);
  const lastNonTitleBgmRef = useRef<string | null>(null);
  /** before = 챕터카드 앞 / after = 챕터카드 뒤 */
  const [chapterLoadPhase, setChapterLoadPhase] = useState<'before' | 'after' | null>(null);

  const usePerChapterLoading = useMemo(
    () =>
      (eng.scene.lines ?? []).some(
        (l) =>
          l.effect === 'titlecard' &&
          (Boolean(l.chapterLoadingBefore) || Boolean(l.chapterLoadingAfter)),
      ),
    [eng.scene.lines],
  );

  const chapterLoadFlags = useMemo(() => {
    if (eng.line?.effect !== 'titlecard') return { before: false, after: false };
    if (usePerChapterLoading) {
      return {
        before: Boolean(eng.line.chapterLoadingBefore),
        after: Boolean(eng.line.chapterLoadingAfter),
      };
    }
    return { before: Boolean(chapterLoadingEnabled), after: false };
  }, [
    eng.line?.effect,
    eng.line?.chapterLoadingBefore,
    eng.line?.chapterLoadingAfter,
    usePerChapterLoading,
    chapterLoadingEnabled,
  ]);

  const sfxBlocked = chapterGate === 'loading';

  useVnBgm(
    bgmHoldKey !== undefined
      ? bgmHoldKey
      : active || leaving || holdBgm
        ? eng.bgm
        : null,
    resolveBgm,
  );
  useVnAmbient(active && !leaving && !holdBgm ? eng.ambient : null, resolveAmbient);

  const [sysOpen, setSysOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [log, setLog] = useState<VnLogEntry[]>([]);
  const loggedKeyRef = useRef<string>('');
  const stickyLocationRef = useRef('');
  const [displayLocation, setDisplayLocation] = useState(() =>
    eng.line?.hideLocation
      ? ''
      : eng.line?.location?.trim() || eng.scene.location?.trim() || '',
  );
  const [locReady, setLocReady] = useState(
    () => Boolean(eng.line?.hideLocation) || eng.line?.locationAnnounce !== true,
  );
  const [locPlayIntro, setLocPlayIntro] = useState(
    () =>
      !eng.line?.hideLocation &&
      eng.line?.locationAnnounce === true &&
      Boolean((eng.line?.location || eng.scene.location || '').trim()),
  );
  const locWaitedRef = useRef(false);
  const [gatedSfx, setGatedSfx] = useState<string | null>(null);
  const [vignetteOn, setVignetteOn] = useState(false);
  const [visionBlurOn, setVisionBlurOn] = useState(false);
  const [fxLocked, setFxLocked] = useState(false);
  const [displayMission, setDisplayMission] = useState<typeof eng.missionBanner>(null);
  /** 미션 시작/완료 시 수첩 버튼 알림 — 수첩 열면 해제 */
  const [missionFabAlert, setMissionFabAlert] = useState<'start' | 'complete' | null>(null);
  const titleDoneRef = useRef(false);
  const [poseEditMode, setPoseEditMode] = useState(false);
  const [poseOverrides, setPoseOverrides] = useState<Record<string, StandPose>>({});
  const [selectedStand, setSelectedStand] = useState<string | null>(null);
  const [handoutLayoutOverrides, setHandoutLayoutOverrides] = useState<
    Record<string, import('@/lib/vn/menuTheme').HandoutLayout>
  >({});

  const displayHandoutLayouts = useMemo(
    () => ({ ...(handoutLayoutsProp || {}), ...handoutLayoutOverrides }),
    [handoutLayoutsProp, handoutLayoutOverrides],
  );

  const handleHandoutPoseChange = useCallback(
    (key: string, pose: import('@/lib/vn/menuTheme').HandoutLayout) => {
      const k = key.trim();
      setHandoutLayoutOverrides((prev) => ({ ...prev, [k]: pose }));
      onHandoutPoseChange?.(k, pose);
    },
    [onHandoutPoseChange],
  );

  useEffect(() => {
    if (!active || leaving) {
      stopLineVoice();
      return;
    }
    if (!locReady) {
      stopLineVoice();
      return;
    }
    playLineVoice(eng.line?.voice);
    return () => stopLineVoice();
  }, [active, leaving, eng.line?.id, eng.line?.voice, locReady]);

  const effect = eng.line?.effect;
  const narrationOnly = Boolean(eng.line?.narrationOnly);
  const hideDialogue =
    narrationOnly ||
    effect === 'blackout' ||
    effect === 'titlecard' ||
    chapterGate === 'loading' ||
    chapterGate === 'revealing' ||
    !locReady;
  const isNarration = !eng.line?.speaker?.trim();
  const ghastly = effect === 'ghastly-dim';
  const shake =
    effect === 'shake' || effect === 'shake-advanced';

  const displayEffect =
    effect !== 'titlecard'
      ? effect
      : chapterGate === 'loading' || chapterLoadPhase === 'after'
        ? null
        : !chapterLoadFlags.before ||
            chapterGate === 'ready' ||
            chapterGate === 'revealing'
          ? 'titlecard'
          : null;

  useEffect(() => {
    if (effect !== 'titlecard' && chapterGate !== 'loading' && chapterGate !== 'revealing') {
      lastNonTitleBgmRef.current = eng.bgm;
    }
  }, [eng.bgm, effect, chapterGate]);

  useLayoutEffect(() => {
    if (!active || leaving) return;
    const lineId = eng.line?.id ?? null;

    if (effect !== 'titlecard') {
      chapterLoadLineRef.current = null;
      setChapterGate('off');
      setChapterLoadPhase(null);
      setBgmHoldKey(undefined);
      return;
    }

    if (chapterLoadLineRef.current === lineId) return;
    chapterLoadLineRef.current = lineId;

    if (!chapterLoadFlags.before) {
      setChapterLoadPhase(null);
      setChapterGate('ready');
      setBgmHoldKey(undefined);
      return;
    }

    setChapterLoadPhase('before');
    setBgmHoldKey(lastNonTitleBgmRef.current);
    setChapterGate('loading');
  }, [active, leaving, eng.line?.id, effect, chapterLoadFlags.before]);

  const onChapterReveal = useCallback(() => {
    if (chapterLoadPhase === 'after') return;
    setBgmHoldKey(undefined);
    setChapterGate('revealing');
  }, [chapterLoadPhase]);

  const { advance, choices, jumpTo, pickChoice, clearMissionBanner } = eng;

  const onChapterLoadDone = useCallback(() => {
    if (chapterLoadPhase === 'after') {
      /* phase/gate 는 다음 줄·엔딩 layout에서 리셋 — 같은 줄에서 챕터카드가 다시 뜨지 않게 */
      setBgmHoldKey(undefined);
      advance();
      return;
    }
    setChapterGate((g) => (g === 'revealing' || g === 'loading' ? 'ready' : g));
  }, [chapterLoadPhase, advance]);

  const isTyping = useVnTypingFlag();
  const isTypingRef = useRef(false);
  isTypingRef.current = isTyping;
  const handleClose = onClose ?? (() => undefined);
  const goMain = onMainMenu ?? handleClose;

  /**
   * 장소 배너와 locReady를 같은 커밋에서 맞춤 — 미션 SFX가 장소보다 먼저 나가지 않게.
   * 장소가 바뀐 줄만 배너 연출 동안 대사 대기.
   */
  const locGatePrevRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const lineLoc = eng.line?.location?.trim() || '';
    const sceneLoc = eng.scene.location?.trim() || '';
    if (lineLoc) stickyLocationRef.current = lineLoc;
    else if (!stickyLocationRef.current && sceneLoc) {
      stickyLocationRef.current = sceneLoc;
    }

    if (eng.line?.hideLocation) {
      setDisplayLocation('');
      locGatePrevRef.current = null;
      setLocPlayIntro(false);
      setLocReady(true);
      return;
    }

    const shown = stickyLocationRef.current || sceneLoc;
    setDisplayLocation(shown);

    const loc = shown.trim();
    const prev = locGatePrevRef.current;
    const announce = eng.line?.locationAnnounce === true;
    if (loc && loc !== prev) {
      locGatePrevRef.current = loc;
      if (announce) {
        locWaitedRef.current = true;
        setLocPlayIntro(true);
        setLocReady(false);
      } else {
        setLocPlayIntro(false);
        setLocReady(true);
      }
      return;
    }
    if (!loc) locGatePrevRef.current = null;
    setLocPlayIntro(false);
    setLocReady(true);
  }, [eng.line?.id, eng.line?.location, eng.line?.locationAnnounce, eng.line?.hideLocation, eng.scene.location]);

  useEffect(() => {
    setVignetteOn(eng.line?.vignette === true);
  }, [eng.line?.id, eng.line?.vignette]);

  useEffect(() => {
    setVisionBlurOn(eng.line?.visionBlur === true);
  }, [eng.line?.id, eng.line?.visionBlur]);

  /** 장소 연출이 끝난 뒤에만 미션 배너 표시 */
  useEffect(() => {
    if (!eng.missionBanner) {
      setDisplayMission(null);
      return;
    }
    if (!locReady) return;
    const t = window.setTimeout(() => setDisplayMission(eng.missionBanner), 280);
    return () => clearTimeout(t);
  }, [eng.missionBanner, locReady]);

  /** 미션 SFX도 장소 배너 끝난 뒤(배너와 같은 280ms)에 재생 */
  useEffect(() => {
    if (!locReady) {
      setGatedSfx(null);
      return;
    }
    const delay = locWaitedRef.current ? 280 : 0;
    locWaitedRef.current = false;
    const canPlay = active && !leaving && !holdBgm && !sfxBlocked && Boolean(eng.sfx);
    if (!canPlay) {
      setGatedSfx(null);
      return;
    }
    const t = window.setTimeout(() => setGatedSfx(eng.sfx), delay);
    return () => clearTimeout(t);
  }, [active, leaving, holdBgm, sfxBlocked, locReady, eng.sfx, eng.line?.id]);

  useVnSfx(gatedSfx, resolveSfx);

  useEffect(() => {
    if (!displayMission) return;
    setMissionFabAlert(displayMission.status);
  }, [displayMission]);

  const openJournal = useCallback(() => {
    setMissionFabAlert(null);
    setJournalOpen((o) => !o);
  }, []);


  const applyLoadSave = useCallback(
    (data: VNSaveData) => {
      const target = scenes?.[data.sceneId];
      if (target && isExplorationScene(target)) {
        onLoadSaveNavigate?.(data);
        return;
      }
      if (data.sceneId !== eng.scene.id && onLoadSaveNavigate) {
        onLoadSaveNavigate(data);
        return;
      }
      void jumpTo(data.sceneId, data.lineId, {
        missionsActive: data.missionsActive ?? [],
        missionsCompleted: data.missionsCompleted ?? [],
      });
    },
    [scenes, onLoadSaveNavigate, eng.scene.id, jumpTo],
  );

  useEffect(() => {
    titleDoneRef.current = false;
    if (
      chapterGate === 'loading' ||
      chapterGate === 'revealing' ||
      effect === 'titlecard'
    ) {
      setFxLocked(true);
    } else setFxLocked(false);
  }, [eng.line?.id, effect, chapterGate]);

  useEffect(() => {
    if (!active || leaving) return;
    if (
      effect === 'blackout' ||
      effect === 'titlecard' ||
      chapterGate === 'loading' ||
      chapterGate === 'revealing'
    ) {
      skipVnTyping();
    }
  }, [active, leaving, eng.line?.id, effect, chapterGate]);

  /* 지난 대사 로그 — 라인 전환 시 직전 풀텍스트 기록 */
  useEffect(() => {
    if (!active || leaving) return;
    const line = eng.line;
    if (!line) return;
    const raw = (line.text || '').trim();
    if (!raw) return;
    const key = `${eng.scene.id}:${line.id}`;
    if (loggedKeyRef.current === key) return;
    /* 타이핑 완료 후에만 로그 (선택지·전환 전 완성본) */
    if (isTyping) return;
    loggedKeyRef.current = key;
    setLog((prev) => [
      ...prev,
      {
        speaker: line.speaker?.trim() || undefined,
        text: raw,
      },
    ]);
  }, [active, leaving, eng.scene.id, eng.line, isTyping, eng.lineIndex]);

  const showChoices = choices.length > 0 && !isTyping && !leaving;

  const displaySprites = useMemo(() => {
    const list = eng.sprites ?? [];
    const placed = list.map((s) => {
      /* 이미지 없는 화자 — 오른쪽 고정, 포즈 오버라이드 무시 */
      if (s.character === VN_NPC_CHARACTER) {
        const x = VN_STAND_LAYOUT.slotBaseX.right;
        return {
          ...s,
          position: 'right' as const,
          standSlot: 'right' as const,
          x,
          offsetX: x,
          y: undefined,
          offsetY: undefined,
          scale: undefined,
        };
      }
      /* 4명+ 군중 — crowd0~4 버전만 적용 (왼·중·오 덮지 않음) */
      if (s.crowdLayout) {
        const ck = s.character;
        const slot = (s.standSlot && isCrowdSlot(s.standSlot) ? s.standSlot : null) as StandSlot | null;
        if (!slot) return s;
        const sk = standSlotPoseKey(ck, slot);
        const o =
          poseOverrides[sk] ??
          poseOverrides[ck] ??
          speakerStandPoses?.[sk] ??
          speakerStandPoses?.[ck];
        if (!o) return s;
        const anchored = anchorPoseToSlot(o, slot);
        return {
          ...s,
          standSlot: slot,
          x: anchored.x,
          y: anchored.y,
          scale: anchored.scale,
          offsetX: anchored.x,
          offsetY: anchored.y,
          position: 'center' as const,
        };
      }
      const ck = s.character;
      const slot = (s.standSlot || 'center') as StandSlot;
      if (isCrowdSlot(slot)) return s;
      const sk = standSlotPoseKey(ck, slot);
      const o =
        poseOverrides[sk] ??
        poseOverrides[ck] ??
        poseOverrides[ck.trim()] ??
        speakerStandPoses?.[sk] ??
        speakerStandPoses?.[ck] ??
        speakerStandPoses?.[ck.trim()];
      if (!o) return s;
      const anchored = anchorPoseToSlot(o, slot);
      return {
        ...s,
        standSlot: slot,
        x: anchored.x,
        y: anchored.y,
        scale: anchored.scale,
        offsetX: anchored.x,
        offsetY: anchored.y,
        position: 'center' as const,
      };
    });
    /* 위치 조정 중 · 좌석(standSlot) 있으면 X 고정 — 말할 때마다 separateStandX로 밀지 않음 */
    if (poseEditMode) return placed;
    const anySlotted = placed.some(
      (s) => s.standSlot === 'left' || s.standSlot === 'center' || s.standSlot === 'right',
    );
    if (anySlotted) return placed;
    return separateStandX(placed);
  }, [eng.sprites, poseOverrides, speakerStandPoses, poseEditMode]);

  /* 위치 조정 진입 시 현재 화면 포즈를 로컬에 고정 — 스케일·좌표 동기화 */
  useEffect(() => {
    if (!poseEditMode || !standPoseEditable) return;
    setPoseOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of eng.sprites ?? []) {
        if (s.crowdLayout && s.standSlot && isCrowdSlot(s.standSlot)) {
          const sk = standSlotPoseKey(s.character, s.standSlot);
          if (next[sk] || next[s.character]) continue;
          next[sk] = spriteSlotToStandPose(s);
          changed = true;
          continue;
        }
        if (s.crowdLayout) continue;
        const slot = (s.standSlot || 'center') as StandSlot;
        if (isCrowdSlot(slot)) continue;
        const sk = standSlotPoseKey(s.character, slot);
        if (next[sk] || next[s.character]) continue;
        next[sk] = spriteSlotToStandPose(s);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [poseEditMode, standPoseEditable, eng.sprites]);

  useEffect(() => {
    if (!poseEditMode || !standPoseEditable) return;
    const list = displaySprites;
    if (!list.length) {
      setSelectedStand(null);
      return;
    }
    setSelectedStand((prev) => {
      if (prev && list.some((s) => s.character === prev)) return prev;
      const speaking = list.find((s) => !s.dimmed);
      return speaking?.character ?? list[0]?.character ?? null;
    });
  }, [poseEditMode, standPoseEditable, displaySprites, eng.line?.id]);

  useEffect(() => {
    if (!standPoseEditable) setPoseEditMode(false);
  }, [standPoseEditable]);

  const handlePoseChange = useCallback(
    (key: string, pose: StandPose, slot?: StandSlot) => {
      const k = key.trim();
      const spr = (eng.sprites ?? []).find((s) => s.character === k || s.character.trim() === k);
      const standSlot =
        slot ||
        (spr?.standSlot as StandSlot | undefined) ||
        (spr?.crowdLayout ? undefined : 'center');
      if (!standSlot) return;
      /* 군중은 crowd 슬롯에만, 3인은 L/C/R에만 */
      if (spr?.crowdLayout && !isCrowdSlot(standSlot)) return;
      if (!spr?.crowdLayout && isCrowdSlot(standSlot)) return;
      const anchored = anchorPoseToSlot(pose, standSlot);
      const sk = standSlotPoseKey(k, standSlot);
      setPoseOverrides((prev) => ({ ...prev, [sk]: anchored, [k]: anchored }));
      onStandPoseChange?.(k, anchored, standSlot);
    },
    [onStandPoseChange, eng.sprites],
  );

  const togglePoseEdit = useCallback(() => {
    setPoseEditMode((v) => {
      const next = !v;
      if (next) {
        setPoseOverrides((prev) => {
          const seed = { ...prev };
          for (const s of eng.sprites ?? []) {
            const slot = (s.standSlot || 'center') as StandSlot;
            const sk = standSlotPoseKey(s.character, slot);
            if (seed[sk] || seed[s.character]) continue;
            seed[sk] = spriteSlotToStandPose(s);
          }
          return seed;
        });
      }
      return next;
    });
  }, [eng.sprites]);

  const tryAdvance = useCallback(() => {
    if (sysOpen || fxLocked || !locReady || poseEditMode) return;
    if (choices.length && !isTypingRef.current) return;
    if (isTypingRef.current) {
      skipVnTyping();
      return;
    }
    advance();
  }, [sysOpen, fxLocked, locReady, poseEditMode, choices.length, advance]);

  const autoAdvance = useCallback(() => {
    if (sysOpen || fxLocked || !locReady || poseEditMode) return;
    if (effect === 'titlecard') return;
    if (choices.length) return;
    if (isTypingRef.current) return;
    advance();
  }, [sysOpen, fxLocked, locReady, poseEditMode, effect, choices.length, advance]);

  const lineKey = `${eng.scene.id}:${eng.line?.id ?? eng.lineIndex}`;

  const diceResultToneUrls = useMemo(
    () => ({
      extreme: resolveSfx(diceResultSfxByTone?.extreme || ''),
      great: resolveSfx(diceResultSfxByTone?.great || ''),
      hard: resolveSfx(diceResultSfxByTone?.hard || ''),
      ok: resolveSfx(diceResultSfxByTone?.ok || ''),
      fail: resolveSfx(diceResultSfxByTone?.fail || ''),
      fumble: resolveSfx(diceResultSfxByTone?.fumble || ''),
    }),
    [resolveSfx, diceResultSfxByTone],
  );

  useVnTypingDriver(
    active && !leaving,
    lineKey,
    eng.text,
    Boolean(eng.line?.narrationOnly),
  );

  const { autoPlay, toggleAutoPlay } = useVnAutoPlay({
    active:
      active &&
      !leaving &&
      !sysOpen &&
      !fxLocked &&
      !poseEditMode &&
      locReady &&
      effect !== 'titlecard' &&
      chapterGate !== 'loading' &&
      chapterGate !== 'revealing',
    leaving,
    isTyping,
    hasChoices: choices.length > 0,
    lineKey,
    textLength: (eng.line?.text || '').length,
    onAdvance: autoAdvance,
  });

  const onTitlecardComplete = useCallback(() => {
    if (titleDoneRef.current) return;
    titleDoneRef.current = true;
    setFxLocked(false);
    if (chapterLoadFlags.after) {
      setChapterLoadPhase('after');
      setBgmHoldKey(lastNonTitleBgmRef.current);
      setChapterGate('loading');
      return;
    }
    advance();
  }, [advance, chapterLoadFlags.after]);

  const toggleSys = useCallback(() => {
    setSysOpen((o) => !o);
  }, []);

  useEffect(() => {
    if (!active || leaving) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleSys();
        return;
      }
      if (sysOpen) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        tryAdvance();
      }
    }
    function onContext(e: MouseEvent) {
      e.preventDefault();
      toggleSys();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onContext);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
    };
  }, [active, leaving, toggleSys, tryAdvance, sysOpen]);

  const showStageBlur =
    locReady &&
    effect !== 'blackout' &&
    effect !== 'titlecard' &&
    (narrationOnly ||
      Boolean(displayMission) ||
      (Boolean(eng.sprites?.length) && !hideDialogue));

  /* holdBgm: UI는 숨기고 훅(BGM)만 유지 */
  if (!active && !leaving) return null;

  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ''}${leaving ? ` ${styles.leaving}` : ''}${shake ? ` ${styles.effectShakeAdvanced}` : ''}`}
      role="presentation"
      onClick={(e) => {
        if (leaving || sysOpen || poseEditMode) return;
        if (
          (e.target as HTMLElement).closest(
            '.lh-vn-box, .lh-vn-choice, .lh-vn-close, .lh-vn-auto, .lh-vn-savebar, .lh-vn-slot-panel',
          )
        )
          return;
        if (
          (e.target as HTMLElement).closest(
            `[class*="choiceOverlay"], [class*="sysOverlay"], [class*="missionJournal"], [class*="missionFab"], [class*="poseEdit"]`,
          )
        )
          return;
        tryAdvance();
      }}
    >
      <div
        className={`vn-stage ${styles.stage}${showStageBlur ? ` ${styles.stageBgBlur}` : ''}${visionBlurOn ? ` ${styles.stageVisionBlur}` : ''}${ghastly ? ` ${styles.ghastlyDim}` : ''}${eng.background === 'black' ? ` ${styles.stageBlack}` : ''}`}
        aria-hidden
      >
        <BackgroundLayer background={eng.background} url={bgUrl} />
        <VnSpriteWarmCache urls={warmSpriteUrls} />
        <SpriteLayer
          sprites={displaySprites}
          resolveUrl={resolveSprite}
          poseEditMode={poseEditMode && standPoseEditable}
          selectedKey={selectedStand}
          onSelectKey={setSelectedStand}
          onPoseChange={standPoseEditable ? handlePoseChange : undefined}
          speakingKey={displaySprites.find((s) => !s.dimmed)?.character ?? null}
          motion={normalizeMotion(eng.line?.motion)}
          fx={isDialogueFx(eng.line?.fx) ? eng.line.fx : null}
          motionKey={`${eng.line?.id ?? ''}:${eng.lineIndex}:${eng.line?.motion ?? ''}`}
        />
      </div>

      {poseEditMode && standPoseEditable ? (
        <>
          <p className={styles.poseEditHint} role="status">
            스탠딩·핸드아웃 드래그·휠 · 현재 화면 기준으로 자동 저장
          </p>
          <button
            type="button"
            className={styles.poseEditDone}
            onClick={(e) => {
              e.stopPropagation();
              for (const [k, p] of Object.entries(poseOverrides)) {
                const parsed = parseStandSlotPoseKey(k);
                if (parsed) {
                  onStandPoseChange?.(parsed.character, p, parsed.slot);
                } else {
                  const spr = (eng.sprites ?? []).find((s) => s.character === k);
                  onStandPoseChange?.(
                    k,
                    p,
                    (spr?.standSlot as StandSlot | undefined) || 'center',
                  );
                }
              }
              for (const [k, p] of Object.entries(handoutLayoutOverrides)) {
                onHandoutPoseChange?.(k, p);
              }
              onStandPoseFlush?.();
              onHandoutPoseFlush?.();
              setPoseEditMode(false);
            }}
          >
            ✓ 위치 조정 종료
          </button>
        </>
      ) : null}

      {/** 항상 마운트 — opacity로 페이드 (등장/퇴장) */}
      <div
        className={`${styles.vignette}${vignetteOn ? ` ${styles.vignetteShow}` : ''}`}
        aria-hidden
      />

      <button
        type="button"
        className={`${styles.missionFab}${missionFabAlert ? ` ${styles.missionFabAlert}` : ''}`}
        aria-label={
          missionFabAlert === 'complete'
            ? '미션 완료 — 수첩 열기'
            : missionFabAlert === 'start'
              ? '새 미션 — 수첩 열기'
              : '미션 수첩'
        }
        title="미션 수첩"
        onClick={(e) => {
          e.stopPropagation();
          openJournal();
        }}
      >
        <span aria-hidden>✦</span>
        {missionFabAlert ? (
          <span
            className={`${styles.missionFabBadge}${
              missionFabAlert === 'complete' ? ` ${styles.missionFabBadgeComplete}` : ''
            }`}
            aria-hidden
          />
        ) : null}
      </button>

      <VnMissionJournal
        open={journalOpen}
        activeIds={eng.missionsActive}
        completedIds={eng.missionsCompleted}
        titleById={eng.missionTitles}
        onClose={() => setJournalOpen(false)}
      />

      <VnMissionBanner mission={displayMission} onDone={clearMissionBanner} />

      <VnLocationBanner
        location={displayLocation}
        playIntro={locPlayIntro}
        onIntroComplete={() => setLocReady(true)}
      />

      <VnHandoutLayer
        handout={eng.handout}
        resolveUrl={resolveHandout}
        layouts={displayHandoutLayouts}
        poseEditMode={poseEditMode && standPoseEditable}
        onPoseChange={
          standPoseEditable && onHandoutPoseChange ? handleHandoutPoseChange : undefined
        }
      />

      <VnFxLayer
        lineKey={lineKey}
        caption={eng.line?.caption}
        narrationOnly={
          locReady &&
          narrationOnly &&
          effect !== 'blackout' &&
          effect !== 'titlecard' &&
          chapterGate !== 'loading' &&
          chapterGate !== 'revealing'
        }
        liveTyping={
          locReady &&
          narrationOnly &&
          effect !== 'blackout' &&
          effect !== 'titlecard' &&
          chapterGate !== 'loading' &&
          chapterGate !== 'revealing'
        }
        showNarrationNext={
          locReady &&
          narrationOnly &&
          effect !== 'blackout' &&
          effect !== 'titlecard' &&
          chapterGate !== 'loading' &&
          chapterGate !== 'revealing' &&
          !eng.atEnd
        }
        effect={displayEffect}
        titleText={eng.line?.titleText}
        titleSubtext={eng.line?.titleSubtext}
        onTitlecardComplete={onTitlecardComplete}
      />
      <VnChapterLoading
        active={chapterGate === 'loading' || chapterGate === 'revealing'}
        holdExit={chapterLoadPhase === 'after' && eng.atEnd}
        onReveal={onChapterReveal}
        onDone={onChapterLoadDone}
      />
      {effect === 'diceRoll' && eng.line?.diceRoll ? (
        <VnDiceLayer
          key={lineKey}
          dice={eng.line.diceRoll}
          lineKey={lineKey}
          rollSfxUrl={resolveSfx(
            eng.line.diceRoll.sfx?.trim() || diceRollSfxDefault || '',
          )}
          resultSfxUrl={resolveSfx(eng.line.diceRoll.resultSfx?.trim() || '')}
          resultSfxByTone={diceResultToneUrls}
          resultSfxFallbackUrl={resolveSfx(diceResultSfxDefault || '')}
          cutinUrl={resolveDiceCutin(
            pickDiceCutinKey(
              eng.line.diceRoll,
              diceCutinByTone,
              diceRollCutinDefault,
              diceCutinList,
            ),
          )}
        />
      ) : null}

      {!hideDialogue ? (
        <DialogueBox
          speaker={eng.line?.speaker}
          speakerColor={eng.line?.speakerColor}
          text={eng.text}
          liveTyping
          hasNext={!eng.atEnd && !choices.length}
          isNarration={isNarration}
          leaving={leaving}
          choices={[]}
          sceneId={eng.scene.id}
          saveScopeId={saveScope}
          lineId={eng.line?.id}
          missionsActive={eng.missionsActive}
          missionsCompleted={eng.missionsCompleted}
          onClose={handleClose}
          onBoxClick={() => tryAdvance()}
          onLoadSave={applyLoadSave}
          autoPlay={autoPlay}
          onToggleAutoPlay={toggleAutoPlay}
          showClose={false}
        />
      ) : null}

      {showChoices ? (
        <VnChoicePanel
          choices={choices.map((c) => ({ text: c.text, nextSceneId: c.nextSceneId }))}
          onPick={(nextSceneId) => {
            pickChoice(nextSceneId);
          }}
        />
      ) : null}

      <VnSystemMenu
        open={sysOpen}
        sceneId={eng.scene.id}
        saveScopeId={saveScope}
        lineId={eng.line?.id}
        missionsActive={eng.missionsActive}
        missionsCompleted={eng.missionsCompleted}
        log={log}
        onClose={() => setSysOpen(false)}
        onMainMenu={goMain}
        onExit={onExit ?? handleClose}
        onLoadSave={applyLoadSave}
        standPoseEditable={standPoseEditable}
        poseEditActive={poseEditMode}
        onTogglePoseEdit={standPoseEditable ? togglePoseEdit : undefined}
      />
    </div>
  );
}
