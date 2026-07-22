'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { OcEditForm } from '@/components/admin/OcEditForm';
import { creepyFxClass, creepyFxStyle } from '@/lib/oc/creepyFx';
import { DustAtmosphere } from '@/components/shared/DustAtmosphere';
import { useCreepyGlyphScramble } from '@/lib/hooks/useCreepyGlyphScramble';
import { useDocumentVisible } from '@/lib/hooks/useInViewActive';
import { LakeEditModal } from '@/components/ui/LakeEditModal';
import { OcAbilityList } from '@/components/oc/OcAbilityList';
import { OcAuPicker } from '@/components/oc/OcAuPicker';
import { OcFloatingQuotes } from '@/components/oc/OcFloatingQuotes';
import { OcVnDialogue, useVnDialogue } from '@/components/oc/OcVnDialogue';
import { emptyFloatingQuote, normalizeFloatingQuotes } from '@/lib/oc/floatingQuotes';
import { applyCharacterTheme, characterHasBgmTheme, clearCharacterTheme, resolveCharacterTheme } from '@/lib/oc/characterTheme';
import { formatGalleryCredit, gallerySrc, normalizeGalleryItem } from '@/lib/oc/gallery';
import { displayCategory, isTrpgCategory } from '@/lib/oc/categories';
import { buildDetailProfileRows, formatCardTag, formatStatDigits, parseStatPercent } from '@/lib/oc/profile';
import { OcRichText } from '@/lib/oc/richText';
import { lakeNavigate } from '@/lib/lake/routeTransition';
import { setTrpgReturnPath } from '@/lib/lake/trpgReturn';
import { usePairSlotLayoutDrag } from '@/components/pair/usePairSlotLayoutDrag';
import { framedImageStyle, normalizeImageFrame } from '@/lib/shared/imageFrame';
import { uploadImageFile } from '@/lib/r2/client';
import { DIALOGUE_FX_MS, DIALOGUE_MOTION_MS, isDialogueFx, normalizeMotion, ocMotionClass, type DialogueFx, type DialogueMotion } from '@/lib/vn/motions';
import { VnCharBloom, VnCharFx } from '@/components/shared/VnCharFx';
import type { GalleryItem, ImageFrame, OcCharacter, OcFloatingQuote, CharacterRelation, StoryEntry, StoryLog, TouchHoverStyle, TouchZone, TouchZoneLine } from '@/lib/types/character';
import { TouchReactOverlay } from '@/components/pair/TouchReactOverlay';
import { CursorFollowTipHost, CursorTipZone } from '@/components/shared/CursorFollowTip';
import { RiskBadges } from '@/components/shared/RiskBadges';
import { StoryEntryList } from '@/components/shared/StoryEntryList';
import { StoryReader } from '@/components/shared/StoryReader';
import { PreviewCarousel } from '@/components/shared/PreviewCarousel';
import { OcStatHoverPanel } from '@/components/oc/OcStatHoverPanel';
import { HandwritingNoteFlap } from '@/components/pair/HandwritingNoteFlap';
import { hydrateOcStories } from '@/lib/oc/storyEntries';
import { layoutTasteRows, resolveTasteItems } from '@/lib/oc/tasteItems';
import { normalizeTouchHoverStyle, normalizeTouchZones } from '@/lib/pair/touchZones';
import { useTouchPortraitStack, warmTouchPortrait } from '@/lib/oc/useTouchPortraitStack';
import { newId, type TrpgScenario } from '@/lib/types/site-content';

const DEFAULT_OC_GHOST_LAYOUT: ImageFrame = { x: 0, y: 0, scale: 1.12 };
const DEFAULT_OC_DETAIL_LAYOUT: ImageFrame = { x: 0, y: 0, scale: 1 };

function resolveOcGhostLayout(character: OcCharacter): ImageFrame {
  if (character.ghostLayout) return normalizeImageFrame(character.ghostLayout);
  if (character.ghostLayouts?.[0]) return normalizeImageFrame(character.ghostLayouts[0]);
  return normalizeImageFrame(DEFAULT_OC_GHOST_LAYOUT);
}

function resolveOcDetailLayout(character: OcCharacter, auIdx = -1): ImageFrame {
  if (auIdx >= 0) {
    const au = character.auVersions?.[auIdx];
    if (au?.detailLayout) return normalizeImageFrame(au.detailLayout);
    /* 미설정 AU는 기본 위치를 표시만 상속 — 저장은 AU 전용 필드로 */
    return normalizeImageFrame(character.detailLayout || DEFAULT_OC_DETAIL_LAYOUT);
  }
  return normalizeImageFrame(character.detailLayout || DEFAULT_OC_DETAIL_LAYOUT);
}

function resolveOcTouchZones(character: OcCharacter, auIdx = -1) {
  if (auIdx >= 0) {
    const au = character.auVersions?.[auIdx];
    if (au?.touchZones != null) return normalizeTouchZones(au.touchZones);
    return normalizeTouchZones(character.touchZones);
  }
  return normalizeTouchZones(character.touchZones);
}

function auVersionLabel(character: OcCharacter, auIdx: number) {
  if (auIdx < 0) return '기본';
  const au = character.auVersions?.[auIdx];
  return au?.label?.trim() || `버전 ${auIdx + 1}`;
}

type LayoutTarget = 'char' | 'ghost';

type Props = {
  character: OcCharacter;
  charNo: number;
  auIdx: number;
  isAdmin: boolean;
  categories: string[];
  img: { src: string; fit: string; pos: string; frame?: ImageFrame } | null;
  onBack: () => void;
  onBindBack?: (handler: (() => void) | null) => void;
  onAuChange: (au: number) => void;
  onSave?: (next: OcCharacter) => void | Promise<void>;
  /** OC 탭 방문 중 TOUCH! 힌트를 이미 닫았는지 */
  touchHintDismissed?: boolean;
  onTouchHintDismiss?: () => void;
  /** 관련 프로필(딥링크) 진입 — 입장 슬라이드 없이 즉시 표시 */
  enterInstant?: boolean;
};

function isKeywordField(k: string) {
  return /^(키워드|keywords?)$/i.test(k.trim());
}

function findRelatedTrpgScenarios(scenarios: TrpgScenario[], ocId: string | number): TrpgScenario[] {
  const id = String(ocId);
  return scenarios.filter((s) => {
    if ((s.characterIds ?? []).some((cid) => String(cid) === id)) return true;
    if ((s.playerProfiles ?? []).some((p) => String(p.ocId || '') === id)) return true;
    return false;
  });
}

