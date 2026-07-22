'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  DICE_RESULT_TONE_OPTIONS,
  normalizeVnMaxOnStage,
  parseCcfoliaLog,
  toVnScene,
  collapseStickyVignette,
  type ScenarioVnAmbient,
  type ScenarioVnBackground,
  type ScenarioVnBgm,
  type ScenarioVnDiceResultSfxByTone,
  type ScenarioVnDiceSfx,
  type ScenarioVnHandout,
  type ScenarioVnLine,
  type ScenarioVnScene,
  type ScenarioVnSpeaker,
  type VnMaxOnStage,
} from '@/lib/vn/parseCcfoliaLog';
import {
  DIALOGUE_FX_OPTIONS,
  DIALOGUE_MOTION_OPTIONS,
  isDialogueFx,
  isDialogueMotion,
  normalizeMotion,
} from '@/lib/vn/motions';
import {
  ScenarioVnStandEditor,
  type ScenarioVnStandEditorHandle,
  type StandSlotPoseFlush,
} from './ScenarioVnStandEditor';
import { ScenarioVnHandoutLayoutPreview } from './ScenarioVnHandoutLayoutPreview';
import { DEFAULT_STAND_POSE } from '@/lib/vn/useStandPoseDrag';
import { mergeStandPosBySlot } from '@/lib/vn/standPosBySlot';
import {
  clampMenuBlur,
  DEFAULT_MENU_BLUR,
  MENU_BLUR_MAX,
  type ScenarioVnMenuTheme,
} from '@/lib/vn/menuTheme';
import { suggestInitialScale, trimTransparentEdges } from '@/lib/vn/trimTransparentEdges';
import {
  DEFAULT_VN_TUTORIAL_STEPS,
  type VnTutorialStep,
} from '@/components/vn/VnTutorial';
import type { SpellLineResult } from '@/lib/vn/koreanSpellcheck';
import '@/styles/shared/scenario-vn-editor.css';
import '@/styles/shared/dialogue-nodes-editor.css';
import '@/styles/shared/scenario-vn-handout-editor.css';
import '@/styles/shared/scenario-vn-menu-editor.css';

export type ScenarioVnEditable = {
  speakers: ScenarioVnSpeaker[];
  lines: ScenarioVnLine[];
  backgrounds?: ScenarioVnBackground[];
  bgms?: ScenarioVnBgm[];
  ambients?: ScenarioVnAmbient[];
  handouts?: ScenarioVnHandout[];
  diceSfxList?: ScenarioVnDiceSfx[];
  diceRollSfx?: string;
  diceResultSfx?: string;
  diceResultSfxByTone?: ScenarioVnDiceResultSfxByTone;
  maxOnStage?: number | 'all';
  /** VN 공통 튜토리얼 단계 (GIF 예시 포함) */
  tutorialSteps?: VnTutorialStep[];
  /** 타이틀(메인) 화면 배경·블러 */
  menuTheme?: import('@/lib/vn/menuTheme').ScenarioVnMenuTheme;
  /**
   * @deprecated 줄별 chapterLoadingBefore/After 사용.
   * true면 줄별 미지정 챕터에 before 로딩 적용 (구 데이터 호환).
   */
  chapterLoading?: boolean;
};

export type ScenarioVnEditorHandle = {
  /** 모달 저장 직전 — 스탠딩 버퍼까지 포함한 최신 스냅샷 */
  getSnapshot: () => { editable: ScenarioVnEditable; vnScene: ScenarioVnScene };
};

type Props = {
  scenarioId: string;
  scenarioTitle: string;
  /** 기존에 저장된 상태가 있으면 여기로 전달 (재편집) */
  initial?: ScenarioVnEditable | null;
  /**
   * 화자별 스프라이트 파일을 실제로 어딘가(R2 등)에 업로드하고 URL을 돌려주는 함수.
   * 안 주면 파일을 브라우저 메모리에서 data URL로만 미리보기 (새로고침하면 사라짐 — 저장 전 반드시 붙여야 함).
   */
  onUploadSprite?: (speakerKey: string, file: File) => Promise<string>;
  onUploadExpression?: (lineId: string, file: File) => Promise<string>;
  onUploadVoice?: (lineId: string, file: File) => Promise<string>;
  /** 챕터·미션 효과음 업로드 → URL */
  onUploadSfx?: (lineId: string, file: File) => Promise<string>;
  /** 배경 이미지 업로드 */
  onUploadBackground?: (backgroundKey: string, file: File) => Promise<string>;
  /** BGM 음원 업로드 */
  onUploadBgm?: (bgmKey: string, file: File) => Promise<string>;
  /** 환경음(루프) 업로드 */
  onUploadAmbient?: (ambientKey: string, file: File) => Promise<string>;
  /** 다이스 효과음 업로드 */
  onUploadDiceSfx?: (diceSfxKey: string, file: File) => Promise<string>;
  /** 핸드아웃 이미지 업로드 */
  onUploadHandout?: (handoutKey: string, file: File) => Promise<string>;
  /** 튜토리얼 GIF 업로드 */
  onUploadTutorialGif?: (stepId: string, file: File) => Promise<string>;
  uploadBusy?: boolean;
  /** 편집 중 부모 form 동기화 — 상단 모달 저장이 최신 VN 데이터를 갖게 함 */
  onDraftChange?: (editable: ScenarioVnEditable, vnScene: ScenarioVnScene) => void;
  /** @deprecated 모달 상단 저장 + onDraftChange / getSnapshot 사용 — 호환용 */
  onSave?: (editable: ScenarioVnEditable, vnScene: ScenarioVnScene) => void | Promise<void>;
};