function parseKeywordTags(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (!value?.trim()) return [];
  return value
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitProfileRows(character: OcCharacter) {
  const raw = buildDetailProfileRows(character);
  const kwRow = (character.profile ?? []).find((p) => isKeywordField(p.k));
  const keywordTags = kwRow ? parseKeywordTags(kwRow.v) : parseKeywordTags(character.keywords);
  const profileRows = raw;
  return { profileRows, keywordTags };
}

function StatBar({ label, value }: { label: string; value: string }) {
  const pct = parseStatPercent(value);
  const display = formatStatDigits(value);
  return (
    <div className="oc-stat-row">
      <span className="oc-stat-label">{label}</span>
      <div className="oc-stat-track" aria-hidden="true">
        <span className="oc-stat-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="oc-stat-num">{display}</span>
    </div>
  );
}

type LeftSection = { id: string; label: string; content: ReactNode; layout?: 'gallery' | 'text' | 'compact' };

const PANEL_ANIM_MS = 980;
type ShownPortrait = {
  src: string;
  fit: string;
  pos: string;
};

export function OcCharacterDetail({
  character,
  charNo,
  auIdx,
  isAdmin,
  categories,
  img,
  onBack,
  onBindBack,
  onAuChange,
  onSave,
  touchHintDismissed = false,
  onTouchHintDismiss,
  enterInstant = false,
}: Props) {
  const router = useRouter();
  const { trpg } = useSiteContent();
  const { playCharacterTheme, playing, silenceMedia } = useBgm();
  const bgmApi = useRef({ playCharacterTheme, playing, silenceMedia });
  bgmApi.current = { playCharacterTheme, playing, silenceMedia };

  const [editOpen, setEditOpen] = useState(false);
  const [editInitialTab, setEditInitialTab] = useState<'basic' | 'story'>('basic');
  const [editFocusEntryId, setEditFocusEntryId] = useState<string | null>(null);
  const [ghostLayoutMode, setGhostLayoutMode] = useState(false);
  const [layoutTarget, setLayoutTarget] = useState<LayoutTarget>('char');
  const [detailLayout, setDetailLayout] = useState<ImageFrame>(() =>
    resolveOcDetailLayout(character, auIdx),
  );
  const detailSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quoteLayoutMode, setQuoteLayoutMode] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [touchEditMode, setTouchEditMode] = useState(false);
  const [touchZones, setTouchZones] = useState<TouchZone[]>(() =>
    resolveOcTouchZones(character, auIdx),
  );
  const [touchHoverStyle, setTouchHoverStyle] = useState<TouchHoverStyle>(() =>
    normalizeTouchHoverStyle(character.touchHoverStyle),
  );
  /** 「괴롭히기」는 열 때마다 꺼진 상태. 저장·공유하지 않음 */
  const [touchEnabled, setTouchEnabled] = useState(false);
  const [touchSpeaker, setTouchSpeaker] = useState(
    () => character.touchSpeaker?.trim() || character.name || '',
  );
  const touchSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ghostLayout, setGhostLayout] = useState<ImageFrame>(() => resolveOcGhostLayout(character));
  const [ghostEnabled, setGhostEnabled] = useState(() => character.ghostEnabled !== false);
  const [ghostImg, setGhostImg] = useState(() => character.ghostImg?.trim() || '');
  const [ghostImgBusy, setGhostImgBusy] = useState(false);
  const ghostFileRef = useRef<HTMLInputElement | null>(null);
  const ghostSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rightReady, setRightReady] = useState(true);

  const [openLeft, setOpenLeft] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelMounted, setPanelMounted] = useState(false);
  /** 마운트 직후 is-open이면 opacity 트랜지션이 생략됨 → 다음 프레임에 오픈 */
  const [panelReveal, setPanelReveal] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelRevealRafRef = useRef(0);
  /** 패널 다시 열 때 서사 펼침 등 내용 state 초기화 */
  const [panelEpoch, setPanelEpoch] = useState(0);
  /** 열린 메뉴 항목에 맞춘 내용 박스 top (px, detail-body 기준) */
  const [panelTopPx, setPanelTopPx] = useState<number | null>(null);
  const detailBodyRef = useRef<HTMLDivElement | null>(null);
  const leftPanelShellRef = useRef<HTMLDivElement | null>(null);
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  /** 왼쪽 내용 박스에 더 스크롤할 내용이 남았는지 (하단 블러+화살표 표시) */
  const [panelCanScrollMore, setPanelCanScrollMore] = useState(false);
  const [shownPortrait, setShownPortrait] = useState<ShownPortrait | null>(null);
  const [charBounce, setCharBounce] = useState(false);
  const [charMotion, setCharMotion] = useState<DialogueMotion | null>(null);
  const [charFx, setCharFx] = useState<DialogueFx | null>(null);
  /** 터치 대사에서 적용한 일시 표정 (VN 없을 때도) — ref로 onPlayEnd 스탈 방지 */
  const [touchExpression, setTouchExpression] = useState<string | null>(null);
  const touchExpressionRef = useRef<string | null>(null);
  const [vnEnterAnim, setVnEnterAnim] = useState(false);
  /** AU 전환 — 대사창과 같은 leave → enter */
  const [auMotion, setAuMotion] = useState<'idle' | 'leave' | 'enter'>('idle');
  const motionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fxClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vnEnterClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auLeaveClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auEnterClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAuSrcRef = useRef((img?.src || '').trim());
  const [galleryLightbox, setGalleryLightbox] = useState<GalleryItem | null>(null);
  const wasPlayingRef = useRef(false);
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const portraitRef = useRef<ShownPortrait>({ src: '', fit: 'contain', pos: 'center top' });
  const prevVnActiveRef = useRef(false);
  const prevAuImgRef = useRef((img?.src || '').trim());
  const [portraitStackBase, setPortraitStackBase] = useState((img?.src || '').trim());
  /** AU 전환 중 detailLayout/터치 동기화 잠금 — 렌더 중 먼저 잠가서 idle 레이스 방지 */
  const auLayoutLockRef = useRef(false);
  const vn = useVnDialogue(character);
  const { profileRows, keywordTags } = useMemo(() => splitProfileRows(character), [character]);
  const personalTheme = useMemo(() => resolveCharacterTheme(character), [character]);

  /* img src가 바뀐 렌더부터 잠금 (effect보다 먼저) */
  const liveAuSrc = (img?.src || '').trim();
  if (
    liveAuSrc &&
    liveAuSrc !== prevAuImgRef.current &&
    !vn.present
  ) {
    auLayoutLockRef.current = true;
  }

  useEffect(() => {
    setCharBounce(false);
    setCharMotion(null);
    setCharFx(null);
    touchExpressionRef.current = null;
    setTouchExpression(null);
    setGhostLayoutMode(false);
    setLayoutTarget('char');
    setTouchEditMode(false);
    setDetailLayout(resolveOcDetailLayout(character, auIdx));
    setGhostLayout(resolveOcGhostLayout(character));
    setGhostEnabled(character.ghostEnabled !== false);
    setGhostImg(character.ghostImg?.trim() || '');
    setTouchZones(resolveOcTouchZones(character, auIdx));
    setTouchHoverStyle(normalizeTouchHoverStyle(character.touchHoverStyle));
    setTouchEnabled(false);
    setTouchSpeaker(character.touchSpeaker?.trim() || character.name || '');
    const src0 = (img?.src || '').trim();
    prevAuImgRef.current = src0;
    pendingAuSrcRef.current = src0;
    setPortraitStackBase(src0);
    setAuMotion('idle');
    auLayoutLockRef.current = false;
    if (auLeaveClearRef.current) clearTimeout(auLeaveClearRef.current);
    if (auEnterClearRef.current) clearTimeout(auEnterClearRef.current);
  }, [character.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on character switch only

  useEffect(() => {
    if (ghostLayoutMode) return;
    if (auLayoutLockRef.current || auMotion !== 'idle') return;
    setDetailLayout(resolveOcDetailLayout(character, auIdx));
    setGhostLayout(resolveOcGhostLayout(character));
    setGhostEnabled(character.ghostEnabled !== false);
    setGhostImg(character.ghostImg?.trim() || '');
  }, [
    auIdx,
    auMotion,
    character.auVersions,
    character.detailLayout,
    character.ghostLayout,
    character.ghostLayouts,
    character.ghostEnabled,
    character.ghostImg,
    ghostLayoutMode,
  ]);

  useEffect(() => {
    if (touchEditMode) return;
    if (auLayoutLockRef.current || auMotion !== 'idle') return;
    setTouchZones(resolveOcTouchZones(character, auIdx));
    setTouchHoverStyle(normalizeTouchHoverStyle(character.touchHoverStyle));
    setTouchSpeaker(character.touchSpeaker?.trim() || character.name || '');
  }, [
    auIdx,
    auMotion,
    character.auVersions,
    character.touchZones,
    character.touchHoverStyle,
    character.touchSpeaker,
    character.name,
    touchEditMode,
  ]);

  /* AU 디졸브 종료 후 위치·터치 적용 */
  useEffect(() => {
    if (auMotion !== 'idle' || auLayoutLockRef.current) return;
    setDetailLayout(resolveOcDetailLayout(character, auIdx));
    setTouchZones(resolveOcTouchZones(character, auIdx));
  }, [auIdx, auMotion]); // eslint-disable-line react-hooks/exhaustive-deps -- AU 전환 후 반영

  const persistGhostLayout = useCallback(
    (next: ImageFrame) => {
      const frame = normalizeImageFrame(next);
      setGhostLayout(frame);
      if (!onSave) return;
      if (ghostSaveTimer.current) clearTimeout(ghostSaveTimer.current);
      ghostSaveTimer.current = setTimeout(() => {
        ghostSaveTimer.current = null;
        const { ghostLayouts: _legacy, ...rest } = character;
        void onSave({
          ...rest,
          ghostLayout: frame,
          ghostEnabled,
          ...(ghostImg ? { ghostImg } : { ghostImg: undefined }),
        });
      }, 420);
    },
    [character, ghostEnabled, ghostImg, onSave],
  );

  const persistDetailLayout = useCallback(
    (next: ImageFrame) => {
      const frame = normalizeImageFrame(next);
      setDetailLayout(frame);
      if (!onSave) return;
      if (detailSaveTimer.current) clearTimeout(detailSaveTimer.current);
      detailSaveTimer.current = setTimeout(() => {
        detailSaveTimer.current = null;
        if (auIdx >= 0) {
          const versions = [...(character.auVersions || [])];
          if (!versions[auIdx]) return;
          versions[auIdx] = { ...versions[auIdx], detailLayout: frame };
          void onSave({ ...character, auVersions: versions });
          return;
        }
        void onSave({
          ...character,
          detailLayout: frame,
        });
      }, 420);
    },
    [auIdx, character, onSave],
  );

  const persistGhostEnabled = useCallback(
    (next: boolean) => {
      setGhostEnabled(next);
      if (!onSave) return;
      const { ghostLayouts: _legacy, ...rest } = character;
      void onSave({
        ...rest,
        ghostLayout,
        ghostEnabled: next,
        ...(ghostImg ? { ghostImg } : { ghostImg: undefined }),
      });
    },
    [character, ghostLayout, ghostImg, onSave],
  );

  const persistGhostImg = useCallback(
    (next: string) => {
      const url = next.trim();
      setGhostImg(url);
      if (!onSave) return;
      const { ghostLayouts: _legacy, ...rest } = character;
      void onSave({
        ...rest,
        ghostLayout,
        ghostEnabled,
        ...(url ? { ghostImg: url } : { ghostImg: undefined }),
      });
    },
    [character, ghostEnabled, ghostLayout, onSave],
  );

  const uploadGhostImg = useCallback(
    async (file: File) => {
      setGhostImgBusy(true);
      try {
        const url = await uploadImageFile(file, 'oc/ghost');
        persistGhostImg(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '고스트 이미지 업로드에 실패했습니다.';
        alert(msg);
      } finally {
        setGhostImgBusy(false);
      }
    },
    [persistGhostImg],
  );

  const floatingQuotes = useMemo(
    () => normalizeFloatingQuotes(character.floatingQuotes),
    [character.floatingQuotes],
  );

  useEffect(() => {
    if (!quoteLayoutMode) return;
    if (selectedQuoteId && floatingQuotes.some((q) => q.id === selectedQuoteId)) return;
    setSelectedQuoteId(floatingQuotes[0]?.id ?? null);
  }, [quoteLayoutMode, floatingQuotes, selectedQuoteId]);

  const persistFloatingQuotes = useCallback(
    (next: OcFloatingQuote[]) => {
      if (!onSave) return;
      void onSave({
        ...character,
        floatingQuotes: normalizeFloatingQuotes(next),
      });
    },
    [character, onSave],
  );

  useEffect(
    () => () => {
      if (ghostSaveTimer.current) clearTimeout(ghostSaveTimer.current);
      if (detailSaveTimer.current) clearTimeout(detailSaveTimer.current);
      if (touchSaveTimer.current) clearTimeout(touchSaveTimer.current);
    },
    [],
  );

  const persistTouchPatch = useCallback(
    (
      patch: Partial<{
        touchZones: TouchZone[];
        touchHoverStyle: TouchHoverStyle;
        touchSpeaker: string;
      }>,
      debounce = false,
    ) => {
      if (!onSave) return;
      const nextZones = patch.touchZones ?? touchZones;
      const nextStyle = patch.touchHoverStyle ?? touchHoverStyle;
      const nextSpeaker = patch.touchSpeaker ?? touchSpeaker;
      const write = () => {
        const { touchReactionOnly: _legacy, ...rest } = character;
        if (auIdx >= 0) {
          const versions = [...(rest.auVersions || [])];
          if (!versions[auIdx]) return;
          versions[auIdx] = { ...versions[auIdx], touchZones: nextZones };
          void onSave({
            ...rest,
            auVersions: versions,
            touchHoverStyle: nextStyle,
            touchEnabled: false,
            touchSpeaker: nextSpeaker.trim() || undefined,
          });
          return;
        }
        void onSave({
          ...rest,
          touchZones: nextZones,
          touchHoverStyle: nextStyle,
          touchEnabled: false,
          touchSpeaker: nextSpeaker.trim() || undefined,
        });
      };
      if (!debounce) {
        write();
        return;
      }
      if (touchSaveTimer.current) clearTimeout(touchSaveTimer.current);
      touchSaveTimer.current = setTimeout(() => {
        touchSaveTimer.current = null;
        write();
      }, 420);
    },
    [auIdx, character, onSave, touchHoverStyle, touchSpeaker, touchZones],
  );

  const layoutEdit = Boolean(isAdmin && onSave && ghostLayoutMode && !vn.present);
  const charEdit = Boolean(layoutEdit && layoutTarget === 'char');
  const ghostEdit = Boolean(layoutEdit && layoutTarget === 'ghost' && ghostEnabled);
  const quoteEdit = Boolean(isAdmin && onSave && quoteLayoutMode && !vn.present);
  const touchEditing = Boolean(isAdmin && onSave && touchEditMode && !vn.present);
  const charDrag = usePairSlotLayoutDrag(detailLayout, persistDetailLayout, charEdit, {
    requireSelect: false,
    /* 드래그 중엔 붙지 않고, 놓을 때만 아주 가까이일 때 스냅 */
    snapThreshold: 0.7,
    snapOnRelease: true,
    nudgeStep: 0.3,
  });
  const ghostDrag = usePairSlotLayoutDrag(ghostLayout, persistGhostLayout, ghostEdit, {
    requireSelect: false,
    snapThreshold: 0.7,
    snapOnRelease: true,
    nudgeStep: 0.3,
  });
  const activeSnap = charEdit ? charDrag.snap : ghostEdit ? ghostDrag.snap : { x: false, y: false };

  const playCharMotion = useCallback((motion: DialogueMotion | null) => {
    if (motionClearRef.current) clearTimeout(motionClearRef.current);
    if (!motion) {
      setCharMotion(null);
      return;
    }
    setVnEnterAnim(false);
    if (vnEnterClearRef.current) clearTimeout(vnEnterClearRef.current);
    setCharMotion(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setCharMotion(motion);
        motionClearRef.current = setTimeout(
          () => setCharMotion(null),
          DIALOGUE_MOTION_MS[motion],
        );
      });
    });
  }, []);

  const playCharFx = useCallback((fx: DialogueFx | null) => {
    if (fxClearRef.current) clearTimeout(fxClearRef.current);
    if (!fx) {
      setCharFx(null);
      return;
    }
    setCharFx(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setCharFx(fx);
        fxClearRef.current = setTimeout(() => setCharFx(null), DIALOGUE_FX_MS);
      });
    });
  }, []);

  useEffect(() => {
    /* 상세에 이미 서 있는 캐릭터에 VN enter 애니를 다시 걸면
       transform 잔여로 좌우 튐이 남음 — 퇴장(leaving)만 유지 */
    if (!vn.present || vn.leaving) {
      setVnEnterAnim(false);
      if (vnEnterClearRef.current) clearTimeout(vnEnterClearRef.current);
      return;
    }
    setVnEnterAnim(false);
  }, [vn.present, vn.leaving, character.id]);

  useEffect(() => {
    return () => {
      if (motionClearRef.current) clearTimeout(motionClearRef.current);
      if (fxClearRef.current) clearTimeout(fxClearRef.current);
      if (vnEnterClearRef.current) clearTimeout(vnEnterClearRef.current);
      if (auLeaveClearRef.current) clearTimeout(auLeaveClearRef.current);
      if (auEnterClearRef.current) clearTimeout(auEnterClearRef.current);
    };
  }, []);

  useEffect(() => {
    const el = document.getElementById('detail-screen');
    if (!el) return;
    applyCharacterTheme(el, character);
    return () => clearCharacterTheme(el);
  }, [character]);

  useLayoutEffect(() => {
    /* 마운트 직후 정보 패널 표시 — imperative classList는 리렌더에 지워지므로 className으로 유지 */
    setRightReady(true);
    const screen = document.getElementById('detail-screen');
    if (!screen) return;
    screen.classList.remove('is-ui-leaving');
    // 관련 프로필(딥링크) 진입은 입장 슬라이드 없이 즉시 표시
    if (enterInstant) {
      screen.classList.remove('is-ui-enter');
      screen.classList.add('is-pv-done', 'active');
    } else {
      screen.classList.add('is-pv-done', 'active', 'is-ui-enter');
    }
    screen.style.setProperty('opacity', '1');
    screen.style.setProperty('filter', 'none');
    screen.style.setProperty('transform', 'none');
    screen.style.setProperty('visibility', 'visible');
    if (enterInstant) return;
    const clearEnter = window.setTimeout(() => {
      screen.classList.remove('is-ui-enter');
    }, 2400);
    return () => window.clearTimeout(clearEnter);
  }, [character.id, enterInstant]);

  const portraitTarget = useMemo(
    () => ({
      /* VN 중에만 표정 URL — 평소는 기본 일러만 */
      src: vn.present ? vn.expression || img?.src || '' : img?.src || '',
      fit: img?.fit || 'contain',
      pos: img?.pos || 'center top',
      /* imgFrame(카드 크롭)은 목록 카드 전용 — 상세 메인 일러와 연결하지 않음 */
    }),
    [img?.fit, img?.pos, img?.src, vn.expression, vn.present],
  );
  const displayImgSrc = shownPortrait?.src || portraitTarget.src;
  const touchStackApi = useTouchPortraitStack(portraitStackBase);
  const touchStackResetRef = useRef(touchStackApi.reset);
  touchStackResetRef.current = touchStackApi.reset;
  const ghostDisplaySrc = (ghostImg || displayImgSrc || '').trim();
  const showTouchOverlay = Boolean(
    displayImgSrc &&
      !vn.present &&
      (touchEditing || (touchEnabled && touchZones.length > 0)),
  );
  const showTeaseToggle = Boolean(
    !vn.present && (touchZones.length > 0 || (isAdmin && onSave)),
  );
  const teaseName = (character.name || '캐릭터').trim();

  const ghostPickSources = useMemo(() => {
    const rows: { key: string; src: string; label: string }[] = [];
    const seen = new Set<string>();
    const push = (key: string, src: string, label: string) => {
      const url = src.trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      rows.push({ key, src: url, label });
    };
    push('main', character.img || '', '기본');
    (character.auVersions || []).forEach((au, i) => {
      push(`au-${i}`, au.img || '', au.label?.trim() || `AU ${i + 1}`);
    });
    if (ghostImg && !seen.has(ghostImg)) {
      push('custom', ghostImg, '커스텀');
    }
    return rows;
  }, [character.auVersions, character.img, ghostImg]);

  /* AU — leave로 투명 → (이미지+위치 교체) → enter. 위치는 보일 때 바꾸지 않음 */
  useEffect(() => {
    const next = (img?.src || '').trim();
    const prev = prevAuImgRef.current;
    if (!next) {
      prevAuImgRef.current = '';
      pendingAuSrcRef.current = '';
      setPortraitStackBase('');
      setAuMotion('idle');
      auLayoutLockRef.current = false;
      return;
    }
    if (prev === next) return;
    prevAuImgRef.current = next;
    pendingAuSrcRef.current = next;
    touchExpressionRef.current = null;
    setTouchExpression(null);
    if (prev) warmTouchPortrait(prev, 'high');
    warmTouchPortrait(next, 'high');
    if (vn.present) {
      vn.setExpression(null);
      setPortraitStackBase(next);
      setDetailLayout(resolveOcDetailLayout(character, auIdx));
      setTouchZones(resolveOcTouchZones(character, auIdx));
      setAuMotion('idle');
      auLayoutLockRef.current = false;
      if (auLeaveClearRef.current) clearTimeout(auLeaveClearRef.current);
      if (auEnterClearRef.current) clearTimeout(auEnterClearRef.current);
      return;
    }

    const targetAu = auIdx;
    auLayoutLockRef.current = true;
    if (auLeaveClearRef.current) clearTimeout(auLeaveClearRef.current);
    if (auEnterClearRef.current) clearTimeout(auEnterClearRef.current);
    setAuMotion('leave');
    auLeaveClearRef.current = setTimeout(() => {
      auLeaveClearRef.current = null;
      const url = pendingAuSrcRef.current;
      /* opacity 0(leave fill)인 동안 이미지·AU 위치 동시 교체 → 끝난 뒤 뚝 방지 */
      touchStackResetRef.current(url);
      setPortraitStackBase(url);
      setDetailLayout(resolveOcDetailLayout(character, targetAu));
      setTouchZones(resolveOcTouchZones(character, targetAu));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAuMotion('enter');
          auEnterClearRef.current = setTimeout(() => {
            auEnterClearRef.current = null;
            auLayoutLockRef.current = false;
            setAuMotion('idle');
          }, 900);
        });
      });
    }, 380);
  }, [img?.src, vn.present, vn.setExpression, character, auIdx]);

  const portraitImgStyle = useCallback(
    (fit: string, pos: string, frame?: ImageFrame): CSSProperties =>
      framedImageStyle(frame, { fit, pos }),
    [],
  );

  const clearTouchExpression = useCallback(() => {
    touchExpressionRef.current = null;
    setTouchExpression(null);
  }, []);

  const applyTouchExpression = useCallback(
    (url: string, onDone?: () => void) => {
      const next = url.trim();
      if (!next) {
        onDone?.();
        return;
      }
      touchExpressionRef.current = next;
      /* setState는 hardSwap flushSync 이후에 — 표정 페인트를 막지 않음 */
      touchStackApi.hardSwap(next, () => {
        setTouchExpression(next);
        onDone?.();
      });
    },
    [touchStackApi],
  );

  /* VN 대사창 ↔ 터치와 동일 soft 표정 스택 */
  useEffect(() => {
    if (vn.present && !prevVnActiveRef.current) {
      touchExpressionRef.current = null;
      setTouchExpression(null);
      touchStackApi.reset(portraitTarget.src || img?.src || '');
    }
    if (!vn.present && prevVnActiveRef.current) {
      touchExpressionRef.current = null;
      setTouchExpression(null);
      /* 닫을 때 reset() 하드컷 금지 — soft로 기본 복귀 (이미 기본이면 no-op) */
      touchStackApi.softRevertToBase();
    }
    prevVnActiveRef.current = vn.present;
  }, [vn.present, portraitTarget.src, img?.src, touchStackApi.reset, touchStackApi.softRevertToBase]);

  useEffect(() => {
    if (!vn.present || !portraitTarget.src) return;
    touchStackApi.hardSwap(portraitTarget.src);
  }, [vn.present, portraitTarget.src, touchStackApi.hardSwap]);

  /* X로 퇴장 시작 시 expression이 null → portraitTarget이 기본으로 바뀌며 soft 전환 */
  useEffect(() => {
    if (!vn.leaving) return;
    touchExpressionRef.current = null;
    setTouchExpression(null);
  }, [vn.leaving]);

  useEffect(() => {
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    if (panelRevealRafRef.current) cancelAnimationFrame(panelRevealRafRef.current);
    setOpenLeft(null);
    setPanelId(null);
    setPanelMounted(false);
    setPanelReveal(false);
    setPanelClosing(false);
    setGalleryLightbox(null);
    setShownPortrait(null);
    portraitRef.current = { src: '', fit: 'contain', pos: 'center top' };
    touchExpressionRef.current = null;
    setTouchExpression(null);
    touchStackApi.reset('');
    vn.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- character switch only
  }, [character.id]);

  useEffect(() => {
    const urls = new Set<string>();
    if (img?.src) urls.add(img.src);
    for (const node of character.dialogue ?? []) {
      if (node.expression?.trim()) urls.add(node.expression.trim());
    }
    for (const line of character.vnLines ?? []) {
      const expr = (line as { expression?: string }).expression;
      if (expr?.trim()) urls.add(expr.trim());
    }
    for (const zone of touchZones) {
      for (const line of zone.lines ?? []) {
        const expr =
          typeof line === 'string' ? '' : String((line as TouchZoneLine).expression ?? '').trim();
        if (expr) urls.add(expr);
      }
    }
    urls.forEach((url) => {
      warmTouchPortrait(url, 'high');
    });
  }, [character.id, character.dialogue, character.vnLines, touchZones, img?.src]);

  /* 괴롭히기 ON 시 구역 표정 재워밍 */
  useEffect(() => {
    if (!touchEnabled) return;
    for (const zone of touchZones) {
      for (const line of zone.lines ?? []) {
        const expr =
          typeof line === 'string' ? '' : String((line as TouchZoneLine).expression ?? '').trim();
        if (expr) warmTouchPortrait(expr, 'high');
      }
    }
  }, [touchEnabled, touchZones]);

  useEffect(() => {
    if (touchEnabled) return;
    if (!touchExpressionRef.current && !touchExpression) return;
    touchStackApi.softRevertToBase(clearTouchExpression);
  }, [touchEnabled]); // eslint-disable-line react-hooks/exhaustive-deps -- OFF 시에만

  const keepAuOnDialogue = Boolean(character.dialogueKeepAu);

  const ensureDefaultAu = useCallback(() => {
    if (keepAuOnDialogue) return;
    if (auIdx >= 0) onAuChange(-1);
  }, [auIdx, keepAuOnDialogue, onAuChange]);

  const handleTouchPlayLine = useCallback(
    (line: TouchZoneLine) => {
      const expr = line.expression?.trim() || '';
      if (expr) {
        /* 같은 표정 파일이 연속이면 전환 애니 생략 */
        if (touchExpressionRef.current !== expr) {
          applyTouchExpression(expr);
        }
      } else if (touchExpressionRef.current) {
        /* 표정 없는 다음 대사 → 기본 표정으로 복귀 */
        touchStackApi.softRevertToBase(clearTouchExpression);
      }
      playCharMotion(normalizeMotion(line.motion));
      playCharFx(isDialogueFx(line.fx) ? line.fx : null);
    },
    [applyTouchExpression, clearTouchExpression, playCharFx, playCharMotion, touchStackApi],
  );

  /* state 클로저에 의존하지 않음 — 대사 시작 때 null이어도 항상 스택 기준으로 복귀 */
  const handleTouchPlayEnd = useCallback(() => {
    touchStackApi.softRevertToBase(clearTouchExpression);
  }, [touchStackApi, clearTouchExpression]);

  useEffect(() => {
    const target = portraitTarget;
    if (!target.src) {
      setShownPortrait(null);
      portraitRef.current = { src: '', fit: 'contain', pos: 'center top' };
      return;
    }

    const prev = portraitRef.current;
    if (prev.src === target.src && prev.fit === target.fit && prev.pos === target.pos) {
      return;
    }

    portraitRef.current = target;
    setShownPortrait(target);
  }, [portraitTarget]);

  useEffect(() => () => {
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
  }, []);

  useEffect(() => {
    if (!galleryLightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setGalleryLightbox(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [galleryLightbox]);

  useEffect(() => {
    if (!characterHasBgmTheme(character)) return;

    const th = character.theme;
    const payload = {
      fileData: th?.fileData,
      youtubeId: th?.youtubeId,
      title: th?.title || `${character.name} Theme`,
      artist: th?.artist || '',
    };
    wasPlayingRef.current = bgmApi.current.playing;
    /* PV에서 이미 재생 중이면 상세 마운트가 끊지 않음 (playCharacterTheme 내부에서도 가드) */
    bgmApi.current.playCharacterTheme(payload, bgmApi.current.playing);
  }, [
    character.id,
    character.name,
    character.theme?.fileData,
    character.theme?.youtubeId,
    character.theme?.title,
    character.theme?.artist,
  ]);

  const hydrated = useMemo(
    () => hydrateOcStories(character),
    [character, character.storyEntries, character.storyCategories, character.previewItems],
  );
  const storyEntries = hydrated.storyEntries || [];
  const previewItems = hydrated.previewItems || [];
  const [readerEntry, setReaderEntry] = useState<StoryEntry | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [handNoteLb, setHandNoteLb] = useState<{
    urls: string[];
    title: string;
    sfxUrl?: string;
    closeSfxUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (!readerOpen || !readerEntry) return;
    const fresh = storyEntries.find((e) => e.id === readerEntry.id);
    if (fresh && fresh !== readerEntry) setReaderEntry(fresh);
  }, [readerEntry, readerOpen, storyEntries]);

  const relationships: CharacterRelation[] = character.relationships || [];
  const starCount = character.stars ?? 5;
  const showStats = isTrpgCategory(character.category) && !!character.stats?.length;
  const relatedTrpg = useMemo(
    () => (isTrpgCategory(character.category) ? findRelatedTrpgScenarios(trpg, character.id) : []),
    [character.category, character.id, trpg],
  );

  useEffect(() => {
    const panel = rightPanelRef.current;
    const scroll = rightScrollRef.current;
    if (!panel || !scroll) return;

    const syncRightBalance = () => {
      const avail = panel.clientHeight;
      if (avail <= 0) return;
      const content = scroll.scrollHeight;
      const ratio = content / avail;
      let shift = 0;
      if (ratio > 1.02) {
        shift = -Math.min(52, (ratio - 1) * 60);
      } else if (ratio < 0.72) {
        shift = Math.min(36, (0.72 - ratio) * 70);
      } else {
        shift = -Math.min(22, (ratio - 0.72) * 48);
      }
      panel.style.setProperty('--oc-right-shift', `${Math.round(shift)}px`);
      panel.classList.toggle('is-dense', ratio > 0.9);
    };

    let roRaf = 0;
    const scheduleSync = () => {
      if (roRaf) return;
      roRaf = window.requestAnimationFrame(() => {
        roRaf = 0;
        syncRightBalance();
      });
    };

    const id = window.requestAnimationFrame(syncRightBalance);
    const ro = new ResizeObserver(scheduleSync);
    ro.observe(panel);
    ro.observe(scroll);
    window.addEventListener('resize', scheduleSync);
    return () => {
      window.cancelAnimationFrame(id);
      if (roRaf) window.cancelAnimationFrame(roRaf);
      ro.disconnect();
      window.removeEventListener('resize', scheduleSync);
    };
  }, [character.id, relatedTrpg.length, profileRows.length, keywordTags.length, showStats]);

  const syncLeftPanelTop = useCallback(() => {
    const body = detailBodyRef.current;
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    const minTop = 16;
    const shell = leftPanelShellRef.current;
    const panelH = shell?.offsetHeight || Math.min(bodyRect.height * 0.55, 400);
    const overflowMax = Math.max(minTop, bodyRect.height - panelH - 16);
    /* 기본: 화면(detail-body) 세로 중앙 — 분량(panelH)에 따라 top 자동 조정 */
    let next = (bodyRect.height - panelH) / 2;
    next = Math.max(minTop, Math.min(next, overflowMax));
    setPanelTopPx((prev) => (prev != null && Math.abs(prev - next) < 0.5 ? prev : next));
  }, []);

  useLayoutEffect(() => {
    if (!panelMounted || (!openLeft && !panelClosing)) return;
    syncLeftPanelTop();
    const raf = window.requestAnimationFrame(() => syncLeftPanelTop());
    const shell = leftPanelShellRef.current;
    const body = detailBodyRef.current;
    let roRaf = 0;
    const schedule = () => {
      if (roRaf) return;
      roRaf = window.requestAnimationFrame(() => {
        roRaf = 0;
        syncLeftPanelTop();
      });
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (shell) ro?.observe(shell);
    if (body) ro?.observe(body);
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(raf);
      if (roRaf) window.cancelAnimationFrame(roRaf);
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [panelMounted, openLeft, panelId, panelClosing, syncLeftPanelTop]);

  const docVisible = useDocumentVisible();
  const [stageInView, setStageInView] = useState(true);
  const [enterSettled, setEnterSettled] = useState(false);

  useEffect(() => {
    setEnterSettled(false);
    const t = window.setTimeout(() => setEnterSettled(true), 1500);
    return () => window.clearTimeout(t);
  }, [character.id]);

  useEffect(() => {
    const el = detailBodyRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setStageInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        setStageInView(entries.some((e) => e.isIntersecting && e.intersectionRatio > 0));
      },
      { root: null, rootMargin: '80px 0px', threshold: [0, 0.05, 0.2] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [character.id]);

  /* Dust · creepy · ghost blur · floating quotes — pair와 동일 게이트 */
  const stageFxLive =
    ghostLayoutMode ||
    quoteLayoutMode ||
    touchEditMode ||
    (enterSettled && stageInView && docVisible && !vn.present);

  useCreepyGlyphScramble(detailBodyRef, {
    glyph: Boolean(character.creepyFx?.enabled && character.creepyFx.kinds?.includes('glyphScramble')),
    glitch: Boolean(character.creepyFx?.enabled && character.creepyFx.kinds?.includes('textGlitch')),
    intensity: (character.creepyFx?.intensity ?? 40) / 100,
    active: stageFxLive,
  });

  const updatePanelScrollCue = useCallback(() => {
    const el = panelScrollRef.current;
    if (!el) {
      setPanelCanScrollMore(false);
      return;
    }
    const more =
      el.scrollHeight > el.clientHeight + 8 &&
      el.scrollTop + el.clientHeight < el.scrollHeight - 16;
    setPanelCanScrollMore(more);
  }, []);

  useEffect(() => {
    if (!panelMounted || panelClosing) {
      setPanelCanScrollMore(false);
      return;
    }
    const el = panelScrollRef.current;
    if (!el) return;
    updatePanelScrollCue();
    const raf = window.requestAnimationFrame(() => updatePanelScrollCue());
    el.addEventListener('scroll', updatePanelScrollCue, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updatePanelScrollCue()) : null;
    ro?.observe(el);
    return () => {
      window.cancelAnimationFrame(raf);
      el.removeEventListener('scroll', updatePanelScrollCue);
      ro?.disconnect();
    };
  }, [panelMounted, panelClosing, panelId, panelEpoch, updatePanelScrollCue]);

  const dismissLeftPanel = useCallback(() => {
    if (!openLeft && !panelMounted) return;
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    if (panelRevealRafRef.current) cancelAnimationFrame(panelRevealRafRef.current);
    setPanelReveal(false);
    setPanelClosing(true);
    setOpenLeft(null);
    panelTimerRef.current = setTimeout(() => {
      setPanelMounted(false);
      setPanelClosing(false);
      setPanelId(null);
      setPanelTopPx(null);
    }, PANEL_ANIM_MS);
  }, [openLeft, panelMounted]);

  const closeStoryReader = useCallback(() => {
    setReaderOpen(false);
    setReaderEntry(null);
  }, []);

  const handleBack = useCallback(() => {
    if (editOpen) {
      setEditOpen(false);
      return;
    }
    if (galleryLightbox) {
      setGalleryLightbox(null);
      return;
    }
    if (readerOpen) {
      closeStoryReader();
      return;
    }
    if (vn.present) {
      vn.close();
      return;
    }
    if (ghostLayoutMode) {
      setGhostLayoutMode(false);
      return;
    }
    if (touchEditMode) {
      setTouchEditMode(false);
      return;
    }
    if (quoteLayoutMode) {
      setQuoteLayoutMode(false);
      return;
    }
    /* panelMounted만 남은 closing 중엔 막지 않음 — 예전엔 980ms 동안 뒤로가기가 먹통 */
    if (openLeft) {
      dismissLeftPanel();
      return;
    }
    onBack();
  }, [
    closeStoryReader,
    dismissLeftPanel,
    editOpen,
    galleryLightbox,
    ghostLayoutMode,
    onBack,
    openLeft,
    quoteLayoutMode,
    readerOpen,
    touchEditMode,
    vn,
  ]);

  useEffect(() => {
    onBindBack?.(handleBack);
    return () => onBindBack?.(null);
  }, [handleBack, onBindBack]);

  /* openLeft일 때만 레이어 등록 — closing 중 panelMounted에 묶이면 스택만 먹고 안 닫힘 */
  useLakeBackNavigation(Boolean(openLeft), dismissLeftPanel, 'oc-detail-panel');
  useLakeBackNavigation(!!galleryLightbox, () => setGalleryLightbox(null), 'oc-detail-gallery');
  useLakeBackNavigation(editOpen, () => setEditOpen(false), 'oc-detail-edit');
  useLakeBackNavigation(readerOpen, closeStoryReader, 'oc-story-reader');
  useLakeBackNavigation(vn.present && !vn.leaving, () => vn.close(), 'oc-detail-vn');
  useLakeBackNavigation(ghostLayoutMode && !vn.present, () => setGhostLayoutMode(false), 'oc-detail-layout');
  useLakeBackNavigation(touchEditMode && !vn.present, () => setTouchEditMode(false), 'oc-detail-touch');
  useLakeBackNavigation(quoteLayoutMode && !vn.present, () => setQuoteLayoutMode(false), 'oc-detail-quote');

  function toggleLeft(id: string) {
    if (ghostLayoutMode) setGhostLayoutMode(false);
    if (quoteLayoutMode) setQuoteLayoutMode(false);
    if (touchEditMode) setTouchEditMode(false);
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    if (panelRevealRafRef.current) cancelAnimationFrame(panelRevealRafRef.current);
    if (openLeft === id) {
      setPanelReveal(false);
      setPanelClosing(true);
      setOpenLeft(null);
      panelTimerRef.current = setTimeout(() => {
        setPanelMounted(false);
        setPanelClosing(false);
        setPanelId(null);
        setPanelTopPx(null);
      }, PANEL_ANIM_MS);
      return;
    }
    const switching = panelMounted && openLeft && openLeft !== id;
    setPanelClosing(false);
    setOpenLeft(id);
    setPanelId(id);
    setPanelMounted(true);
    setPanelEpoch((n) => n + 1);
    if (switching) {
      /* 이미 열린 박스에서 메뉴만 바꿀 때는 그대로 표시 */
      setPanelReveal(true);
    } else {
      setPanelReveal(false);
      panelRevealRafRef.current = requestAnimationFrame(() => {
        panelRevealRafRef.current = requestAnimationFrame(() => {
          setPanelReveal(true);
        });
      });
    }
  }

  const leftSections = useMemo<LeftSection[]>(() => {
    const sections: LeftSection[] = [];

    if (previewItems.length) {
      sections.push({
        id: 'preview',
        label: '프리뷰',
        content: <PreviewCarousel items={previewItems} />,
      });
    }

    if (character.desc) {
      sections.push({
        id: 'intro',
        label: '소개',
        content: <OcRichText text={character.desc} className="oc-acc-text" />,
      });
    }

    if (character.appearance) {
      sections.push({
        id: 'appearance',
        label: '외관',
        content: <OcRichText text={character.appearance} className="oc-acc-text" />,
      });
    }

    if (relationships.length) {
      sections.push({
        id: 'relations',
        label: '관계',
        layout: 'compact',
        content: (
          <div className="oc-acc-relations">
            {relationships.map((rel) => (
              <div key={rel.id} className="oc-acc-rel">
                <span className="oc-acc-rel-name">{rel.name}</span>
                <span className="oc-acc-rel-type">{rel.relation}</span>
                {rel.note ? <OcRichText text={rel.note} className="oc-acc-rel-note" /> : null}
              </div>
            ))}
          </div>
        ),
      });
    }

    {
      const allTaste = resolveTasteItems(character);
      const layoutRows = layoutTasteRows(allTaste);
      const hasTasteRows = layoutRows.length > 0;
      if (character.special || hasTasteRows) {
        const renderTasteCell = (it: (typeof allTaste)[number]) => (
          <div className="oc-acc-etc-cell" key={it.id}>
            {it.title?.trim() ? <em className="oc-acc-etc-label">{it.title.trim()}</em> : null}
            {it.body?.trim() ? <OcRichText text={it.body} className="oc-acc-etc-value" /> : null}
          </div>
        );
        sections.push({
          id: 'taste',
          label: '특이사항',
          content: (
            <div className="oc-acc-etc">
              {character.special ? (
                <div className="oc-acc-etc-lead">
                  <OcRichText text={character.special} className="oc-acc-text" />
                </div>
              ) : null}
              {layoutRows.map((row) => {
                if (row.kind === 'divider') {
                  return <hr key={row.id} className="oc-acc-etc-sep" />;
                }
                if (row.kind === 'pair') {
                  return (
                    <div className="oc-acc-etc-pair" key={`${row.left.id}-${row.right.id}`}>
                      {renderTasteCell(row.left)}
                      <span className="oc-acc-etc-pair__rule" aria-hidden />
                      {renderTasteCell(row.right)}
                    </div>
                  );
                }
                if (row.kind === 'halfSolo') {
                  return (
                    <div className="oc-acc-etc-row oc-acc-etc-row--solo" key={row.item.id}>
                      {renderTasteCell(row.item)}
                    </div>
                  );
                }
                return (
                  <div className="oc-acc-etc-row" key={row.item.id}>
                    {renderTasteCell(row.item)}
                  </div>
                );
              })}
            </div>
          ),
        });
      }
    }

    for (const sec of character.customSections ?? []) {
      const title = sec.title?.trim();
      const body = sec.body?.trim();
      const abilities = (sec.abilities ?? []).filter((a) => a.name?.trim());
      const mystic = !!sec.mystic;
      const hasAbilities = mystic && abilities.length > 0;
      if (!title || (!body && !hasAbilities)) continue;
      sections.push({
        id: `custom-${sec.id}`,
        label: title,
        content: hasAbilities ? (
          <div className="oc-ability-wrap">
            {body ? <OcRichText text={body} className="oc-acc-text" /> : null}
            <OcAbilityList abilities={abilities} />
          </div>
        ) : (
          <OcRichText text={body ?? ''} className="oc-acc-text" />
        ),
      });
    }

    if (storyEntries.length) {
      sections.push({
        id: 'story',
        label: '서사 로그',
        content: (
          <StoryEntryList
            entries={storyEntries}
            categories={hydrated.storyCategories}
            categoryColors={hydrated.storyCategoryColors}
            mode="accordion"
            onOpen={(entry) => {
              setReaderEntry(entry);
              setReaderOpen(true);
            }}
          />
        ),
      });
    }

    if (character.gallery?.length) {
      const galleryCount = character.gallery.length;
      sections.push({
        id: 'gallery',
        label: '갤러리',
        layout: 'gallery',
        content: (
          <div className="oc-acc-gallery" data-count={Math.min(galleryCount, 6)}>
            {character.gallery.map((g, i) => {
              const item = normalizeGalleryItem(g);
              return (
                <button
                  key={i}
                  type="button"
                  className="oc-acc-gallery-item"
                  onClick={() => setGalleryLightbox(item)}
                >
                  <img src={gallerySrc(item)} alt="" />
                </button>
              );
            })}
          </div>
        ),
      });
    }

    return sections;
  }, [character, relationships, storyEntries, previewItems, hydrated.storyCategories]);

  type OcNavGroup = {
    id: string;
    en?: string;
    ko?: string;
    solo?: boolean;
    items: LeftSection[];
  };

  const leftNavGroups = useMemo<OcNavGroup[]>(() => {
    const byId = (id: string) => leftSections.find((s) => s.id === id);
    const groups: OcNavGroup[] = [];

    const preview = byId('preview');
    if (preview) groups.push({ id: 'g-preview', solo: true, items: [preview] });

    const customItems = leftSections.filter((s) => s.id.startsWith('custom-'));
    const baseProfileItems = [
      ...['intro', 'appearance', 'relations', 'taste', 'special']
        .map(byId)
        .filter((s): s is LeftSection => Boolean(s)),
      ...customItems,
    ];
    // 사용자 지정 순서 적용 — 지정 목록 우선, 나머지는 원래 순서로 뒤에
    const order = character.sectionOrder ?? [];
    const profileItems =
      order.length > 0
        ? [
            ...order
              .map((id) => baseProfileItems.find((s) => s.id === id))
              .filter((s): s is LeftSection => Boolean(s)),
            ...baseProfileItems.filter((s) => !order.includes(s.id)),
          ]
        : baseProfileItems;
    if (profileItems.length) {
      groups.push({ id: 'g-profile', en: 'PROFILE', items: profileItems });
    }

    const story = byId('story');
    if (story) groups.push({ id: 'g-story', en: 'STORY', items: [story] });

    const gallery = byId('gallery');
    if (gallery) groups.push({ id: 'g-archive', en: 'ARCHIVE', items: [gallery] });

    return groups;
  }, [leftSections, character.sectionOrder]);

  const panelSection = panelId ? leftSections.find((s) => s.id === panelId) : null;

  return (
    <>
      <CursorFollowTipHost />
      <div className="game-topbar">
        <button type="button" className="game-back" onClick={handleBack}>
          ← 목록으로
        </button>
        <div className="game-topbar-title">
          {displayCategory(character.category || '') || '—'}
          {formatCardTag(character.tag) ? ` · ${formatCardTag(character.tag)}` : ''}
        </div>
        {isAdmin && onSave && (
          <div className="game-topbar-actions">
            <button
              type="button"
              className={`btn-edit${ghostLayoutMode ? ' is-active' : ''}`}
              title={`메인·고스트 위치 조절 · ${auVersionLabel(character, auIdx)}${auIdx >= 0 ? ' (기본과 별도)' : ''}`}
              onClick={() => {
                setGhostLayoutMode((v) => {
                  const next = !v;
                  if (next) {
                    setLayoutTarget('char');
                    setTouchEditMode(false);
                    setQuoteLayoutMode(false);
                    if (vn.present) vn.close();
                  }
                  return next;
                });
              }}
            >
              {ghostLayoutMode ? `✓ 위치·${auVersionLabel(character, auIdx)}` : '위치'}
            </button>
            <button
              type="button"
              className={`btn-edit${quoteLayoutMode ? ' is-active' : ''}`}
              title="플로팅 대사 위치·크기"
              onClick={() => {
                setQuoteLayoutMode((v) => {
                  const next = !v;
                  if (next) {
                    setGhostLayoutMode(false);
                    setTouchEditMode(false);
                    if (vn.present) vn.close();
                  }
                  return next;
                });
              }}
            >
              {quoteLayoutMode ? '✓ 대사' : '대사'}
            </button>
            <button
              type="button"
              className={`btn-edit${touchEditMode ? ' is-active' : ''}`}
              title={`터치 반응 영역 편집 · ${auVersionLabel(character, auIdx)}${auIdx >= 0 ? ' (기본과 별도)' : ''}`}
              onClick={() => {
                setTouchEditMode((v) => {
                  const next = !v;
                  if (next) {
                    setGhostLayoutMode(false);
                    setQuoteLayoutMode(false);
                    if (vn.present) vn.close();
                  }
                  return next;
                });
              }}
            >
              {touchEditMode ? `✓ 터치·${auVersionLabel(character, auIdx)}` : '터치'}
            </button>
            <button
              type="button"
              className="btn-edit"
              onClick={() => {
                if (readerOpen && readerEntry) {
                  setEditInitialTab('story');
                  setEditFocusEntryId(readerEntry.id);
                } else {
                  setEditInitialTab('basic');
                  setEditFocusEntryId(null);
                }
                setEditOpen(true);
              }}
            >
              ✎ 수정
            </button>
          </div>
        )}
      </div>

      <div
        ref={detailBodyRef}
        className={`game-body oc-detail-body${openLeft ? ' has-left-open' : ''}${vn.present ? ' vn-active' : ''}${layoutEdit ? ' is-ghost-layout-edit' : ''}${charEdit ? ' is-char-layout-target' : ''}${ghostEdit ? ' is-ghost-layout-target' : ''}${!stageFxLive ? ' is-fx-paused' : ''}${creepyFxClass(character.creepyFx)}`}
        style={creepyFxStyle(character.creepyFx)}
      >
        <DustAtmosphere fx={character.dustFx} active={stageFxLive} />
        {isAdmin && onSave && ghostLayoutMode ? (
          <div className="oc-ghost-tools" role="toolbar" aria-label="위치 조절">
            <div className="oc-ghost-tools__targets" role="tablist" aria-label="조절 대상">
              <button
                type="button"
                role="tab"
                aria-selected={layoutTarget === 'char'}
                className={`oc-ghost-tools__target${layoutTarget === 'char' ? ' is-active' : ''}`}
                onClick={() => setLayoutTarget('char')}
              >
                메인
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={layoutTarget === 'ghost'}
                className={`oc-ghost-tools__target${layoutTarget === 'ghost' ? ' is-active' : ''}`}
                onClick={() => setLayoutTarget('ghost')}
              >
                고스트
              </button>
            </div>
            <span className="oc-ghost-tools__sep" aria-hidden />
            {layoutTarget === 'ghost' ? (
              <>
                <label className="oc-ghost-tools__toggle">
                  <input
                    type="checkbox"
                    checked={ghostEnabled}
                    onChange={(e) => persistGhostEnabled(e.target.checked)}
                  />
                  <span>표시</span>
                </label>
                {ghostEnabled ? (
                  <>
                    <span className="oc-ghost-tools__sep" aria-hidden />
                    <div className="oc-ghost-tools__imgs" aria-label="고스트 이미지">
                      {ghostPickSources.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`oc-ghost-tools__thumb${ghostImg === opt.src ? ' is-active' : ''}`}
                          title={opt.label}
                          aria-label={`고스트: ${opt.label}`}
                          aria-pressed={ghostImg === opt.src}
                          onClick={() => persistGhostImg(opt.src)}
                        >
                          <img src={opt.src} alt="" draggable={false} />
                        </button>
                      ))}
                      <button
                        type="button"
                        className="oc-ghost-tools__upload"
                        disabled={ghostImgBusy}
                        title="고스트 이미지 업로드"
                        aria-label="고스트 이미지 업로드"
                        onClick={() => ghostFileRef.current?.click()}
                      >
                        {ghostImgBusy ? '…' : '+'}
                      </button>
                      <input
                        ref={ghostFileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadGhostImg(f);
                          e.target.value = '';
                        }}
                      />
                      {ghostImg ? (
                        <button
                          type="button"
                          className="oc-ghost-tools__reset"
                          title="메인과 동일하게"
                          onClick={() => persistGhostImg('')}
                        >
                          초기화
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}
                <span className="oc-ghost-tools__sep" aria-hidden />
                {ghostEnabled ? (
                  <button
                    type="button"
                    className="oc-ghost-tools__reset"
                    title="가로 중앙에 맞춤"
                    onClick={() =>
                      persistGhostLayout({
                        ...normalizeImageFrame(ghostLayout),
                        x: 0,
                      })
                    }
                  >
                    중앙
                  </button>
                ) : null}
                <span className={`oc-ghost-tools__hint${ghostEnabled ? '' : ' is-muted'}`}>
                  {ghostEnabled ? '드래그 · 방향키 · 휠 · 놓을 때 미세 스냅' : '표시를 켜면 조절할 수 있어요'}
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="oc-ghost-tools__reset"
                  title="가로 중앙에 맞춤"
                  onClick={() =>
                    persistDetailLayout({
                      ...normalizeImageFrame(detailLayout),
                      x: 0,
                    })
                  }
                >
                  중앙
                </button>
                <button
                  type="button"
                  className="oc-ghost-tools__reset"
                  title="메인 위치·크기 초기화"
                  onClick={() => persistDetailLayout({ ...DEFAULT_OC_DETAIL_LAYOUT })}
                >
                  초기화
                </button>
                <span className="oc-ghost-tools__sep" aria-hidden />
                <span className="oc-ghost-tools__hint">
                  {auIdx >= 0 ? (
                    <>
                      <strong>{auVersionLabel(character, auIdx)}</strong>
                      {' · '}
                    </>
                  ) : null}
                  드래그 · 방향키 · 휠 · 놓을 때 미세 스냅
                </span>
              </>
            )}
            <button
              type="button"
              className="oc-ghost-tools__done"
              onClick={() => setGhostLayoutMode(false)}
            >
              완료
            </button>
          </div>
        ) : null}
        {isAdmin && onSave && quoteLayoutMode ? (
          <div className="oc-ghost-tools" role="toolbar" aria-label="플로팅 대사 조절">
            <div className="oc-ghost-tools__imgs" aria-label="대사 선택">
              {floatingQuotes.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  className={`oc-ghost-tools__thumb oc-fq-tools__chip${selectedQuoteId === q.id ? ' is-active' : ''}`}
                  title={q.text}
                  aria-pressed={selectedQuoteId === q.id}
                  onClick={() => setSelectedQuoteId(q.id)}
                >
                  <span>{i + 1}</span>
                </button>
              ))}
              <button
                type="button"
                className="oc-ghost-tools__upload"
                title="대사 추가"
                aria-label="대사 추가"
                onClick={() => {
                  const q = emptyFloatingQuote('새 대사');
                  persistFloatingQuotes([...floatingQuotes, q]);
                  setSelectedQuoteId(q.id);
                }}
              >
                +
              </button>
            </div>
            <span className="oc-ghost-tools__sep" aria-hidden />
            <span className="oc-ghost-tools__hint">드래그로 이동 · 휠로 크기</span>
            <button
              type="button"
              className="oc-ghost-tools__done"
              onClick={() => setQuoteLayoutMode(false)}
            >
              완료
            </button>
          </div>
        ) : null}
        <div className="game-left" id="game-left">
          <div className="game-char-gradient" />
          {layoutEdit ? (
            <div className="oc-layout-guides" aria-hidden="true">
              <span
                className={`oc-layout-guides__line oc-layout-guides__line--v${activeSnap.x ? ' is-snap' : ''}`}
              />
              <span
                className={`oc-layout-guides__line oc-layout-guides__line--h${activeSnap.y ? ' is-snap' : ''}`}
              />
              <span className="oc-layout-guides__label">CENTER</span>
            </div>
          ) : null}
          {(floatingQuotes.length > 0 || quoteEdit) && (
            <OcFloatingQuotes
              quotes={floatingQuotes}
              mode="ambient"
              editing={quoteEdit}
              selectedId={selectedQuoteId}
              onSelectId={setSelectedQuoteId}
              onChange={persistFloatingQuotes}
              paused={vn.present || ghostLayoutMode || touchEditMode || !stageFxLive}
            />
          )}
          {ghostDisplaySrc && ghostEnabled ? (
            <div className="oc-char-billboards" aria-hidden={!ghostEdit}>
              <div
                ref={ghostDrag.elRef}
                className={`oc-char-billboard-wrap${ghostEdit ? ' is-layout-editable' : ''}${ghostDrag.selected ? ' is-layout-selected' : ''}${ghostDrag.dragging ? ' is-dragging' : ''}`}
                style={{
                  ...ghostDrag.layoutStyle('translateX(-50%)'),
                  transformOrigin: 'center bottom',
                }}
                {...ghostDrag.handlers}
              >
                <img className="oc-char-billboard" src={ghostDisplaySrc} alt="" decoding="async" draggable={false} />
              </div>
            </div>
          ) : null}
          <div
            className={`oc-char-slide${openLeft ? ' shifted' : ''}${
              vnEnterAnim ? ' is-vn-enter' : ''
            }${touchEditing ? ' is-touch-edit' : ''}`}
          >
            {displayImgSrc || portraitStackBase ? (
              <>
                <div
                  className={`oc-char-motion-host${
                    charBounce ? ' oc-char-bounce-once is-char-motion' : ocMotionClass(charMotion)
                  }`}
                >
                  <div
                    ref={charDrag.elRef}
                    className={`oc-char-detail-layout${charEdit ? ' is-layout-editable' : ''}${charDrag.selected ? ' is-layout-selected' : ''}${charDrag.dragging ? ' is-dragging' : ''}${
                      auMotion !== 'idle' ? ' is-au-locked' : ''
                    }`}
                    style={{
                      ...charDrag.layoutStyle(),
                      transformOrigin: 'center bottom',
                    }}
                    {...charDrag.handlers}
                  >
                    <div
                      className={`oc-char-portrait-stack${
                        touchStackApi.softRevert ? ' is-soft-revert' : ''
                      }${auMotion === 'leave' ? ' is-au-leave' : ''}${
                        auMotion === 'enter' ? ' is-au-enter' : ''
                      }`}
                    >
                      {charMotion === 'pulse' ? (
                        <VnCharBloom
                          src={
                            touchStackApi.stack.layers[touchStackApi.stack.front] ||
                            portraitStackBase
                          }
                          imgStyle={portraitImgStyle(
                            shownPortrait?.fit || portraitTarget.fit,
                            shownPortrait?.pos || portraitTarget.pos,
                          )}
                        />
                      ) : null}
                      {([0, 1] as const).map((layer) => (
                        <img
                          key={layer}
                          id={layer === 0 ? 'game-char-img' : undefined}
                          className={`game-char-img oc-char-portrait-layer${
                            touchStackApi.stack.front === layer ? ' is-front' : ' is-back'
                          }`}
                          src={touchStackApi.stack.layers[layer] || portraitStackBase}
                          alt=""
                          decoding="sync"
                          draggable={false}
                          style={portraitImgStyle(
                            shownPortrait?.fit || portraitTarget.fit,
                            shownPortrait?.pos || portraitTarget.pos,
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              vn.present ||
                              ghostLayoutMode ||
                              touchEditMode ||
                              touchEnabled ||
                              touchStackApi.stack.front !== layer
                            ) {
                              return;
                            }
                            ensureDefaultAu();
                            setCharBounce(true);
                            vn.open();
                            window.setTimeout(() => setCharBounce(false), 260);
                          }}
                        />
                      ))}
                      <VnCharFx fx={charFx} />
                    </div>
                  </div>
                </div>
                {showTouchOverlay ? (
                  <TouchReactOverlay
                    zones={touchZones}
                    hoverStyle={touchHoverStyle}
                    touchEnabled={touchEnabled}
                    speaker={touchSpeaker || character.name || ''}
                    editable={touchEditing}
                    interactive={!ghostLayoutMode && (touchEditing || touchEnabled)}
                    onZonesChange={(zones) => {
                      setTouchZones(zones);
                      persistTouchPatch({ touchZones: zones }, true);
                    }}
                    onHoverStyleChange={(style) => {
                      setTouchHoverStyle(style);
                      persistTouchPatch({ touchHoverStyle: style });
                    }}
                    onTouchEnabledChange={setTouchEnabled}
                    onSpeakerChange={(s) => {
                      setTouchSpeaker(s);
                      persistTouchPatch({ touchSpeaker: s }, true);
                    }}
                    onPlayLine={handleTouchPlayLine}
                    onPlayEnd={handleTouchPlayEnd}
                    touchHintDismissed={touchHintDismissed}
                    onTouchHintDismiss={onTouchHintDismiss}
                  />
                ) : null}
              </>
            ) : (
              <div className="game-char-placeholder" id="game-placeholder">
                {character.name?.[0] || '?'}
              </div>
            )}
          </div>
        </div>

        {showTeaseToggle ? (
          <button
            type="button"
            className={`oc-tease-fab${touchEnabled ? ' is-on' : ''}`}
            aria-pressed={touchEnabled}
            title={
              touchEnabled
                ? '켜짐 — 일러스트를 만져 보세요. 다시 누르면 대사창 모드'
                : '꺼짐 — 누르면 터치 반응 모드'
            }
            onClick={() => {
              if (!touchEnabled) ensureDefaultAu();
              setTouchEnabled((v) => !v);
            }}
          >
            <span className="oc-tease-fab__kicker">Touch</span>
            <span className="oc-tease-fab__label">{teaseName} 괴롭히기</span>
            <span className="oc-tease-fab__state" aria-hidden="true">
              {touchEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        ) : null}

        {!vn.present ? (
          <OcAuPicker
            character={character}
            auIdx={auIdx}
            onAuChange={onAuChange}
            disabled={touchEnabled}
          />
        ) : null}

        {leftNavGroups.length > 0 && (
          <nav className="oc-detail-left" aria-label="추가 정보">
            {leftNavGroups.map((group) => (
              <div
                key={group.id}
                className={`oc-left-sec${group.solo ? ' oc-left-sec--solo' : ''}`}
              >
                {!group.solo && group.en ? (
                  <div className="oc-left-sec__head">
                    <span className="oc-left-sec__en">{group.en}</span>
                  </div>
                ) : null}
                {group.items.map((sec) => {
                  const open = openLeft === sec.id;
                  return (
                    <div key={sec.id} className={`oc-left-acc${open ? ' open' : ''}`}>
                      <button
                        type="button"
                        className="oc-left-acc-head"
                        aria-expanded={open}
                        onClick={() => toggleLeft(sec.id)}
                      >
                        <span className="oc-left-acc-bar" aria-hidden="true" />
                        <span className="oc-left-acc-label">{sec.label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
        )}

        <OcStatHoverPanel
          panel={character.statPanel}
          accent={personalTheme.personalColor}
        />

        {panelMounted && panelSection && (
          <div
            ref={leftPanelShellRef}
            className={`oc-left-panel-shell${
              panelClosing ? ' is-closing' : panelReveal ? ' is-open' : ''
            }${
              panelSection.layout ? ` oc-left-panel-shell--${panelSection.layout}` : ' oc-left-panel-shell--text'
            }${panelTopPx != null ? ' is-anchored' : ''}`}
            style={panelTopPx != null ? ({ top: panelTopPx } as CSSProperties) : undefined}
            data-count={
              panelSection.id === 'gallery'
                ? String(Math.min(character.gallery?.length || 0, 6))
                : undefined
            }
            role="region"
            aria-label={panelSection.label}
            aria-hidden={panelClosing}
          >
            <div
              className={`oc-left-content-panel${panelCanScrollMore ? ' has-more' : ''}`}
            >
              <div
                className="oc-left-content-inner"
                key={`${panelId}-${panelEpoch}`}
                ref={panelScrollRef}
              >
                <h3 className="oc-left-content-title">{panelSection.label}</h3>
                <div className="oc-left-content-body">{panelSection.content}</div>
              </div>
              <div
                className="oc-left-scroll-cue"
                aria-hidden="true"
                onClick={() => {
                  const el = panelScrollRef.current;
                  if (el) el.scrollBy({ top: el.clientHeight * 0.7, behavior: 'smooth' });
                }}
              >
                <span className="oc-left-scroll-cue-arrow" />
              </div>
            </div>
          </div>
        )}

        {(() => {
          const ordered = [...storyEntries].sort((a, b) => a.order - b.order);
          const idx = readerEntry ? ordered.findIndex((e) => e.id === readerEntry.id) : -1;
          const prev = idx > 0 ? ordered[idx - 1] : null;
          const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
          return (
            <StoryReader
              entry={readerEntry}
              open={readerOpen}
              accentColor={personalTheme.personalColor}
              categoryColors={hydrated.storyCategoryColors}
              hasPrevEntry={!!prev}
              hasNextEntry={!!next}
              onPrevEntry={prev ? () => setReaderEntry(prev) : undefined}
              onNextEntry={next ? () => setReaderEntry(next) : undefined}
              onClose={() => {
                setReaderOpen(false);
                setReaderEntry(null);
              }}
            />
          );
        })()}

        <div className={`oc-detail-right${rightReady ? ' is-ready' : ''}`} ref={rightPanelRef}>
          <div className="oc-detail-right-scroll" ref={rightScrollRef}>
          <header className="oc-identity">
            <div className="oc-identity-no">
              <span className="oc-identity-no-label">No.</span>
              <span className="oc-identity-no-num">{charNo}</span>
            </div>
            {character.nameSub && <div className="oc-identity-sub">{character.nameSub}</div>}
            <div className="oc-identity-name-block">
              <div className="lh-handnote-name-row">
                {(character.handwritingNotes || []).some((u) => u.trim()) ? (
                  <button
                    type="button"
                    className="lh-handnote-btn"
                    aria-label={`${character.name} 손글씨 쪽지`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const urls = (character.handwritingNotes || [])
                        .map((u) => u.trim())
                        .filter(Boolean);
                      if (!urls.length) return;
                      setHandNoteLb({
                        urls,
                        title: character.name || '쪽지',
                        sfxUrl: character.handwritingNoteSfx?.trim() || undefined,
                        closeSfxUrl: character.handwritingNoteCloseSfx?.trim() || undefined,
                      });
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="lh-handnote-btn__icon"
                      src="/icons/note-folded.png?v=3"
                      alt=""
                      draggable={false}
                      width={48}
                      height={72}
                    />
                  </button>
                ) : null}
                <h1 className="oc-identity-name">{character.name}</h1>
              </div>
              <div className="oc-identity-accent-line" aria-hidden="true" />
            </div>
            <RiskBadges
              className="oc-identity-risk"
              riskStages={character.riskStages}
              riskLevel={character.riskLevel}
            />
          </header>

          {relatedTrpg.length > 0 && (
            <section className="oc-trpg-links" aria-label="Related scenario">
              <div className="oc-trpg-link-list">
                {relatedTrpg.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="oc-trpg-link-btn"
                    onClick={() => {
                      setTrpgReturnPath(
                        `/oc?c=${encodeURIComponent(String(character.id))}&view=detail&from=trpg`,
                      );
                      lakeNavigate(router, `/trpg/${encodeURIComponent(s.id)}`, '/oc');
                    }}
                  >
                    <span className="oc-trpg-link-kicker">Related scenario</span>
                    <span className="oc-trpg-link-title">{s.title || s.id}</span>
                    {s.subtitle ? <span className="oc-trpg-link-sub">{s.subtitle}</span> : null}
                    <span className="oc-trpg-link-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="oc-identity-meta">
            <div className="oc-identity-stars" aria-label={`${starCount} stars`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < starCount ? 'on' : 'off'}>
                  ★
                </span>
              ))}
            </div>
            <div className="oc-identity-personal-color" aria-label="퍼스널 컬러">
              <span
                className="oc-identity-personal-swatch"
                style={{ backgroundColor: personalTheme.personalColor }}
              />
              <span className="oc-identity-personal-hex">{personalTheme.personalColor.toUpperCase()}</span>
            </div>
          </div>

          <section className="oc-attr-panel oc-basic-info">
            <div className="oc-basic-info-block">
              <header className="oc-attr-head">
                <span className="oc-attr-head-en">PROFILE</span>
                <span className="oc-attr-head-ko">기본 정보</span>
              </header>
              <div className="oc-basic-info-fields">
                <div className="oc-attr-grid">
                  {profileRows.map((p) => (
                    <CursorTipZone key={p.k} tip={p.tip} className="oc-attr-cell oc-attr-row">
                      <div className="oc-attr-row-body oc-attr-inline">
                        <span className="oc-attr-label">{p.k}</span>
                        <span className="oc-attr-value">{p.v}</span>
                      </div>
                    </CursorTipZone>
                  ))}
                </div>
              </div>
              {keywordTags.length > 0 && (
                <div className="oc-attr-keywords-block">
                  <div className="oc-attr-keywords-stack">
                    <span className="oc-attr-label">키워드</span>
                    <div className="oc-keyword-chips">
                      {keywordTags.map((tag, i) => (
                        <span key={`${tag}-${i}`} className="oc-keyword-chip">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {character.flatLore?.trim() ? (
                <div className="oc-attr-keywords-block oc-attr-flatlore-block">
                  <div className="oc-attr-keywords-stack">
                    <span className="oc-attr-label">납작 캐해</span>
                    <OcRichText text={character.flatLore} className="oc-attr-flatlore-text" />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {showStats && character.stats && (
            <section className="oc-attr-panel oc-stat-section">
              <header className="oc-attr-head">
                <span className="oc-attr-head-en">ATTRIBUTE</span>
                <span className="oc-attr-head-ko">스테이터스</span>
              </header>
              <div className="oc-attr-grid oc-attr-grid-stats">
                {character.stats.map((s) => (
                  <StatBar key={s.k} label={s.k} value={s.v} />
                ))}
              </div>
            </section>
          )}
          </div>
        </div>

        <OcVnDialogue
          character={character}
          active={vn.active}
          present={vn.present}
          leaving={vn.leaving}
          onClose={vn.close}
          onExpression={vn.setExpression}
          onMotion={playCharMotion}
          onFx={playCharFx}
        />
      </div>

      {galleryLightbox && (
        <div
          className="oc-gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="갤러리 이미지"
          onClick={() => setGalleryLightbox(null)}
        >
          <button
            type="button"
            className="oc-gallery-lightbox-close"
            aria-label="닫기"
            onClick={() => setGalleryLightbox(null)}
          >
            ✕
          </button>
          <div className="oc-gallery-lightbox-stage" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={galleryLightbox.src} alt="" />
            {galleryLightbox.credit?.trim() ? (
              <p className="oc-gallery-lightbox-credit">{formatGalleryCredit(galleryLightbox.credit)}</p>
            ) : null}
          </div>
        </div>
      )}

      {handNoteLb ? (
        <HandwritingNoteFlap
          open={!!handNoteLb}
          urls={handNoteLb.urls}
          title={handNoteLb.title}
          sfxUrl={handNoteLb.sfxUrl}
          closeSfxUrl={handNoteLb.closeSfxUrl}
          onClose={() => setHandNoteLb(null)}
        />
      ) : null}

      {isAdmin && onSave ? (
        <LakeEditModal
          open={editOpen}
          className="lake-edit-modal--oc"
          title="캐릭터 수정"
          eyebrow="ADMIN · OC"
          onClose={() => setEditOpen(false)}
        >
          <OcEditForm
            key={`${character.id}-${editInitialTab}-${editFocusEntryId || 'none'}`}
            character={character}
            categories={categories}
            compact
            initialTab={editInitialTab}
            focusEntryId={editFocusEntryId}
            onSave={async (next) => {
              await onSave(next);
              setEditOpen(false);
            }}
          />
        </LakeEditModal>
      ) : null}
    </>
  );
}

export function emptyStoryLog(): StoryLog {
  return { id: newId(), title: '새 로그', body: '' };
}

export function emptyRelation(): CharacterRelation {
  return { id: newId(), name: '', relation: '' };
}