function previewText(t: string, max = 46) {
  const oneLine = t.replace(/\n/g, ' ↵ ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 구 씬 플래그 → 챕터별 before 로 한 번 펼침 */
function migrateChapterLoadingLines(
  lines: ScenarioVnLine[],
  legacyChapterLoading: boolean,
): ScenarioVnLine[] {
  if (!legacyChapterLoading) return lines;
  const anyPerChapter = lines.some(
    (l) =>
      l.effect === 'titlecard' &&
      (Boolean(l.chapterLoadingBefore) || Boolean(l.chapterLoadingAfter)),
  );
  if (anyPerChapter) return lines;
  return lines.map((l) =>
    l.effect === 'titlecard' ? { ...l, chapterLoadingBefore: true } : l,
  );
}

function applyStandPoses(
  list: ScenarioVnSpeaker[],
  poses: Record<string, import('@/lib/vn/standPosBySlot').ScenarioVnStandPosBySlot>,
): ScenarioVnSpeaker[] {
  if (!Object.keys(poses).length) return list;
  return list.map((s) => {
    if (!(s.key in poses)) return s;
    const bySlot = poses[s.key];
    const next = {
      ...s,
      standPosBySlot: bySlot,
      standPos: bySlot.center ?? s.standPos,
    };
    delete next.standPose;
    return next;
  });
}

export const ScenarioVnEditor = forwardRef<ScenarioVnEditorHandle, Props>(function ScenarioVnEditor(
  {
    scenarioId,
    scenarioTitle,
    initial,
    onUploadSprite,
    onUploadExpression,
    onUploadVoice,
    onUploadSfx,
    onUploadBackground,
    onUploadBgm,
    onUploadAmbient,
    onUploadDiceSfx,
    onUploadHandout,
    onUploadTutorialGif,
    uploadBusy = false,
    onDraftChange,
  },
  ref,
) {
  const [speakers, setSpeakers] = useState<ScenarioVnSpeaker[]>(initial?.speakers ?? []);
  const [lines, setLines] = useState<ScenarioVnLine[]>(() =>
    migrateChapterLoadingLines(
      collapseStickyVignette(initial?.lines ?? []),
      Boolean(initial?.chapterLoading),
    ),
  );
  const [backgrounds, setBackgrounds] = useState<ScenarioVnBackground[]>(initial?.backgrounds ?? []);
  const [bgms, setBgms] = useState<ScenarioVnBgm[]>(initial?.bgms ?? []);
  const [ambients, setAmbients] = useState<ScenarioVnAmbient[]>(initial?.ambients ?? []);
  const [handouts, setHandouts] = useState<ScenarioVnHandout[]>(initial?.handouts ?? []);
  const [diceSfxList, setDiceSfxList] = useState<ScenarioVnDiceSfx[]>(
    initial?.diceSfxList ?? [],
  );
  const [diceRollSfx, setDiceRollSfx] = useState(initial?.diceRollSfx ?? '');
  const [diceResultSfx, setDiceResultSfx] = useState(initial?.diceResultSfx ?? '');
  const [diceResultSfxByTone, setDiceResultSfxByTone] = useState<ScenarioVnDiceResultSfxByTone>(
    () => ({ ...(initial?.diceResultSfxByTone ?? {}) }),
  );
  const [tutorialSteps, setTutorialSteps] = useState<VnTutorialStep[]>(
    () => initial?.tutorialSteps?.length ? initial.tutorialSteps : DEFAULT_VN_TUTORIAL_STEPS.map((s) => ({ ...s })),
  );
  const [menuTheme, setMenuTheme] = useState<ScenarioVnMenuTheme>(() => ({
    background: initial?.menuTheme?.background,
    blur: clampMenuBlur(initial?.menuTheme?.blur ?? DEFAULT_MENU_BLUR),
  }));
  const [busyMenuBg, setBusyMenuBg] = useState(false);
  const [openLine, setOpenLine] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'dice' | 'narration' | 'noSprite' | 'chapter'>('all');
  const [busySpeaker, setBusySpeaker] = useState<string | null>(null);
  const [busyBackground, setBusyBackground] = useState<string | null>(null);
  const [busyBgm, setBusyBgm] = useState<string | null>(null);
  const [busyAmbient, setBusyAmbient] = useState<string | null>(null);
  const [busyHandout, setBusyHandout] = useState<string | null>(null);
  const [busyDiceSfx, setBusyDiceSfx] = useState<string | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [maxOnStage, setMaxOnStage] = useState<VnMaxOnStage>(() =>
    normalizeVnMaxOnStage(initial?.maxOnStage),
  );
  const [tab, setTab] = useState<
    'basic' | 'pl' | 'bg' | 'bgm' | 'ambient' | 'handout' | 'dice' | 'stand' | 'loading' | 'lines'
  >('basic');
  const [msg, setMsg] = useState('');
  const [spellBusy, setSpellBusy] = useState(false);
  const [spellResults, setSpellResults] = useState<SpellLineResult[] | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    speaker: string;
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const standEditorRef = useRef<ScenarioVnStandEditorHandle | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const slotMidsRef = useRef<number[]>([]);
  const speakersRef = useRef(speakers);
  const linesRef = useRef(lines);
  const backgroundsRef = useRef(backgrounds);
  const bgmsRef = useRef(bgms);
  const ambientsRef = useRef(ambients);
  const handoutsRef = useRef(handouts);
  const diceSfxListRef = useRef(diceSfxList);
  const diceRollSfxRef = useRef(diceRollSfx);
  const diceResultSfxRef = useRef(diceResultSfx);
  const diceResultSfxByToneRef = useRef(diceResultSfxByTone);
  const tutorialStepsRef = useRef(tutorialSteps);
  const menuThemeRef = useRef(menuTheme);
  const maxOnStageRef = useRef(maxOnStage);
  const onDraftChangeRef = useRef(onDraftChange);
  speakersRef.current = speakers;
  linesRef.current = lines;
  backgroundsRef.current = backgrounds;
  bgmsRef.current = bgms;
  ambientsRef.current = ambients;
  handoutsRef.current = handouts;
  diceSfxListRef.current = diceSfxList;
  diceRollSfxRef.current = diceRollSfx;
  diceResultSfxRef.current = diceResultSfx;
  diceResultSfxByToneRef.current = diceResultSfxByTone;
  tutorialStepsRef.current = tutorialSteps;
  menuThemeRef.current = menuTheme;
  maxOnStageRef.current = maxOnStage;
  onDraftChangeRef.current = onDraftChange;

  const buildSnapshot = useCallback(
    (commitStand: boolean) => {
      const poses = commitStand
        ? (standEditorRef.current?.flush() ?? {})
        : {};
      /* flush 가 비어도 speakersRef 에 이미 커밋된 standPosBySlot 유지 */
      const speakersNow = Object.keys(poses).length
        ? applyStandPoses(speakersRef.current, poses)
        : speakersRef.current;
      if (Object.keys(poses).length) speakersRef.current = speakersNow;
      const editable: ScenarioVnEditable = {
        speakers: speakersNow,
        lines: linesRef.current,
        backgrounds: backgroundsRef.current,
        bgms: bgmsRef.current,
        ambients: ambientsRef.current,
        handouts: handoutsRef.current,
        diceSfxList: diceSfxListRef.current,
        diceRollSfx: diceRollSfxRef.current || undefined,
        diceResultSfx: diceResultSfxRef.current || undefined,
        diceResultSfxByTone: (() => {
          const t = diceResultSfxByToneRef.current;
          const cleaned: ScenarioVnDiceResultSfxByTone = {};
          for (const { tone } of DICE_RESULT_TONE_OPTIONS) {
            const v = t[tone]?.trim();
            if (v) cleaned[tone] = v;
          }
          return Object.keys(cleaned).length ? cleaned : undefined;
        })(),
        maxOnStage: maxOnStageRef.current,
        tutorialSteps: tutorialStepsRef.current,
        menuTheme: menuThemeRef.current,
        chapterLoading: linesRef.current.some(
          (l) =>
            l.effect === 'titlecard' &&
            (Boolean(l.chapterLoadingBefore) || Boolean(l.chapterLoadingAfter)),
        )
          ? true
          : undefined,
      };
      return {
        editable,
        vnScene: toVnScene(scenarioId, scenarioTitle, speakersNow, linesRef.current, {
          maxOnStage: maxOnStageRef.current,
          backgrounds: backgroundsRef.current,
          bgms: bgmsRef.current,
          ambients: ambientsRef.current,
          handouts: handoutsRef.current,
          diceSfxList: diceSfxListRef.current,
          diceRollSfx: diceRollSfxRef.current || undefined,
          diceResultSfx: diceResultSfxRef.current || undefined,
          diceResultSfxByTone: editable.diceResultSfxByTone,
          menuTheme: menuThemeRef.current,
          chapterLoading: editable.chapterLoading,
        }),
      };
    },
    [scenarioId, scenarioTitle],
  );

  useImperativeHandle(ref, () => ({ getSnapshot: () => buildSnapshot(true) }), [buildSnapshot]);

  useEffect(() => {
    const { editable, vnScene } = buildSnapshot(false);
    onDraftChangeRef.current?.(editable, vnScene);
  }, [speakers, lines, backgrounds, bgms, ambients, handouts, diceSfxList, diceRollSfx, diceResultSfx, diceResultSfxByTone, maxOnStage, tutorialSteps, menuTheme, buildSnapshot]);

  useEffect(() => {
    return () => {
      const { editable, vnScene } = buildSnapshot(true);
      onDraftChangeRef.current?.(editable, vnScene);
    };
  }, [buildSnapshot]);

  const speakerMap = useMemo(() => new Map(speakers.map((s) => [s.key, s])), [speakers]);

  const stats = useMemo(() => {
    const dice = lines.filter((l) => l.effect === 'diceRoll').length;
    const narr = lines.filter((l) => l.narrationOnly || speakerMap.get(l.speakerKey)?.treatAsNarration).length;
    const missing = speakers.filter((s) => !s.treatAsNarration && !s.sprite).length;
    const chapters = lines.filter((l) => l.effect === 'titlecard').length;
    return { total: lines.length, dice, narr, speakers: speakers.length, missing, chapters };
  }, [lines, speakers, speakerMap]);

  const visibleLines = useMemo(() => {
    if (filter === 'all') return lines;
    if (filter === 'dice') return lines.filter((l) => l.effect === 'diceRoll');
    if (filter === 'narration')
      return lines.filter((l) => l.narrationOnly || speakerMap.get(l.speakerKey)?.treatAsNarration);
    if (filter === 'chapter') return lines.filter((l) => l.effect === 'titlecard');
    return lines.filter((l) => {
      const sp = speakerMap.get(l.speakerKey);
      return sp && !sp.treatAsNarration && !sp.sprite;
    });
  }, [lines, filter, speakerMap]);

  function importFromHtml(html: string) {
    const parsed = parseCcfoliaLog(html);
    if (!parsed.lines.length) {
      setMsg('로그에서 대사를 찾지 못했어요. CCFolia에서 내보낸 원본 html인지 확인해주세요.');
      return;
    }
    setSpeakers(parsed.speakers);
    setLines(parsed.lines.map((l) => ({ ...l })));
    setOpenLine(new Set());
    setTab('lines');
    setMsg(`불러왔어요 — 대사 ${parsed.lines.length}줄, 화자 ${parsed.speakers.length}명, 다이스 ${parsed.lines.filter((l) => l.effect === 'diceRoll').length}회`);
  }

  function handleFilePick(file: File) {
    const reader = new FileReader();
    reader.onload = () => importFromHtml(String(reader.result || ''));
    reader.readAsText(file, 'utf-8');
  }

  async function handleSpriteFile(key: string, file: File) {
    setBusySpeaker(key);
    try {
      const { file: trimmed, aspectRatio } = await trimTransparentEdges(file);
      const url = onUploadSprite ? await onUploadSprite(key, trimmed) : await fileToDataUrl(trimmed);
      const initialScale = suggestInitialScale(aspectRatio);
      setSpeakers((prev) =>
        prev.map((s) => {
          if (s.key !== key) return s;
          const center = { ...(s.standPos || DEFAULT_STAND_POSE), scale: initialScale };
          const bySlot = mergeStandPosBySlot(s.standPosBySlot, { center });
          return {
            ...s,
            sprite: url,
            standPos: center,
            standPosBySlot: bySlot,
          };
        }),
      );
    } finally {
      setBusySpeaker(null);
    }
  }

  async function handleExpressionFile(lineId: string, file: File) {
    if (!onUploadExpression) return;
    setBusyLine(lineId);
    try {
      const url = await onUploadExpression(lineId, file);
      updateLine(lineId, { expression: url });
    } finally {
      setBusyLine(null);
    }
  }

  async function handleVoiceFile(lineId: string, file: File) {
    if (!onUploadVoice) return;
    setBusyLine(lineId);
    try {
      const url = await onUploadVoice(lineId, file);
      updateLine(lineId, { voice: url });
    } finally {
      setBusyLine(null);
    }
  }

  async function handleSfxFile(lineId: string, file: File) {
    if (!onUploadSfx) return;
    setBusyLine(lineId);
    try {
      const url = await onUploadSfx(lineId, file);
      updateLine(lineId, { sfx: url });
    } finally {
      setBusyLine(null);
    }
  }

  function updateSpeaker(key: string, patch: Partial<ScenarioVnSpeaker>) {
    setSpeakers((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s, ...patch };
        if (patch.standPos !== undefined || patch.standPosBySlot !== undefined) {
          delete next.standPose;
        }
        if (patch.standPosBySlot?.center) {
          next.standPos = patch.standPosBySlot.center;
        }
        return next;
      }),
    );
  }

  function addBackground() {
    const key = `bg_${Date.now().toString(36)}`;
    setBackgrounds((prev) => [...prev, { key, label: '' }]);
  }

  function updateBackground(key: string, patch: Partial<ScenarioVnBackground>) {
    setBackgrounds((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function removeBackground(key: string) {
    setBackgrounds((prev) => prev.filter((b) => b.key !== key));
    setLines((prev) => prev.map((l) => (l.background === key ? { ...l, background: undefined } : l)));
  }

  async function handleBackgroundFile(key: string, file: File) {
    setBusyBackground(key);
    try {
      const url = onUploadBackground ? await onUploadBackground(key, file) : await fileToDataUrl(file);
      setBackgrounds((prev) => prev.map((b) => (b.key === key ? { ...b, image: url } : b)));
    } finally {
      setBusyBackground(null);
    }
  }

  function addBgm() {
    const key = `bgm_${Date.now().toString(36)}`;
    setBgms((prev) => [...prev, { key, label: '' }]);
  }

  function updateBgm(key: string, patch: Partial<ScenarioVnBgm>) {
    setBgms((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function removeBgm(key: string) {
    setBgms((prev) => prev.filter((b) => b.key !== key));
    setLines((prev) => prev.map((l) => (l.bgm === key ? { ...l, bgm: undefined } : l)));
  }

  async function handleBgmFile(key: string, file: File) {
    setBusyBgm(key);
    try {
      const url = onUploadBgm ? await onUploadBgm(key, file) : await fileToDataUrl(file);
      setBgms((prev) => prev.map((b) => (b.key === key ? { ...b, audio: url } : b)));
    } finally {
      setBusyBgm(null);
    }
  }

  function addAmbient() {
    const key = `amb_${Date.now().toString(36)}`;
    setAmbients((prev) => [...prev, { key, label: '' }]);
  }

  function updateAmbient(key: string, patch: Partial<ScenarioVnAmbient>) {
    setAmbients((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function removeAmbient(key: string) {
    setAmbients((prev) => prev.filter((a) => a.key !== key));
    setLines((prev) => prev.map((l) => (l.ambient === key ? { ...l, ambient: undefined } : l)));
  }

  async function handleAmbientFile(key: string, file: File) {
    setBusyAmbient(key);
    try {
      const url = onUploadAmbient ? await onUploadAmbient(key, file) : await fileToDataUrl(file);
      setAmbients((prev) => prev.map((a) => (a.key === key ? { ...a, audio: url } : a)));
    } finally {
      setBusyAmbient(null);
    }
  }

  function addDiceSfx() {
    const key = `dice_${Date.now().toString(36)}`;
    setDiceSfxList((prev) => [...prev, { key, label: '' }]);
  }

  function updateDiceSfx(key: string, patch: Partial<ScenarioVnDiceSfx>) {
    setDiceSfxList((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDiceSfx(key: string) {
    setDiceSfxList((prev) => prev.filter((d) => d.key !== key));
    setDiceRollSfx((v) => (v === key ? '' : v));
    setDiceResultSfx((v) => (v === key ? '' : v));
    setDiceResultSfxByTone((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const { tone } of DICE_RESULT_TONE_OPTIONS) {
        if (next[tone] === key) {
          delete next[tone];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setLines((prev) =>
      prev.map((l) => {
        if (!l.diceRoll) return l;
        const next = { ...l.diceRoll };
        if (next.sfx === key) next.sfx = undefined;
        if (next.resultSfx === key) next.resultSfx = undefined;
        return { ...l, diceRoll: next };
      }),
    );
  }

  async function handleDiceSfxFile(key: string, file: File) {
    setBusyDiceSfx(key);
    try {
      const url = onUploadDiceSfx ? await onUploadDiceSfx(key, file) : await fileToDataUrl(file);
      setDiceSfxList((prev) => prev.map((d) => (d.key === key ? { ...d, audio: url } : d)));
    } finally {
      setBusyDiceSfx(null);
    }
  }

  function addHandout() {
    const key = `ho_${Date.now().toString(36)}`;
    setHandouts((prev) => [...prev, { key, label: '' }]);
  }

  function updateHandout(key: string, patch: Partial<ScenarioVnHandout>) {
    setHandouts((prev) => prev.map((h) => (h.key === key ? { ...h, ...patch } : h)));
  }

  function removeHandout(key: string) {
    setHandouts((prev) => prev.filter((h) => h.key !== key));
    setLines((prev) => prev.map((l) => (l.handout === key ? { ...l, handout: undefined } : l)));
  }

  async function handleHandoutFile(key: string, file: File) {
    setBusyHandout(key);
    try {
      const url = onUploadHandout ? await onUploadHandout(key, file) : await fileToDataUrl(file);
      setHandouts((prev) => prev.map((h) => (h.key === key ? { ...h, image: url } : h)));
    } finally {
      setBusyHandout(null);
    }
  }

  async function handleMenuBgFile(file: File) {
    setBusyMenuBg(true);
    try {
      const url = onUploadBackground
        ? await onUploadBackground('__menu__', file)
        : await fileToDataUrl(file);
      setMenuTheme((prev) => ({ ...prev, background: url }));
    } finally {
      setBusyMenuBg(false);
    }
  }

  /** 스탠딩 슬롯 버전 포즈 일괄 반영 */
  function commitStandPoses(poses: StandSlotPoseFlush) {
    setSpeakers((prev) => {
      const next = applyStandPoses(prev, poses);
      speakersRef.current = next;
      return next;
    });
  }

  function updateLine(id: string, patch: Partial<ScenarioVnLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  /** 같은 화자의 이후 대사 줄 (표정 유지 끝 후보) */
  function laterSameSpeakerLines(fromId: string, speakerKey: string): ScenarioVnLine[] {
    const key = speakerKey?.trim() || '';
    if (!key) return [];
    const idx = lines.findIndex((l) => l.id === fromId);
    if (idx < 0) return [];
    return lines.slice(idx + 1).filter(
      (l) =>
        l.effect !== 'titlecard' &&
        (l.speakerKey || '').trim() === key &&
        !l.narrationOnly,
    );
  }

  function expressionHoldSelectValue(line: ScenarioVnLine): string {
    if (line.expressionPersist === false) return 'once';
    const until = line.expressionUntilLineId?.trim();
    if (until) {
      const ok = laterSameSpeakerLines(line.id, line.speakerKey).some((l) => l.id === until);
      if (ok) return `until:${until}`;
    }
    return 'keep';
  }

  function lineHoldLabel(target: ScenarioVnLine): string {
    const abs = lines.findIndex((l) => l.id === target.id);
    const raw = (target.text || '').replace(/\s+/g, ' ').trim();
    const preview = raw.slice(0, 28);
    const ellipsis = raw.length > 28 ? '…' : '';
    return `#${abs >= 0 ? abs + 1 : '?'} ${preview || '(빈 대사)'}${ellipsis}`;
  }

  /* 끝 대사가 삭제·앞으로 이동·화자 불일치면 keep 으로 정리 */
  useEffect(() => {
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l, i) => {
        const until = l.expressionUntilLineId?.trim();
        if (!until) return l;
        if (!l.expression?.trim() || l.expressionPersist === false) {
          changed = true;
          return { ...l, expressionUntilLineId: undefined };
        }
        const ok = prev.slice(i + 1).some(
          (x) =>
            x.id === until &&
            x.effect !== 'titlecard' &&
            (x.speakerKey || '').trim() === (l.speakerKey || '').trim() &&
            !x.narrationOnly,
        );
        if (!ok) {
          changed = true;
          return { ...l, expressionUntilLineId: undefined };
        }
        return l;
      });
      return changed ? next : prev;
    });
  }, [lines]);

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setOpenLine((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function insertChapterBefore(beforeId: string) {
    const chapId = `chap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const chapterLine: ScenarioVnLine = {
      id: chapId,
      speakerKey: '',
      text: '',
      effect: 'titlecard',
      titleText: '',
    };
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === beforeId);
      if (idx < 0) return [...prev, chapterLine];
      const next = [...prev];
      next.splice(idx, 0, chapterLine);
      return next;
    });
    setOpenLine((prev) => new Set(prev).add(chapId));
  }

  function insertDialogueAfter(afterId: string) {
    const lineId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newLine: ScenarioVnLine = {
      id: lineId,
      speakerKey: '',
      text: '',
    };
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === afterId);
      if (idx < 0) return [...prev, newLine];
      const next = [...prev];
      next.splice(idx + 1, 0, newLine);
      return next;
    });
    setOpenLine((prev) => new Set(prev).add(lineId));
  }

  function reorderByVisibleIndex(fromVis: number, toVis: number) {
    if (fromVis === toVis || fromVis < 0 || toVis < 0) return;
    const fromId = visibleLines[fromVis]?.id;
    const toId = visibleLines[toVis]?.id;
    if (!fromId || !toId) return;
    setLines((prev) => {
      const from = prev.findIndex((l) => l.id === fromId);
      const to = prev.findIndex((l) => l.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function hitIndexAtY(clientY: number): number | null {
    const mids = slotMidsRef.current;
    if (!mids.length) return null;
    for (let i = 0; i < mids.length; i += 1) {
      if (clientY < mids[i]) return i;
    }
    return mids.length - 1;
  }

  function clampGhostY(clientY: number, h: number) {
    const list = listRef.current;
    const y = clientY - h / 2;
    if (!list) return Math.max(8, y);
    const r = list.getBoundingClientRect();
    return Math.min(Math.max(y, r.top + 4), Math.max(r.top + 4, r.bottom - h - 4));
  }

  function endLineDrag(commit: boolean) {
    const from = dragFromRef.current;
    const to = dragOverRef.current;
    setDragFrom(null);
    setDragOver(null);
    setGhost(null);
    dragFromRef.current = null;
    dragOverRef.current = null;
    slotMidsRef.current = [];
    if (commit && from != null && to != null) reorderByVisibleIndex(from, to);
  }

  function onLineDragPointerDown(e: ReactPointerEvent<HTMLButtonElement>, i: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const row = rowRefs.current[i];
    const line = visibleLines[i];
    if (!row || !line) return;
    const rect = row.getBoundingClientRect();
    const h = Math.min(rect.height, 56);
    slotMidsRef.current = rowRefs.current.map((el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFromRef.current = i;
    dragOverRef.current = i;
    setDragFrom(i);
    setDragOver(i);
    const sp = speakerMap.get(line.speakerKey);
    setGhost({
      x: rect.left,
      y: clampGhostY(e.clientY, h),
      w: rect.width,
      h,
      speaker:
        line.effect === 'titlecard'
          ? '챕터'
          : sp?.treatAsNarration || !line.speakerKey
            ? '나레이션'
            : sp?.displayName || line.speakerKey || '대사',
      text:
        line.effect === 'titlecard'
          ? line.titleText?.trim() || '(제목 없음)'
          : previewText(line.text) || '(내용 없음)',
    });
  }

  function onLineDragPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragFromRef.current == null) return;
    const nextOver = hitIndexAtY(e.clientY);
    if (nextOver != null && nextOver !== dragOverRef.current) {
      dragOverRef.current = nextOver;
      setDragOver(nextOver);
    }
    setGhost((g) =>
      g
        ? {
            ...g,
            y: clampGhostY(e.clientY, g.h),
            x: listRef.current?.getBoundingClientRect().left ?? g.x,
          }
        : g,
    );
  }

  function onLineDragPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragFromRef.current == null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    endLineDrag(true);
  }

  function slideOffset(i: number): number {
    if (dragFrom == null || dragOver == null || dragFrom === dragOver) return 0;
    const src = rowRefs.current[dragFrom];
    const gap = (src?.offsetHeight ?? 48) + 8;
    if (dragFrom < dragOver) {
      if (i > dragFrom && i <= dragOver) return -gap;
    } else if (i >= dragOver && i < dragFrom) {
      return gap;
    }
    return 0;
  }

  async function runSpellcheck() {
    const targets = lines
      .filter((l) => l.effect !== 'titlecard' && l.text.trim())
      .map((l) => ({ id: l.id, text: l.text }));
    if (!targets.length) {
      setMsg('검사할 대사가 없어요.');
      setSpellResults(null);
      return;
    }
    const BATCH = 40;
    setSpellBusy(true);
    setSpellResults(null);
    setMsg(`맞춤법 검사 중… 0/${targets.length}`);
    try {
      const all: SpellLineResult[] = [];
      for (let i = 0; i < targets.length; i += BATCH) {
        const chunk = targets.slice(i, i + BATCH);
        setMsg(
          `맞춤법 검사 중… ${Math.min(i + chunk.length, targets.length)}/${targets.length}`,
        );
        const res = await fetch('/api/vn-spellcheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: chunk }),
        });
        const data = (await res.json()) as { results?: SpellLineResult[]; error?: string };
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        all.push(...(data.results ?? []));
        setSpellResults([...all]);
      }
      const failed = all.filter((r) => r.issues.some((i) => !i.token && i.message)).length;
      const bad = all.filter((r) => r.issues.some((i) => i.token)).length;
      if (failed && !bad) {
        setMsg(
          all.find((r) => r.issues.some((i) => !i.token && i.message))?.issues[0]?.message ||
            '맞춤법 검사 실패',
        );
      } else {
        setMsg(
          bad
            ? `맞춤법·띄어쓰기 이슈 ${bad}줄 / ${targets.length}줄 검사 — 아래에서 제안 적용 가능`
            : `맞춤법·띄어쓰기 이슈 없음 (${targets.length}줄 검사)`,
        );
      }
    } catch (err) {
      setSpellResults(null);
      setMsg(err instanceof Error ? `맞춤법 검사 실패: ${err.message}` : '맞춤법 검사 실패');
    } finally {
      setSpellBusy(false);
    }
  }

  function applySpellSuggestion(lineId: string, text: string) {
    updateLine(lineId, { text });
    setSpellResults((prev) =>
      prev
        ? prev.map((r) =>
            r.lineId === lineId ? { ...r, text, issues: [], suggestedText: undefined } : r,
          )
        : prev,
    );
  }

  function applyAllSpellSuggestions() {
    if (!spellResults?.length) return;
    setLines((prev) =>
      prev.map((l) => {
        const hit = spellResults.find((r) => r.lineId === l.id && r.suggestedText);
        return hit?.suggestedText ? { ...l, text: hit.suggestedText } : l;
      }),
    );
    setSpellResults((prev) =>
      prev
        ? prev.map((r) =>
            r.suggestedText
              ? { ...r, text: r.suggestedText, issues: [], suggestedText: undefined }
              : r,
          )
        : prev,
    );
    setMsg('제안된 교정을 모두 적용했어요. 한번 더 읽어 확인해 주세요.');
  }

  function appendChapterAtEnd() {
    const chapId = `chap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setLines((prev) => [
      ...prev,
      { id: chapId, speakerKey: '', text: '', effect: 'titlecard', titleText: '' },
    ]);
    setOpenLine((prev) => new Set(prev).add(chapId));
  }

  function toggleLine(id: string) {
    setOpenLine((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tabs = [
    { id: 'basic' as const, label: '기본' },
    { id: 'pl' as const, label: 'PL', needLines: true },
    { id: 'bg' as const, label: '배경&장소', needLines: true },
    { id: 'bgm' as const, label: 'BGM', needLines: true },
    { id: 'ambient' as const, label: '환경음', needLines: true },
    { id: 'handout' as const, label: '핸드아웃', needLines: true },
    { id: 'dice' as const, label: '다이스', needLines: true },
    { id: 'stand' as const, label: '스탠딩', needLines: true },
    { id: 'loading' as const, label: '로딩창', needLines: true },
    { id: 'lines' as const, label: '대사', needLines: true },
  ];

  return (
    <div className="svn-editor">
      <nav className="svn-editor__tabs" aria-label="VN 편집 섹션">
        {tabs.map((t) => {
          const disabled = Boolean(t.needLines && !lines.length);
          return (
            <button
              key={t.id}
              type="button"
              className={`svn-editor__tab${tab === t.id ? ' is-active' : ''}`}
              disabled={disabled}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      {msg ? <p className="svn-editor__msg">{msg}</p> : null}

      {tab === 'basic' ? (
        <>
      <section className="svn-editor__block">
        <div className="lh-dialogue-block__label">CCFolia 로그 불러오기</div>
        <p className="lh-dialogue-editor__hint">
          CCFolia에서 내보낸 로그 html 파일을 올리면 화자/대사/다이스 판정을 자동으로 분리해요.
          다시 불러오면 지금까지 편집한 내용은 덮어써지니 주의하세요.
        </p>
        <div className="svn-editor__importrow">
          <button type="button" className="btn-save" onClick={() => fileInputRef.current?.click()}>
            로그 파일 선택
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,text/html"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFilePick(f);
              e.target.value = '';
            }}
          />
          {lines.length > 0 && <span className="svn-editor__importhint">{lines.length}줄 불러온 상태</span>}
        </div>
      </section>

      <section className="svn-editor__block">
        <div className="lh-dialogue-block__label">메인 화면 (타이틀)</div>
        <p className="lh-dialogue-editor__hint">
          VN을 열면 처음 보이는 타이틀 메뉴 배경입니다. 이미지와 흐림(블러)을 조절할 수 있어요.
        </p>
        <div className="svn-menu-theme">
          <div
            className="svn-menu-theme__preview"
            style={
              {
                ['--menu-preview-blur' as string]: `${clampMenuBlur(menuTheme.blur)}px`,
              } as CSSProperties
            }
          >
            {menuTheme.background ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={menuTheme.background} alt="" className="svn-menu-theme__bg" />
            ) : (
              <div className="svn-menu-theme__fallback" aria-hidden />
            )}
            <div className="svn-menu-theme__veil" aria-hidden />
            <span className="svn-menu-theme__label">미리보기</span>
          </div>
          <div className="svn-menu-theme__controls">
            <label className="file-input-label svn-speaker__file">
              {busyMenuBg
                ? '업로드 중…'
                : menuTheme.background
                  ? '배경 이미지 교체'
                  : '배경 이미지 선택'}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={busyMenuBg || uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleMenuBgFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            {menuTheme.background ? (
              <button
                type="button"
                className="btn-del"
                style={{ alignSelf: 'flex-start', padding: '3px 8px' }}
                onClick={() => setMenuTheme((prev) => ({ ...prev, background: undefined }))}
              >
                배경 제거 (기본)
              </button>
            ) : null}
            <label className="svn-menu-theme__slider">
              <span>
                흐림 {clampMenuBlur(menuTheme.blur)}px
                {clampMenuBlur(menuTheme.blur) === 0 ? ' (선명)' : ''}
              </span>
              <input
                type="range"
                min={0}
                max={MENU_BLUR_MAX}
                step={1}
                value={clampMenuBlur(menuTheme.blur)}
                onChange={(e) =>
                  setMenuTheme((prev) => ({
                    ...prev,
                    blur: clampMenuBlur(Number(e.target.value)),
                  }))
                }
              />
            </label>
          </div>
        </div>
      </section>

      <section className="svn-editor__block">
        <div className="lh-dialogue-block__label">튜토리얼 단계</div>
        <p className="lh-dialogue-editor__hint">
          게임 시작 시 뜨는 튜토리얼 단계입니다. 제목·본문은 영문으로 두고, 예시 GIF를 등록할 수 있어요.
        </p>
        <div className="svn-editor__speakers">
          {tutorialSteps.map((step, i) => (
            <div className="svn-speaker" key={step.id}>
              <div className="svn-speaker__fields" style={{ width: '100%' }}>
                <div className="lh-dialogue-block__label">Step {i + 1}</div>
                <input
                  className="form-input"
                  value={step.title}
                  placeholder="Title"
                  onChange={(e) =>
                    setTutorialSteps((prev) =>
                      prev.map((s) => (s.id === step.id ? { ...s, title: e.target.value } : s)),
                    )
                  }
                />
                <textarea
                  className="form-input"
                  rows={3}
                  value={step.body}
                  placeholder="Body"
                  onChange={(e) =>
                    setTutorialSteps((prev) =>
                      prev.map((s) => (s.id === step.id ? { ...s, body: e.target.value } : s)),
                    )
                  }
                />
                {step.gifUrl ? (
                  <img src={step.gifUrl} alt="" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8 }} />
                ) : null}
                <label className="file-input-label svn-speaker__file">
                  {step.gifUrl ? 'GIF 교체' : '예시 GIF 선택'}
                  <input
                    type="file"
                    accept="image/gif,image/*,.gif"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void (async () => {
                        const url = onUploadTutorialGif
                          ? await onUploadTutorialGif(step.id, f)
                          : await fileToDataUrl(f);
                        setTutorialSteps((prev) =>
                          prev.map((s) => (s.id === step.id ? { ...s, gifUrl: url } : s)),
                        );
                      })();
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>
        </>
      ) : null}

      {tab === 'pl' && lines.length > 0 ? (
          <section className="svn-editor__block">
            <div className="lh-dialogue-block__label">화자 &amp; 캐릭터 이미지</div>
            <div className="svn-editor__speakers">
              {speakers.map((sp) => (
                <div className="svn-speaker" key={sp.key}>
                  <div className="svn-speaker__thumb">
                    {sp.sprite ? (
                      <img src={sp.sprite} alt="" />
                    ) : (
                      <span className="svn-speaker__swatch" style={{ background: sp.color || '#888' }} />
                    )}
                  </div>
                  <div className="svn-speaker__fields">
                    <input
                      className="form-input"
                      value={sp.displayName}
                      onChange={(e) => updateSpeaker(sp.key, { displayName: e.target.value })}
                    />
                    <div className="svn-speaker__row">
                      <span className="lh-dialogue-editor__hint" style={{ margin: 0, fontSize: 11 }}>
                        자리·크기는 스탠딩 탭에서 왼/중/우 버전으로 조절
                      </span>
                      <label className="svn-speaker__narr">
                        <input
                          type="checkbox"
                          checked={Boolean(sp.treatAsNarration)}
                          onChange={(e) => updateSpeaker(sp.key, { treatAsNarration: e.target.checked })}
                        />
                        나레이션 처리
                      </label>
                    </div>
                    <label className="file-input-label svn-speaker__file">
                      {busySpeaker === sp.key ? '업로드 중…' : sp.sprite ? '이미지 교체' : '이미지 선택'}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={busySpeaker === sp.key}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleSpriteFile(sp.key, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <p className="lh-dialogue-editor__hint" style={{ margin: 0 }}>
              이미지를 올리면 투명 여백을 자동으로 잘라내고, 세로/가로 비율로 전신·상반신을 추정해 시작 크기를 잡아줘요.
              좌·우·가운데는 기본 자리, 미세 위치·크기·등장 연출은 「스탠딩」 탭에서 조절해요.
            </p>
          </section>
      ) : null}

      {tab === 'bg' && lines.length > 0 ? (
          <section className="svn-editor__block">
            <div className="lh-dialogue-block__label">배경 &amp; 장소</div>
            <p className="lh-dialogue-editor__hint">
              장소를 등록하고 배경 이미지를 올려두면, 대사 줄에서 드롭다운으로 고를 수 있어요. 「장소 배너
              표시」를 켠 항목만 고를 때 장소 연출이 같이 들어갑니다.
            </p>
            <div className="svn-editor__speakers">
              {backgrounds.map((bg) => (
                <div className="svn-speaker" key={bg.key}>
                  <div className="svn-speaker__thumb">
                    {bg.image ? (
                      <img src={bg.image} alt="" />
                    ) : (
                      <span className="svn-speaker__swatch" style={{ background: '#3a3226' }} />
                    )}
                  </div>
                  <div className="svn-speaker__fields">
                    <input
                      className="form-input"
                      placeholder="장소 이름 (예: 폐허가 된 등대)"
                      value={bg.label}
                      onChange={(e) => updateBackground(bg.key, { label: e.target.value })}
                    />
                    <label className="svn-editor__check">
                      <input
                        type="checkbox"
                        checked={bg.announceLocation !== false}
                        onChange={(e) =>
                          updateBackground(bg.key, {
                            announceLocation: e.target.checked ? undefined : false,
                          })
                        }
                      />
                      장소 배너 표시
                    </label>
                    <label className="file-input-label svn-speaker__file">
                      {busyBackground === bg.key ? '업로드 중…' : bg.image ? '이미지 교체' : '이미지 선택'}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={busyBackground === bg.key}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleBackgroundFile(bg.key, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-del"
                      style={{ alignSelf: 'flex-start', padding: '3px 8px' }}
                      onClick={() => removeBackground(bg.key)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="lh-dialogue-editor__tool" onClick={addBackground}>
              + 장소 추가
            </button>
          </section>
      ) : null}

      {tab === 'bgm' && lines.length > 0 ? (
          <section className="svn-editor__block">
            <div className="lh-dialogue-block__label">배경음악(BGM)</div>
            <p className="lh-dialogue-editor__hint">
              곡을 등록해두면 대사 줄에서 드롭다운으로 상황에 맞게 바로 바꿔 낄 수 있어요.
            </p>
            <div className="svn-editor__speakers">
              {bgms.map((bgm) => (
                <div className="svn-speaker" key={bgm.key}>
                  <div className="svn-speaker__fields">
                    <input
                      className="form-input"
                      placeholder="곡 이름 (예: 긴장되는 씬)"
                      value={bgm.label}
                      onChange={(e) => updateBgm(bgm.key, { label: e.target.value })}
                    />
                    {bgm.audio ? (
                      <audio controls src={bgm.audio} preload="metadata" style={{ width: '100%' }} />
                    ) : null}
                    <div className="svn-speaker__row">
                      <label className="file-input-label svn-speaker__file">
                        {busyBgm === bgm.key ? '업로드 중…' : bgm.audio ? '음원 교체' : '음원 선택'}
                        <input
                          type="file"
                          accept="audio/*"
                          hidden
                          disabled={busyBgm === bgm.key}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleBgmFile(bgm.key, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-del"
                        style={{ padding: '3px 8px' }}
                        onClick={() => removeBgm(bgm.key)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="lh-dialogue-editor__tool" onClick={addBgm}>
              + BGM 추가
            </button>
          </section>
      ) : null}

      {tab === 'ambient' && lines.length > 0 ? (
          <section className="svn-editor__block">
            <div className="lh-dialogue-block__label">환경음 (루프)</div>
            <p className="lh-dialogue-editor__hint">
              관객 웅성임·바깥 소리처럼 BGM과 별개로 계속 깔리는 소리입니다. 대사 줄에서 켜고, 「끄기」를 고른
              줄까지 루프 재생됩니다.
            </p>
            <div className="svn-editor__speakers">
              {ambients.map((amb) => (
                <div className="svn-speaker" key={amb.key}>
                  <div className="svn-speaker__fields">
                    <input
                      className="form-input"
                      placeholder="이름 (예: 관객 웅성임)"
                      value={amb.label}
                      onChange={(e) => updateAmbient(amb.key, { label: e.target.value })}
                    />
                    {amb.audio ? (
                      <audio controls src={amb.audio} preload="metadata" style={{ width: '100%' }} />
                    ) : null}
                    <div className="svn-speaker__row">
                      <label className="file-input-label svn-speaker__file">
                        {busyAmbient === amb.key
                          ? '업로드 중…'
                          : amb.audio
                            ? '음원 교체'
                            : '음원 선택'}
                        <input
                          type="file"
                          accept="audio/*"
                          hidden
                          disabled={busyAmbient === amb.key}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleAmbientFile(amb.key, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-del"
                        style={{ padding: '3px 8px' }}
                        onClick={() => removeAmbient(amb.key)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="lh-dialogue-editor__tool" onClick={addAmbient}>
              + 환경음 추가
            </button>
          </section>
      ) : null}

      {tab === 'handout' && lines.length > 0 ? (
          <section className="svn-editor__block">
            <div className="lh-dialogue-block__label">핸드아웃 (소품 · 증거)</div>
            <p className="lh-dialogue-editor__hint">
              편지·사진 같은 이미지를 등록해두면, 대사 줄에서 띄우거나 숨길 수 있어요. 한 번 띄우면 「숨기기」를
              고른 줄까지 계속 유지됩니다 (BGM과 동일). 위치·크기는 아래에서 맞추거나, 재생 중 ESC → 위치
              조정으로도 저장됩니다.
            </p>
            <div className="svn-editor__speakers">
              {handouts.map((ho) => (
                <div className="svn-speaker" key={ho.key}>
                  <div className="svn-speaker__thumb">
                    {ho.image ? (
                      <img src={ho.image} alt="" />
                    ) : (
                      <span className="svn-speaker__swatch" style={{ background: '#3a3226' }} />
                    )}
                  </div>
                  <div className="svn-speaker__fields">
                    <input
                      className="form-input"
                      placeholder="이름 (예: 찢어진 편지)"
                      value={ho.label}
                      onChange={(e) => updateHandout(ho.key, { label: e.target.value })}
                    />
                    <label className="file-input-label svn-speaker__file">
                      {busyHandout === ho.key ? '업로드 중…' : ho.image ? '이미지 교체' : '이미지 선택'}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={busyHandout === ho.key}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleHandoutFile(ho.key, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-del"
                      style={{ alignSelf: 'flex-start', padding: '3px 8px' }}
                      onClick={() => removeHandout(ho.key)}
                    >
                      삭제
                    </button>
                    {ho.image ? (
                      <ScenarioVnHandoutLayoutPreview
                        image={ho.image}
                        layout={ho.layout}
                        onChange={(layout) => updateHandout(ho.key, { layout })}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="lh-dialogue-editor__tool" onClick={addHandout}>
              + 핸드아웃 추가
            </button>
          </section>
      ) : null}

      {tab === 'dice' && lines.length > 0 ? (
        <section className="svn-editor__block">
          <div className="lh-dialogue-block__label">다이스 효과음</div>
          <p className="lh-dialogue-editor__hint">
            굴림음은 주사위가 구르기 시작할 때, 결과음은 성공·실패 문구가 뜰 때 재생됩니다. 결과음은
            극단적 성공·대성공·성공·실패·대실패마다 따로 지정할 수 있어요.
          </p>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">기본 · 굴림 효과음</label>
            <select
              className="form-input"
              value={diceRollSfx}
              onChange={(e) => setDiceRollSfx(e.target.value)}
            >
              <option value="">없음</option>
              {diceSfxList.map((d) => (
                <option key={d.key} value={d.key} disabled={!d.audio}>
                  {d.label || d.key}
                  {!d.audio ? ' (음원 없음)' : ''}
                </option>
              ))}
            </select>
            <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 0' }}>
              주사위 연출이 시작될 때 재생됩니다.
            </p>
          </div>

          <div className="lh-dialogue-block__label" style={{ marginTop: 4 }}>
            기본 · 결과 효과음 (판정별)
          </div>
          <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 10px' }}>
            판정 문구가 나타날 때, 해당 종류에 맞춰 재생됩니다.
          </p>
          {DICE_RESULT_TONE_OPTIONS.map(({ tone, label }) => (
            <div className="form-group" key={tone} style={{ marginBottom: 10 }}>
              <label className="form-label">{label}</label>
              <select
                className="form-input"
                value={diceResultSfxByTone[tone] || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setDiceResultSfxByTone((prev) => {
                    const next = { ...prev };
                    if (v) next[tone] = v;
                    else delete next[tone];
                    return next;
                  });
                }}
              >
                <option value="">없음</option>
                {diceSfxList.map((d) => (
                  <option key={d.key} value={d.key} disabled={!d.audio}>
                    {d.label || d.key}
                    {!d.audio ? ' (음원 없음)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label">기타 판정 폴백 (선택)</label>
            <select
              className="form-input"
              value={diceResultSfx}
              onChange={(e) => setDiceResultSfx(e.target.value)}
            >
              <option value="">없음</option>
              {diceSfxList.map((d) => (
                <option key={d.key} value={d.key} disabled={!d.audio}>
                  {d.label || d.key}
                  {!d.audio ? ' (음원 없음)' : ''}
                </option>
              ))}
            </select>
            <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 0' }}>
              위 5종에 해당하지 않거나, 해당 종류가 비어 있을 때 씁니다.
            </p>
          </div>

          <div className="lh-dialogue-block__label" style={{ marginTop: 8 }}>
            등록된 효과음
          </div>
          <div className="svn-editor__speakers">
            {diceSfxList.map((d) => (
              <div className="svn-speaker" key={d.key}>
                <div className="svn-speaker__fields">
                  <input
                    className="form-input"
                    placeholder="이름 (예: 주사위 굴림)"
                    value={d.label}
                    onChange={(e) => updateDiceSfx(d.key, { label: e.target.value })}
                  />
                  {d.audio ? (
                    <audio controls src={d.audio} preload="metadata" style={{ width: '100%' }} />
                  ) : null}
                  <div className="svn-speaker__row">
                    <label className="file-input-label svn-speaker__file">
                      {busyDiceSfx === d.key
                        ? '업로드 중…'
                        : d.audio
                          ? '음원 교체'
                          : '음원 선택'}
                      <input
                        type="file"
                        accept="audio/*"
                        hidden
                        disabled={busyDiceSfx === d.key}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleDiceSfxFile(d.key, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-del"
                      style={{ padding: '3px 8px' }}
                      onClick={() => removeDiceSfx(d.key)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="lh-dialogue-editor__tool" onClick={addDiceSfx}>
            + 다이스 효과음 추가
          </button>
        </section>
      ) : null}

      {lines.length > 0 ? (
          <section
            className="svn-editor__block"
            hidden={tab !== 'stand'}
            style={tab !== 'stand' ? { display: 'none' } : undefined}
          >
            <div className="lh-dialogue-block__label">스탠딩 (등장인원 · 위치)</div>
            <p className="lh-dialogue-editor__hint">
              재생은 등장 순으로 왼쪽→중앙→오른쪽 자리를 배정합니다(3명 이하). 4명 이상은 군중1~5
              버전으로 미세 조정할 수 있고, 왼·중·오 버전과는 따로 저장됩니다. 대사 줄에서 자리·등장
              순서도 지정할 수 있어요.
            </p>
            <div className="svn-editor__maxstage">
              <span className="svn-editor__maxstage-label">기본 동시 등장 인원</span>
              {(
                [
                  { value: 1 as const, label: '1명' },
                  { value: 2 as const, label: '2명' },
                  { value: 3 as const, label: '3명' },
                  { value: 4 as const, label: '4명' },
                  { value: 5 as const, label: '5명' },
                  { value: 'all' as const, label: '전체' },
                ] as const
              ).map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={`lh-dialogue-chip${maxOnStage === opt.value ? ' is-active' : ''}`}
                  onClick={() => setMaxOnStage(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
              <span className="svn-editor__maxstage-hint">
                {maxOnStage === 'all'
                  ? '스프라이트 있는 화자는 전원 동시에 화면에 남아요. 인원이 많으면 간격·크기를 자동으로 줄여 화면 안에 맞춥니다.'
                  : '이 인원을 넘으면 가장 오래전에 말한 인물부터 화면에서 빠지고, 새로 말하는 인물이 그 자리를 채워요. 대사 줄에서 인원을 따로 바꿀 수도 있어요.'}
              </span>
            </div>
            <ScenarioVnStandEditor
              ref={standEditorRef}
              speakers={speakers}
              onUpdateSpeaker={updateSpeaker}
              onCommitStandPoses={commitStandPoses}
            />
          </section>
      ) : null}

      {tab === 'loading' && lines.length > 0 ? (
        <section className="svn-editor__block">
          <div className="lh-dialogue-block__label">챕터 로딩창</div>
          <p className="lh-dialogue-editor__hint">
            챕터카드마다 앞(직전)·뒤(직후) 검정 로딩을 따로 켤 수 있어요. 약 4초 유지 후 페이드되며,
            BGM 전환 텀으로도 쓸 수 있습니다.
          </p>
          {lines.filter((l) => l.effect === 'titlecard').length === 0 ? (
            <p className="lh-dialogue-editor__hint">아직 챕터카드가 없어요. 대사 탭에서 챕터를 추가해 주세요.</p>
          ) : (
            <ul className="svn-loading-list">
              {lines
                .filter((l) => l.effect === 'titlecard')
                .map((line, idx) => (
                  <li key={line.id} className="svn-loading-row">
                    <div className="svn-loading-row__meta">
                      <span className="svn-loading-row__idx">CHAPTER {idx + 1}</span>
                      <strong>{line.titleText?.trim() || '(제목 없음)'}</strong>
                      {line.titleSubtext?.trim() ? (
                        <em>{line.titleSubtext.trim()}</em>
                      ) : null}
                    </div>
                    <div className="svn-loading-row__toggles">
                      <label className="svn-chapter-loading svn-chapter-loading--compact">
                        <input
                          type="checkbox"
                          checked={Boolean(line.chapterLoadingBefore)}
                          onChange={(e) =>
                            updateLine(line.id, {
                              chapterLoadingBefore: e.target.checked ? true : undefined,
                            })
                          }
                        />
                        <span>
                          <strong>챕터 앞</strong>
                          <em>챕터카드 직전</em>
                        </span>
                      </label>
                      <label className="svn-chapter-loading svn-chapter-loading--compact">
                        <input
                          type="checkbox"
                          checked={Boolean(line.chapterLoadingAfter)}
                          onChange={(e) =>
                            updateLine(line.id, {
                              chapterLoadingAfter: e.target.checked ? true : undefined,
                            })
                          }
                        />
                        <span>
                          <strong>챕터 뒤</strong>
                          <em>챕터카드 직후 · 다음 줄 전</em>
                        </span>
                      </label>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'lines' && lines.length > 0 ? (
        <>
          <section className="svn-editor__block">
            <div className="svn-editor__stats">
              <span>총 {stats.total}줄</span>
              <span>화자 {stats.speakers}명</span>
              <span>다이스 {stats.dice}회</span>
              <span>나레이션 {stats.narr}줄</span>
              <span>챕터카드 {stats.chapters}개</span>
              <span className={stats.missing ? 'is-warn' : ''}>이미지 없음 {stats.missing}명</span>
            </div>
            <div className="svn-editor__filters">
              {(['all', 'dice', 'narration', 'chapter', 'noSprite'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`lh-dialogue-chip${filter === f ? ' is-active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all'
                    ? '전체'
                    : f === 'dice'
                      ? '다이스만'
                      : f === 'narration'
                        ? '나레이션만'
                        : f === 'chapter'
                          ? '챕터카드만'
                          : '이미지 없는 화자'}
                </button>
              ))}
            </div>
          </section>

          <section className="svn-editor__block">
            <div className="lh-dialogue-block__label">대사 편집</div>
            <div className="svn-editor__spellbar">
              <button
                type="button"
                className="lh-dialogue-editor__tool"
                disabled={spellBusy || !lines.length}
                onClick={() => void runSpellcheck()}
              >
                {spellBusy ? '맞춤법 검사 중…' : '대사 일괄 맞춤법 검사'}
              </button>
              {spellResults?.some((r) => r.suggestedText) ? (
                <button
                  type="button"
                  className="lh-dialogue-editor__tool"
                  onClick={applyAllSpellSuggestions}
                >
                  제안 전부 적용
                </button>
              ) : null}
            </div>
            {spellResults && spellResults.some((r) => r.issues.some((i) => i.token)) ? (
              <div className="svn-editor__spelllist">
                {spellResults
                  .filter((r) => r.issues.some((i) => i.token))
                  .map((r) => {
                    const line = lines.find((l) => l.id === r.lineId);
                    return (
                      <div key={r.lineId} className="svn-editor__spellitem">
                        <div className="svn-editor__spellmeta">
                          <strong>{previewText(line?.text || r.text, 36)}</strong>
                          <ul>
                            {r.issues
                              .filter((i) => i.token)
                              .map((i, idx) => (
                                <li key={`${r.lineId}-${idx}`}>{i.message}</li>
                              ))}
                          </ul>
                        </div>
                        {r.suggestedText ? (
                          <button
                            type="button"
                            className="lh-dialogue-chip"
                            onClick={() => applySpellSuggestion(r.lineId, r.suggestedText!)}
                          >
                            교정 적용
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            ) : null}
            <div
              ref={listRef}
              className={`lh-dialogue-list${dragFrom != null ? ' is-sorting' : ''}`}
            >
              {visibleLines.map((line, visIndex) => {
                const open = openLine.has(line.id);
                const sp = speakerMap.get(line.speakerKey);
                const shiftY = slideOffset(visIndex);

                if (line.effect === 'titlecard') {
                  return (
                    <article
                      key={line.id}
                      ref={(el) => {
                        rowRefs.current[visIndex] = el;
                      }}
                      className={`lh-dialogue-node svn-editor__chapnode${open ? ' is-open' : ' is-collapsed'}${
                        dragFrom === visIndex ? ' is-dragging' : ''
                      }${
                        dragOver === visIndex && dragFrom !== null && dragFrom !== visIndex
                          ? ' is-drop-slot'
                          : ''
                      }`}
                      style={
                        dragFrom != null
                          ? {
                              transform:
                                dragFrom === visIndex ? undefined : `translateY(${shiftY}px)`,
                            }
                          : undefined
                      }
                    >
                      <header className="lh-dialogue-node__bar">
                        <button
                          type="button"
                          className="lh-dialogue-node__drag"
                          title="드래그해서 순서 변경"
                          aria-label="드래그해서 순서 변경"
                          onPointerDown={(e) => onLineDragPointerDown(e, visIndex)}
                          onPointerMove={onLineDragPointerMove}
                          onPointerUp={onLineDragPointerUp}
                          onPointerCancel={onLineDragPointerUp}
                        >
                          ⋮⋮
                        </button>
                        <div className="svn-editor__insertcol">
                          <button
                            type="button"
                            className="svn-editor__sqbtn"
                            title="이 줄 앞에 챕터카드 삽입"
                            onClick={() => insertChapterBefore(line.id)}
                          >
                            챕
                          </button>
                          <button
                            type="button"
                            className="svn-editor__sqbtn"
                            title="이 줄 아래에 대사 추가"
                            onClick={() => insertDialogueAfter(line.id)}
                          >
                            대
                          </button>
                        </div>
                        <button
                          type="button"
                          className="lh-dialogue-node__toggle"
                          onClick={() => toggleLine(line.id)}
                          aria-expanded={open}
                        >
                          <span className="lh-dialogue-node__chevron">{open ? '▼' : '▶'}</span>
                          <span className="lh-dialogue-node__summary">
                            <em>챕터카드</em>
                            <span>{line.titleText?.trim() || '(제목 없음)'}</span>
                          </span>
                        </button>
                      </header>
                      {open ? (
                        <div className="lh-dialogue-node__body">
                          <section className="lh-dialogue-block">
                            <div className="lh-dialogue-block__label">챕터 제목</div>
                            <input
                              className="form-input"
                              placeholder="예: 1장. 어항 속"
                              value={line.titleText || ''}
                              onChange={(e) => updateLine(line.id, { titleText: e.target.value })}
                            />
                            <div className="lh-dialogue-block__label" style={{ marginTop: 10 }}>
                              영문 소제목 (선택)
                            </div>
                            <input
                              className="form-input"
                              placeholder="예: CHAPTER ONE"
                              value={line.titleSubtext || ''}
                              onChange={(e) => updateLine(line.id, { titleSubtext: e.target.value })}
                            />
                            <div className="lh-dialogue-block__label" style={{ marginTop: 10 }}>
                              챕터 효과음 (선택)
                            </div>
                            {line.sfx ? (
                              <div className="lh-dialogue-node__voice-preview">
                                <audio controls src={line.sfx} preload="metadata" />
                                <button
                                  type="button"
                                  className="btn-del"
                                  style={{ padding: '3px 8px', marginTop: 6 }}
                                  onClick={() => updateLine(line.id, { sfx: undefined })}
                                >
                                  효과음 제거
                                </button>
                              </div>
                            ) : null}
                            {onUploadSfx ? (
                              <label className="file-input-label lh-dialogue-node__file">
                                {uploadBusy || busyLine === line.id
                                  ? '업로드 중…'
                                  : line.sfx
                                    ? '효과음 교체'
                                    : '효과음 파일 선택'}
                                <input
                                  type="file"
                                  accept="audio/*"
                                  hidden
                                  disabled={uploadBusy || busyLine === line.id}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleSfxFile(line.id, f);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            ) : (
                              <input
                                className="form-input"
                                placeholder="효과음 URL (선택)"
                                value={line.sfx || ''}
                                onChange={(e) => updateLine(line.id, { sfx: e.target.value || undefined })}
                              />
                            )}
                            <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                              화면이 암전되고 소제목 → 골드 장식선 → 챕터 제목 순으로 뜬 뒤 자동으로 다음 줄로
                              넘어가요. 대사는 필요 없어요. 로딩 앞·뒤는 「로딩창」 탭에서 조절해요.
                            </p>
                          </section>
                          <button
                            type="button"
                            className="btn-del lh-dialogue-node__delete"
                            onClick={() => removeLine(line.id)}
                          >
                            챕터카드 삭제
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                }

                return (
                  <article
                    key={line.id}
                    ref={(el) => {
                      rowRefs.current[visIndex] = el;
                    }}
                    className={`lh-dialogue-node${open ? ' is-open' : ' is-collapsed'}${
                      dragFrom === visIndex ? ' is-dragging' : ''
                    }${
                      dragOver === visIndex && dragFrom !== null && dragFrom !== visIndex
                        ? ' is-drop-slot'
                        : ''
                    }`}
                    style={
                      dragFrom != null
                        ? {
                            transform: dragFrom === visIndex ? undefined : `translateY(${shiftY}px)`,
                          }
                        : undefined
                    }
                  >
                    <header className="lh-dialogue-node__bar">
                      <button
                        type="button"
                        className="lh-dialogue-node__drag"
                        title="드래그해서 순서 변경"
                        aria-label="드래그해서 순서 변경"
                        onPointerDown={(e) => onLineDragPointerDown(e, visIndex)}
                        onPointerMove={onLineDragPointerMove}
                        onPointerUp={onLineDragPointerUp}
                        onPointerCancel={onLineDragPointerUp}
                      >
                        ⋮⋮
                      </button>
                      <div className="svn-editor__insertcol">
                        <button
                          type="button"
                          className="svn-editor__sqbtn"
                          title="이 줄 앞에 챕터카드 삽입"
                          onClick={() => insertChapterBefore(line.id)}
                        >
                          챕
                        </button>
                        <button
                          type="button"
                          className="svn-editor__sqbtn"
                          title="이 줄 아래에 대사 추가"
                          onClick={() => insertDialogueAfter(line.id)}
                        >
                          대
                        </button>
                      </div>
                      <button
                        type="button"
                        className="lh-dialogue-node__toggle"
                        onClick={() => toggleLine(line.id)}
                        aria-expanded={open}
                      >
                        <span className="lh-dialogue-node__chevron">{open ? '▼' : '▶'}</span>
                        <span className="lh-dialogue-node__summary">
                          <em>{sp?.treatAsNarration || !line.speakerKey ? '나레이션' : sp?.displayName || line.speakerKey}</em>
                          <span>{previewText(line.text)}</span>
                          {line.effect === 'diceRoll' && <span className="lh-dialogue-node__badge">다이스</span>}
                          {line.location?.trim() && (
                            <span className="lh-dialogue-node__badge lh-dialogue-node__badge--loc">
                              {line.location.trim()}
                            </span>
                          )}
                          {line.missionUpdate && (
                            <span className="lh-dialogue-node__badge lh-dialogue-node__badge--loc">미션</span>
                          )}
                          {line.handout != null &&
                            line.handout !== '' &&
                            line.handout !== 'none' &&
                            line.handout !== '__none__' && (
                            <span className="lh-dialogue-node__badge lh-dialogue-node__badge--loc">HO</span>
                          )}
                          {(line.handout === null ||
                            line.handout === 'none' ||
                            line.handout === '__none__') && (
                            <span className="lh-dialogue-node__badge">HO숨김</span>
                          )}
                          {line.hideStandings === true && (
                            <span className="lh-dialogue-node__badge">스탠딩숨김</span>
                          )}
                          {line.hideStandings === false && (
                            <span className="lh-dialogue-node__badge lh-dialogue-node__badge--loc">스탠딩표시</span>
                          )}
                          {line.maxOnStage != null && (
                            <span className="lh-dialogue-node__badge lh-dialogue-node__badge--loc">
                              {line.maxOnStage === 'all' ? '전원' : `${line.maxOnStage}명`}
                            </span>
                          )}
                        </span>
                      </button>
                    </header>

                    {open && (
                      <div className="lh-dialogue-node__body">
                        <section className="lh-dialogue-block">
                          <div className="lh-dialogue-block__label">화자</div>
                          <select
                            className="form-input"
                            value={line.speakerKey}
                            onChange={(e) => updateLine(line.id, { speakerKey: e.target.value })}
                          >
                            <option value="">(나레이션)</option>
                            {speakers.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.displayName}
                              </option>
                            ))}
                          </select>
                        </section>

                        <section className="lh-dialogue-block">
                          <div className="lh-dialogue-block__label">대사</div>
                          <textarea
                            className="form-input lh-dialogue-node__text"
                            rows={3}
                            value={line.text}
                            onChange={(e) => updateLine(line.id, { text: e.target.value })}
                          />
                          <div className="lh-dialogue-block__label" style={{ marginTop: 10 }}>
                            배경 · 장소 · BGM
                          </div>
                          <div className="svn-editor__grid3">
                            <select
                              className="form-input"
                              value={line.background || ''}
                              onChange={(e) => {
                                const key = e.target.value || undefined;
                                const bg = key ? backgrounds.find((b) => b.key === key) : undefined;
                                const announce = bg && bg.announceLocation !== false;
                                updateLine(line.id, {
                                  background: key,
                                  location: announce
                                    ? bg?.label?.trim() || undefined
                                    : undefined,
                                });
                              }}
                            >
                              <option value="">배경/장소 (이전과 동일)</option>
                              {backgrounds.map((bg) => (
                                <option key={bg.key} value={bg.key}>
                                  {bg.label || '(이름 없음)'}
                                  {bg.announceLocation === false ? ' · 배너 없음' : ''}
                                </option>
                              ))}
                            </select>
                            <select
                              className="form-input"
                              value={
                                line.bgm === null || line.bgm === 'none' ? '__none__' : line.bgm || ''
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                updateLine(line.id, {
                                  bgm:
                                    v === ''
                                      ? undefined
                                      : v === '__none__'
                                        ? 'none'
                                        : v,
                                });
                              }}
                            >
                              <option value="">BGM (이전과 동일)</option>
                              <option value="__none__">끄기 (무음)</option>
                              {bgms.map((b) => (
                                <option key={b.key} value={b.key}>
                                  {b.label || '(이름 없음)'}
                                </option>
                              ))}
                            </select>
                            <select
                              className="form-input"
                              value={
                                line.ambient === null || line.ambient === 'none'
                                  ? '__none__'
                                  : line.ambient || ''
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                updateLine(line.id, {
                                  ambient:
                                    v === ''
                                      ? undefined
                                      : v === '__none__'
                                        ? 'none'
                                        : v,
                                });
                              }}
                            >
                              <option value="">환경음 (이전과 동일)</option>
                              <option value="__none__">끄기</option>
                              {ambients.map((a) => (
                                <option key={a.key} value={a.key}>
                                  {a.label || '(이름 없음)'}
                                </option>
                              ))}
                            </select>
                            <input
                              className="form-input"
                              placeholder="장소 배너 문구 (비우면 안 뜸)"
                              value={line.location || ''}
                              onChange={(e) => updateLine(line.id, { location: e.target.value })}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                updateLine(line.id, { location: v || undefined });
                              }}
                            />
                          </div>
                          <label className="svn-editor__check" style={{ marginTop: 8 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(line.location?.trim())}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const bg = line.background
                                    ? backgrounds.find((b) => b.key === line.background)
                                    : undefined;
                                  updateLine(line.id, {
                                    location:
                                      bg?.label?.trim() || line.location?.trim() || '장소',
                                  });
                                } else {
                                  updateLine(line.id, { location: undefined });
                                }
                              }}
                            />
                            이 줄에서 장소 배너 표시
                          </label>
                          <div className="lh-dialogue-block__label" style={{ marginTop: 10 }}>
                            화면 비네트
                          </div>
                          <select
                            className="form-input"
                            value={
                              line.vignette === true
                                ? 'on'
                                : line.vignette === false
                                  ? 'off'
                                  : ''
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              updateLine(line.id, {
                                vignette:
                                  v === 'on' ? true : v === 'off' ? false : undefined,
                              });
                            }}
                          >
                            <option value="">이전과 동일</option>
                            <option value="on">이 줄부터 켜기</option>
                            <option value="off">이 줄부터 끄기</option>
                          </select>
                          <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                            시작 줄에서만 「켜기」, 끝 줄에서만 「끄기」를 고르면 됩니다. 사이는 「이전과
                            동일」로 두면 유지됩니다.
                          </p>
                          <div className="lh-dialogue-block__label" style={{ marginTop: 10 }}>
                            시야 흐림
                          </div>
                          <select
                            className="form-input"
                            value={
                              line.visionBlur === true
                                ? 'on'
                                : line.visionBlur === false
                                  ? 'off'
                                  : ''
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              updateLine(line.id, {
                                visionBlur:
                                  v === 'on' ? true : v === 'off' ? false : undefined,
                              });
                            }}
                          >
                            <option value="">이전과 동일</option>
                            <option value="on">이 줄부터 켜기</option>
                            <option value="off">이 줄부터 끄기</option>
                          </select>
                          <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                            배경·스탠딩이 뿌옇게 보입니다. 「눈 앞이 흐려집니다」 같은 장면에서 켜고, 풀릴
                            줄에서 끄면 됩니다.
                          </p>
                          {backgrounds.length === 0 ? (
                            <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                              「배경&amp;장소」 탭에서 먼저 장소를 등록하면 여기서 고를 수 있어요.
                            </p>
                          ) : (
                            <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                              배경을 고르면 「장소 배너 표시」가 켜진 항목만 배너 문구가 채워집니다. 체크를
                              끄거나 문구를 비우면 배경만 바뀝니다.
                            </p>
                          )}
                        </section>

                        {line.diceRoll && (
                          <section className="lh-dialogue-block">
                            <div className="lh-dialogue-block__label">다이스 판정 (자동 인식됨)</div>
                            <p className="lh-dialogue-editor__hint" style={{ margin: 0 }}>
                              {line.diceRoll.skill} · CC≤{line.diceRoll.target} · 결과 {line.diceRoll.roll} ·{' '}
                              {line.diceRoll.result}
                            </p>
                            {diceSfxList.length > 0 ? (
                              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                                <label className="form-label">이 판정 · 굴림 효과음</label>
                                <select
                                  className="form-input"
                                  value={line.diceRoll.sfx || ''}
                                  onChange={(e) =>
                                    updateLine(line.id, {
                                      diceRoll: {
                                        ...line.diceRoll!,
                                        sfx: e.target.value || undefined,
                                      },
                                    })
                                  }
                                >
                                  <option value="">
                                    기본 사용
                                    {diceRollSfx
                                      ? ` (${diceSfxList.find((d) => d.key === diceRollSfx)?.label || diceRollSfx})`
                                      : ' (없음)'}
                                  </option>
                                  {diceSfxList.map((d) => (
                                    <option key={d.key} value={d.key} disabled={!d.audio}>
                                      {d.label || d.key}
                                    </option>
                                  ))}
                                </select>
                                <label className="form-label">이 판정 · 결과 효과음 (문구 등장 시)</label>
                                <select
                                  className="form-input"
                                  value={line.diceRoll.resultSfx || ''}
                                  onChange={(e) =>
                                    updateLine(line.id, {
                                      diceRoll: {
                                        ...line.diceRoll!,
                                        resultSfx: e.target.value || undefined,
                                      },
                                    })
                                  }
                                >
                                  <option value="">
                                    판정별 기본 사용
                                    {diceResultSfx || Object.keys(diceResultSfxByTone).length
                                      ? ''
                                      : ' (없음)'}
                                  </option>
                                  {diceSfxList.map((d) => (
                                    <option key={d.key} value={d.key} disabled={!d.audio}>
                                      {d.label || d.key}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <p className="lh-dialogue-editor__hint" style={{ margin: '8px 0 0' }}>
                                「다이스」 탭에서 효과음을 등록하면 여기서 고를 수 있어요.
                              </p>
                            )}
                          </section>
                        )}

                        <details className="lh-dialogue-extras">
                          <summary>연출 · 표정 · 음성 (선택)</summary>
                          <div className="lh-dialogue-extras__body">
                            <div className="form-group" style={{ marginBottom: 12 }}>
                              <label className="form-label">캐릭터 스탠딩</label>
                              <select
                                className="form-input"
                                value={
                                  line.hideStandings === true
                                    ? 'hide'
                                    : line.hideStandings === false
                                      ? 'show'
                                      : ''
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateLine(line.id, {
                                    hideStandings:
                                      v === 'hide' ? true : v === 'show' ? false : undefined,
                                  });
                                }}
                              >
                                <option value="">이전과 동일</option>
                                <option value="hide">이 줄부터 숨기기</option>
                                <option value="show">이 줄부터 다시 표시</option>
                              </select>
                              <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 0' }}>
                                한 번 숨기면 「다시 표시」를 고른 줄까지 계속 숨겨집니다. 자리는 기억됩니다.
                              </p>
                              <label className="form-label" style={{ marginTop: 10 }}>
                                동시 등장 인원
                              </label>
                              <select
                                className="form-input"
                                value={
                                  line.maxOnStage === undefined || line.maxOnStage === null
                                    ? ''
                                    : String(line.maxOnStage)
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateLine(line.id, {
                                    maxOnStage:
                                      v === ''
                                        ? undefined
                                        : v === 'all'
                                          ? 'all'
                                          : (Number(v) as 1 | 2 | 3 | 4 | 5),
                                  });
                                }}
                              >
                                <option value="">이전과 동일 (기본 {maxOnStage === 'all' ? '전체' : `${maxOnStage}명`})</option>
                                <option value="1">1명</option>
                                <option value="2">2명</option>
                                <option value="3">3명</option>
                                <option value="4">4명</option>
                                <option value="5">5명</option>
                                <option value="all">전체</option>
                              </select>
                              <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 0' }}>
                                이 줄부터 무대에 남을 최대 인원입니다. 4명 이상은 가로 분산(군중 배치)이며
                                왼·중·오 저장 포즈는 유지됩니다.
                              </p>
                              <label className="form-label" style={{ marginTop: 12 }}>
                                자리 순서 (왼→오 / 1→N)
                              </label>
                              {(() => {
                                const cast = speakers.filter((s) => s.sprite?.trim());
                                const slotsN =
                                  typeof line.maxOnStage === 'number'
                                    ? line.maxOnStage
                                    : line.maxOnStage === 'all'
                                      ? Math.min(5, Math.max(3, cast.length))
                                      : typeof maxOnStage === 'number'
                                        ? maxOnStage
                                        : Math.min(5, Math.max(3, cast.length));
                                const n = Math.min(5, Math.max(1, slotsN));
                                const order = line.stageOrder ?? [];
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {Array.from({ length: n }, (_, i) => (
                                      <select
                                        key={`stage-order-${line.id}-${i}`}
                                        className="form-input"
                                        value={order[i] || ''}
                                        onChange={(e) => {
                                          const next = Array.from({ length: n }, (_, j) =>
                                            j === i
                                              ? e.target.value
                                              : line.stageOrder?.[j] || '',
                                          );
                                          const hasAny = next.some((k) => k.trim());
                                          updateLine(line.id, {
                                            stageOrder: hasAny ? next : undefined,
                                          });
                                        }}
                                      >
                                        <option value="">
                                          {i + 1}번 — 자동
                                        </option>
                                        {cast.map((s) => (
                                          <option key={s.key} value={s.key}>
                                            {i + 1}번 · {s.displayName || s.key}
                                          </option>
                                        ))}
                                      </select>
                                    ))}
                                    <button
                                      type="button"
                                      className="btn-del"
                                      style={{ alignSelf: 'flex-start', padding: '4px 10px' }}
                                      onClick={() =>
                                        updateLine(line.id, { stageOrder: undefined })
                                      }
                                    >
                                      자리 순서 비우기 (등장순 자동)
                                    </button>
                                  </div>
                                );
                              })()}
                              <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 0' }}>
                                이 줄부터 무대 자리를 고정합니다. 비우면 말할 때마다 자동 배정입니다.
                              </p>
                              <label className="form-label" style={{ marginTop: 12 }}>
                                등장 순서 (연출)
                              </label>
                              {(() => {
                                const cast = speakers.filter((s) => s.sprite?.trim());
                                const n = Math.min(
                                  5,
                                  Math.max(
                                    line.stageOrder?.length || 0,
                                    typeof line.maxOnStage === 'number' ? line.maxOnStage : 3,
                                  ),
                                );
                                const order = line.stageEnterOrder ?? [];
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {Array.from({ length: Math.max(n, 1) }, (_, i) => (
                                      <select
                                        key={`enter-order-${line.id}-${i}`}
                                        className="form-input"
                                        value={order[i] || ''}
                                        onChange={(e) => {
                                          const next = Array.from({ length: n }, (_, j) =>
                                            j === i
                                              ? e.target.value
                                              : line.stageEnterOrder?.[j] || '',
                                          );
                                          const hasAny = next.some((k) => k.trim());
                                          updateLine(line.id, {
                                            stageEnterOrder: hasAny ? next : undefined,
                                          });
                                        }}
                                      >
                                        <option value="">
                                          {i + 1}번째 등장 — 자동
                                        </option>
                                        {cast.map((s) => (
                                          <option key={s.key} value={s.key}>
                                            {i + 1}번째 · {s.displayName || s.key}
                                          </option>
                                        ))}
                                      </select>
                                    ))}
                                    <button
                                      type="button"
                                      className="btn-del"
                                      style={{ alignSelf: 'flex-start', padding: '4px 10px' }}
                                      onClick={() =>
                                        updateLine(line.id, { stageEnterOrder: undefined })
                                      }
                                    >
                                      등장 순서 비우기
                                    </button>
                                  </div>
                                );
                              })()}
                              <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 0' }}>
                                같은 줄에 여러 명이 처음 등장할 때 순서대로 나타납니다. 비우면 자리
                                순서(또는 자동)를 따릅니다.
                              </p>
                            </div>
                            <label
                              className="form-check"
                              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(line.resetStage)}
                                onChange={(e) =>
                                  updateLine(line.id, {
                                    resetStage: e.target.checked ? true : undefined,
                                  })
                                }
                              />
                              <span>
                                무대 리셋
                                <span className="lh-dialogue-editor__hint" style={{ display: 'block', margin: '2px 0 0' }}>
                                  여기서부터 한 명씩 새로 등장
                                </span>
                              </span>
                            </label>
                            <div className="lh-dialogue-node__grid">
                              <div className="form-group">
                                <label className="form-label">몸 움직임</label>
                                <select
                                  className="form-input"
                                  value={normalizeMotion(line.motion) || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    updateLine(line.id, {
                                      motion: isDialogueMotion(v) ? v : '',
                                    });
                                  }}
                                >
                                  <option value="">없음</option>
                                  {DIALOGUE_MOTION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group">
                                <label className="form-label">머리 위 효과</label>
                                <select
                                  className="form-input"
                                  value={line.fx || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    updateLine(line.id, {
                                      fx: isDialogueFx(v) ? v : '',
                                    });
                                  }}
                                >
                                  <option value="">없음</option>
                                  {DIALOGUE_FX_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group">
                                <label className="form-label">핸드아웃</label>
                                <select
                                  className="form-input"
                                  value={
                                    line.handout === null ||
                                    line.handout === 'none' ||
                                    line.handout === '__none__'
                                      ? '__none__'
                                      : line.handout || ''
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    updateLine(line.id, {
                                      /* Firebase 는 null 키를 지움 — 숨기기는 'none' 문자열로 저장 */
                                      handout:
                                        v === '' ? undefined : v === '__none__' ? 'none' : v,
                                    });
                                  }}
                                >
                                  <option value="">이전과 동일</option>
                                  <option value="__none__">숨기기</option>
                                  {handouts.map((h) => (
                                    <option key={h.key} value={h.key}>
                                      {h.label || '(이름 없음)'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group">
                                <label className="form-label">표정 이미지</label>
                                {line.expression ? (
                                  <img src={line.expression} alt="" className="lh-dialogue-node__expr-preview" />
                                ) : null}
                                <input
                                  className="form-input"
                                  placeholder="URL (선택)"
                                  value={line.expression || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    updateLine(line.id, {
                                      expression: v,
                                      ...(v.trim()
                                        ? {}
                                        : {
                                            expressionPersist: undefined,
                                            expressionUntilLineId: undefined,
                                          }),
                                    });
                                  }}
                                />
                                {line.expression?.trim() ? (
                                  <select
                                    className="form-input"
                                    style={{ marginTop: 6 }}
                                    value={expressionHoldSelectValue(line)}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v === 'once') {
                                        updateLine(line.id, {
                                          expressionPersist: false,
                                          expressionUntilLineId: undefined,
                                        });
                                      } else if (v === 'keep') {
                                        updateLine(line.id, {
                                          expressionPersist: true,
                                          expressionUntilLineId: undefined,
                                        });
                                      } else if (v.startsWith('until:')) {
                                        updateLine(line.id, {
                                          expressionPersist: true,
                                          expressionUntilLineId: v.slice('until:'.length),
                                        });
                                      }
                                    }}
                                  >
                                    <option value="keep">계속 유지</option>
                                    <option value="once">이번 대사만</option>
                                    {laterSameSpeakerLines(line.id, line.speakerKey).map((t) => (
                                      <option key={t.id} value={`until:${t.id}`}>
                                        {lineHoldLabel(t)} 까지
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                {line.expression?.trim() ? (
                                  <p className="lh-dialogue-editor__hint" style={{ margin: '4px 0 0' }}>
                                    같은 화자의 이후 대사를 고르면 그 줄까지 표정을 유지한 뒤 기본
                                    스탠딩으로 돌아갑니다.
                                  </p>
                                ) : null}
                                {onUploadExpression ? (
                                  <label className="file-input-label lh-dialogue-node__file">
                                    {uploadBusy || busyLine === line.id ? '업로드 중…' : '파일 선택'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      hidden
                                      disabled={uploadBusy || busyLine === line.id}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void handleExpressionFile(line.id, f);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                ) : null}
                              </div>
                              <div className="form-group">
                                <label className="form-label">대사 음성</label>
                                {line.voice ? (
                                  <div className="lh-dialogue-node__voice-preview">
                                    <audio controls src={line.voice} preload="metadata" />
                                    <button
                                      type="button"
                                      className="btn-del"
                                      style={{ padding: '3px 8px', marginTop: 6 }}
                                      onClick={() => updateLine(line.id, { voice: '' })}
                                    >
                                      음성 제거
                                    </button>
                                  </div>
                                ) : null}
                                <input
                                  className="form-input"
                                  placeholder="음성 URL (선택)"
                                  value={line.voice || ''}
                                  onChange={(e) => updateLine(line.id, { voice: e.target.value })}
                                />
                                {onUploadVoice ? (
                                  <label className="file-input-label lh-dialogue-node__file">
                                    {uploadBusy || busyLine === line.id ? '업로드 중…' : '음성 파일 선택'}
                                    <input
                                      type="file"
                                      accept="audio/*"
                                      hidden
                                      disabled={uploadBusy || busyLine === line.id}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void handleVoiceFile(line.id, f);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </details>

                        <section className="lh-dialogue-block">
                          <div className="lh-dialogue-block__label">미션 (선택)</div>
                          <div className="svn-editor__grid3">
                            <input
                              className="form-input"
                              placeholder="미션 ID"
                              value={line.missionUpdate?.id || ''}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  missionUpdate: e.target.value
                                    ? {
                                        id: e.target.value,
                                        title: line.missionUpdate?.title || '',
                                        status: line.missionUpdate?.status || 'start',
                                      }
                                    : undefined,
                                })
                              }
                            />
                            <input
                              className="form-input"
                              placeholder="미션 이름"
                              value={line.missionUpdate?.title || ''}
                              onChange={(e) =>
                                line.missionUpdate &&
                                updateLine(line.id, {
                                  missionUpdate: { ...line.missionUpdate, title: e.target.value },
                                })
                              }
                            />
                            <select
                              className="form-input"
                              value={line.missionUpdate?.status || 'start'}
                              onChange={(e) =>
                                line.missionUpdate &&
                                updateLine(line.id, {
                                  missionUpdate: {
                                    ...line.missionUpdate,
                                    status: e.target.value as 'start' | 'complete',
                                  },
                                })
                              }
                              disabled={!line.missionUpdate}
                            >
                              <option value="start">시작 (새 미션)</option>
                              <option value="complete">완료</option>
                            </select>
                          </div>
                          {line.missionUpdate ? (
                            <div style={{ marginTop: 10 }}>
                              <div className="lh-dialogue-block__label">
                                {line.missionUpdate.status === 'complete'
                                  ? '미션 완료 효과음 (선택)'
                                  : '새 미션 효과음 (선택)'}
                              </div>
                              {line.sfx ? (
                                <div className="lh-dialogue-node__voice-preview">
                                  <audio controls src={line.sfx} preload="metadata" />
                                  <button
                                    type="button"
                                    className="btn-del"
                                    style={{ padding: '3px 8px', marginTop: 6 }}
                                    onClick={() => updateLine(line.id, { sfx: undefined })}
                                  >
                                    효과음 제거
                                  </button>
                                </div>
                              ) : null}
                              {onUploadSfx ? (
                                <label className="file-input-label lh-dialogue-node__file">
                                  {uploadBusy || busyLine === line.id
                                    ? '업로드 중…'
                                    : line.sfx
                                      ? '효과음 교체'
                                      : '효과음 파일 선택'}
                                  <input
                                    type="file"
                                    accept="audio/*"
                                    hidden
                                    disabled={uploadBusy || busyLine === line.id}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleSfxFile(line.id, f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              ) : (
                                <input
                                  className="form-input"
                                  placeholder="효과음 URL (선택)"
                                  value={line.sfx || ''}
                                  onChange={(e) =>
                                    updateLine(line.id, { sfx: e.target.value || undefined })
                                  }
                                />
                              )}
                            </div>
                          ) : null}
                          <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                            이 줄에 도달하면 새 미션 / 미션 완료 배너가 뜹니다. 효과음은 배너와 함께 재생돼요.
                          </p>
                        </section>

                        <button
                          type="button"
                          className="btn-del lh-dialogue-node__delete"
                          onClick={() => removeLine(line.id)}
                        >
                          이 줄 삭제
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            <button type="button" className="lh-dialogue-editor__tool" onClick={appendChapterAtEnd}>
              + 챕터카드 맨 끝에 추가
            </button>
          </section>
        </>
      ) : null}

      {ghost && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="lh-dialogue-ghost"
              style={{
                left: ghost.x,
                top: Math.max(8, ghost.y),
                width: ghost.w,
                minHeight: ghost.h,
              }}
              aria-hidden
            >
              <span className="lh-dialogue-ghost__grip">⋮⋮</span>
              <em>{ghost.speaker}</em>
              <span>{ghost.text}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
