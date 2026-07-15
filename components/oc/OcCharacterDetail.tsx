'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { OcEditForm } from '@/components/admin/OcEditForm';
import { LakeEditModal } from '@/components/ui/LakeEditModal';
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
import type { GalleryItem, ImageFrame, OcCharacter, OcFloatingQuote, StoryLog, CharacterRelation, TouchHoverStyle, TouchZone, TouchZoneLine } from '@/lib/types/character';
import { TouchReactOverlay } from '@/components/pair/TouchReactOverlay';
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

function resolveOcDetailLayout(character: OcCharacter): ImageFrame {
  return normalizeImageFrame(character.detailLayout || DEFAULT_OC_DETAIL_LAYOUT);
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

const PANEL_ANIM_MS = 920;
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
}: Props) {
  const router = useRouter();
  const { trpg } = useSiteContent();
  const { playCharacterTheme, playing } = useBgm();
  const bgmApi = useRef({ playCharacterTheme, playing });
  bgmApi.current = { playCharacterTheme, playing };

  const [editOpen, setEditOpen] = useState(false);
  const [ghostLayoutMode, setGhostLayoutMode] = useState(false);
  const [layoutTarget, setLayoutTarget] = useState<LayoutTarget>('char');
  const [detailLayout, setDetailLayout] = useState<ImageFrame>(() => resolveOcDetailLayout(character));
  const detailSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quoteLayoutMode, setQuoteLayoutMode] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [touchEditMode, setTouchEditMode] = useState(false);
  const [touchZones, setTouchZones] = useState<TouchZone[]>(() =>
    normalizeTouchZones(character.touchZones),
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
  const [panelClosing, setPanelClosing] = useState(false);
  const [shownPortrait, setShownPortrait] = useState<ShownPortrait | null>(null);
  const [charBounce, setCharBounce] = useState(false);
  const [charMotion, setCharMotion] = useState<DialogueMotion | null>(null);
  const [charFx, setCharFx] = useState<DialogueFx | null>(null);
  /** 터치 대사에서 적용한 일시 표정 (VN 없을 때도) — ref로 onPlayEnd 스탈 방지 */
  const [touchExpression, setTouchExpression] = useState<string | null>(null);
  const touchExpressionRef = useRef<string | null>(null);
  const [vnEnterAnim, setVnEnterAnim] = useState(false);
  const motionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fxClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vnEnterClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [galleryLightbox, setGalleryLightbox] = useState<GalleryItem | null>(null);
  const wasPlayingRef = useRef(false);
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const portraitRef = useRef<ShownPortrait>({ src: '', fit: 'contain', pos: 'center top' });
  const prevVnActiveRef = useRef(false);
  const [auVisual, setAuVisual] = useState<{ front: string; back: string | null; gen: number }>({
    front: '',
    back: null,
    gen: 0,
  });
  const prevAuImgRef = useRef((img?.src || '').trim());
  const vn = useVnDialogue(character);
  const { profileRows, keywordTags } = useMemo(() => splitProfileRows(character), [character]);
  const personalTheme = useMemo(() => resolveCharacterTheme(character), [character]);

  useEffect(() => {
    setCharBounce(false);
    setCharMotion(null);
    setCharFx(null);
    touchExpressionRef.current = null;
    setTouchExpression(null);
    setGhostLayoutMode(false);
    setLayoutTarget('char');
    setTouchEditMode(false);
    setDetailLayout(resolveOcDetailLayout(character));
    setGhostLayout(resolveOcGhostLayout(character));
    setGhostEnabled(character.ghostEnabled !== false);
    setGhostImg(character.ghostImg?.trim() || '');
    setTouchZones(normalizeTouchZones(character.touchZones));
    setTouchHoverStyle(normalizeTouchHoverStyle(character.touchHoverStyle));
    setTouchEnabled(false);
    setTouchSpeaker(character.touchSpeaker?.trim() || character.name || '');
    prevAuImgRef.current = (img?.src || '').trim();
  }, [character.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on character switch only

  useEffect(() => {
    if (ghostLayoutMode) return;
    setDetailLayout(resolveOcDetailLayout(character));
    setGhostLayout(resolveOcGhostLayout(character));
    setGhostEnabled(character.ghostEnabled !== false);
    setGhostImg(character.ghostImg?.trim() || '');
  }, [
    character.detailLayout,
    character.ghostLayout,
    character.ghostLayouts,
    character.ghostEnabled,
    character.ghostImg,
    ghostLayoutMode,
  ]);

  useEffect(() => {
    if (touchEditMode) return;
    setTouchZones(normalizeTouchZones(character.touchZones));
    setTouchHoverStyle(normalizeTouchHoverStyle(character.touchHoverStyle));
    setTouchSpeaker(character.touchSpeaker?.trim() || character.name || '');
  }, [
    character.touchZones,
    character.touchHoverStyle,
    character.touchSpeaker,
    character.name,
    touchEditMode,
  ]);

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
        void onSave({
          ...character,
          detailLayout: frame,
        });
      }, 420);
    },
    [character, onSave],
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
    [character, onSave, touchHoverStyle, touchSpeaker, touchZones],
  );

  const layoutEdit = Boolean(isAdmin && onSave && ghostLayoutMode && !vn.present);
  const charEdit = Boolean(layoutEdit && layoutTarget === 'char');
  const ghostEdit = Boolean(layoutEdit && layoutTarget === 'ghost' && ghostEnabled);
  const quoteEdit = Boolean(isAdmin && onSave && quoteLayoutMode && !vn.present);
  const touchEditing = Boolean(isAdmin && onSave && touchEditMode && !vn.present);
  const charDrag = usePairSlotLayoutDrag(detailLayout, persistDetailLayout, charEdit, {
    requireSelect: false,
    snapThreshold: 2.8,
  });
  const ghostDrag = usePairSlotLayoutDrag(ghostLayout, persistGhostLayout, ghostEdit, {
    requireSelect: false,
    snapThreshold: 2.8,
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
    screen.classList.add('is-pv-done', 'active');
    screen.style.setProperty('opacity', '1');
    screen.style.setProperty('filter', 'none');
    screen.style.setProperty('transform', 'none');
    screen.style.setProperty('visibility', 'visible');
  }, [character.id]);

  const portraitTarget = useMemo(
    () => ({
      /* VN 중에만 표정 URL — 평소는 기본 일러만 */
      src: vn.present ? vn.expression || img?.src || '' : img?.src || '',
      fit: img?.fit || 'contain',
      pos: img?.pos || 'center top',
      frame: img?.frame,
    }),
    [img?.fit, img?.frame, img?.pos, img?.src, vn.expression, vn.present],
  );
  const displayImgSrc = shownPortrait?.src || portraitTarget.src;
  const basePortraitSrc = (auVisual.front || img?.src || displayImgSrc || '').trim();
  const touchStackApi = useTouchPortraitStack(basePortraitSrc);
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

  /* AU 전환 — 임시 표정 버리고 해당 버전 기본 일러로 */
  useEffect(() => {
    const next = (img?.src || '').trim();
    const prev = prevAuImgRef.current;
    prevAuImgRef.current = next;

    if (!next) {
      setAuVisual({ front: '', back: null, gen: 0 });
      return;
    }

    if (prev && prev !== next) {
      touchExpressionRef.current = null;
      setTouchExpression(null);
      touchStackApi.reset(next);
      if (vn.present) vn.setExpression(null);
    }

    if (vn.present) {
      setAuVisual({ front: next, back: null, gen: 0 });
      return;
    }

    setAuVisual((prevVisual) => {
      if (!prevVisual.front) return { front: next, back: null, gen: 0 };
      if (prevVisual.front === next) return prevVisual;
      return { front: next, back: prevVisual.front, gen: prevVisual.gen + 1 };
    });
  }, [img?.src, vn.present, vn.setExpression, touchStackApi.reset]);

  useEffect(() => {
    if (!auVisual.back) return;
    const t = window.setTimeout(() => {
      setAuVisual((prev) => (prev.back ? { ...prev, back: null } : prev));
    }, 720);
    return () => window.clearTimeout(t);
  }, [auVisual.gen, auVisual.back]);

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
    setOpenLeft(null);
    setPanelId(null);
    setPanelMounted(false);
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

  const ensureDefaultAu = useCallback(() => {
    if (auIdx >= 0) onAuChange(-1);
  }, [auIdx, onAuChange]);

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

  const storyLogs: StoryLog[] = character.storyLogs?.length
    ? character.storyLogs
    : character.story
      ? [{ id: 'main', title: '서사', body: character.story }]
      : [];

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

    const id = window.requestAnimationFrame(syncRightBalance);
    const ro = new ResizeObserver(syncRightBalance);
    ro.observe(panel);
    ro.observe(scroll);
    window.addEventListener('resize', syncRightBalance);
    return () => {
      window.cancelAnimationFrame(id);
      ro.disconnect();
      window.removeEventListener('resize', syncRightBalance);
    };
  }, [character.id, relatedTrpg.length, profileRows.length, keywordTags.length, showStats]);

  const dismissLeftPanel = useCallback(() => {
    if (!openLeft && !panelMounted) return;
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    setPanelClosing(true);
    setOpenLeft(null);
    panelTimerRef.current = setTimeout(() => {
      setPanelMounted(false);
      setPanelClosing(false);
      setPanelId(null);
    }, PANEL_ANIM_MS);
  }, [openLeft, panelMounted]);

  const handleBack = useCallback(() => {
    if (editOpen) {
      setEditOpen(false);
      return;
    }
    if (galleryLightbox) {
      setGalleryLightbox(null);
      return;
    }
    if (panelMounted || openLeft) {
      dismissLeftPanel();
      return;
    }
    onBack();
  }, [dismissLeftPanel, editOpen, galleryLightbox, onBack, openLeft, panelMounted]);

  useEffect(() => {
    onBindBack?.(handleBack);
    return () => onBindBack?.(null);
  }, [handleBack, onBindBack]);

  const leftPanelOpen = panelMounted || !!openLeft;
  useLakeBackNavigation(leftPanelOpen, dismissLeftPanel, 'oc-detail-panel');
  useLakeBackNavigation(!!galleryLightbox, () => setGalleryLightbox(null), 'oc-detail-gallery');
  useLakeBackNavigation(editOpen, () => setEditOpen(false), 'oc-detail-edit');

  function toggleLeft(id: string) {
    if (ghostLayoutMode) setGhostLayoutMode(false);
    if (quoteLayoutMode) setQuoteLayoutMode(false);
    if (touchEditMode) setTouchEditMode(false);
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    if (openLeft === id) {
      setPanelClosing(true);
      setOpenLeft(null);
      panelTimerRef.current = setTimeout(() => {
        setPanelMounted(false);
        setPanelClosing(false);
        setPanelId(null);
      }, PANEL_ANIM_MS);
      return;
    }
    setPanelClosing(false);
    setOpenLeft(id);
    setPanelId(id);
    setPanelMounted(true);
  }

  const leftSections = useMemo<LeftSection[]>(() => {
    const sections: LeftSection[] = [];

    if (character.gallery?.length) {
      sections.push({
        id: 'gallery',
        label: '갤러리',
        layout: 'gallery',
        content: (
          <div className="oc-acc-gallery">
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

    if (storyLogs.length) {
      sections.push({
        id: 'story',
        label: '서사 로그',
        content: (
          <div className="oc-acc-story">
            {storyLogs.map((log) => (
              <div key={log.id} className="oc-acc-log">
                <div className="oc-acc-log-title">{log.title}</div>
                {log.date && <div className="oc-acc-log-date">{log.date}</div>}
                <OcRichText text={log.body} className="oc-acc-log-body" />
              </div>
            ))}
          </div>
        ),
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

    if (character.special) {
      sections.push({
        id: 'special',
        label: '특이사항',
        content: <OcRichText text={character.special} className="oc-acc-text" />,
      });
    }

    if (character.hobby || character.likes?.length || character.hates?.length) {
      sections.push({
        id: 'etc',
        label: '기타',
        content: (
          <div className="oc-acc-etc">
            {character.hobby && (
              <div className="oc-acc-etc-row">
                <em>Hobby</em>
                <OcRichText text={character.hobby} className="oc-acc-etc-value" />
              </div>
            )}
            {character.likes?.length ? (
              <div className="oc-acc-etc-row">
                <em>Likes</em>
                <OcRichText text={character.likes.join(', ')} className="oc-acc-etc-value" />
              </div>
            ) : null}
            {character.hates?.length ? (
              <div className="oc-acc-etc-row">
                <em>Hates</em>
                <OcRichText text={character.hates.join(', ')} className="oc-acc-etc-value" />
              </div>
            ) : null}
          </div>
        ),
      });
    }

    if (character.novel?.length) {
      sections.push({
        id: 'novel',
        label: '프리뷰',
        content: (
          <div className="oc-acc-novel">
            {character.novel.map((n, i) => (
              <div key={i} className="oc-acc-novel-item">
                {n.title && <div className="oc-acc-log-title">{n.title}</div>}
                {n.preview ? <OcRichText text={n.preview} className="oc-acc-text" /> : null}
              </div>
            ))}
          </div>
        ),
      });
    }

    return sections;
  }, [character, relationships, storyLogs]);

  const panelSection = panelId ? leftSections.find((s) => s.id === panelId) : null;

  return (
    <>
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
              title="메인·고스트 위치 조절"
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
              {ghostLayoutMode ? '✓ 위치' : '위치'}
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
              title="터치 반응 영역 편집"
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
              {touchEditMode ? '✓ 터치' : '터치'}
            </button>
            <button type="button" className="btn-edit" onClick={() => setEditOpen(true)}>
              ✎ 수정
            </button>
          </div>
        )}
      </div>

      <div
        className={`game-body oc-detail-body${openLeft ? ' has-left-open' : ''}${vn.present ? ' vn-active' : ''}${layoutEdit ? ' is-ghost-layout-edit' : ''}${charEdit ? ' is-char-layout-target' : ''}${ghostEdit ? ' is-ghost-layout-target' : ''}`}
      >
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
                  {ghostEnabled ? '드래그 · 휠 · 중앙선 스냅' : '표시를 켜면 조절할 수 있어요'}
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
                <span className="oc-ghost-tools__hint">드래그 · 휠 · 중앙선 스냅</span>
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
              paused={vn.present || ghostLayoutMode || touchEditMode}
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
            }${auVisual.back ? ' is-au-swapping' : ''}${touchEditing ? ' is-touch-edit' : ''}`}
          >
            {displayImgSrc || basePortraitSrc ? (
              <>
                <div
                  className={`oc-char-motion-host${
                    charBounce ? ' oc-char-bounce-once is-char-motion' : ocMotionClass(charMotion)
                  }`}
                >
                  <div
                    ref={charDrag.elRef}
                    className={`oc-char-detail-layout${charEdit ? ' is-layout-editable' : ''}${charDrag.selected ? ' is-layout-selected' : ''}${charDrag.dragging ? ' is-dragging' : ''}`}
                    style={{
                      ...charDrag.layoutStyle(),
                      transformOrigin: 'center bottom',
                    }}
                    {...charDrag.handlers}
                  >
                    <div
                      className={`oc-char-portrait-stack${touchStackApi.softRevert ? ' is-soft-revert' : ''}`}
                    >
                      {charMotion === 'pulse' ? (
                        <VnCharBloom
                          src={
                            touchStackApi.stack.layers[touchStackApi.stack.front] ||
                            portraitTarget.src ||
                            basePortraitSrc
                          }
                          imgStyle={portraitImgStyle(
                            shownPortrait?.fit || portraitTarget.fit,
                            shownPortrait?.pos || portraitTarget.pos,
                            portraitTarget.frame || img?.frame,
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
                          src={
                            touchStackApi.stack.layers[layer] ||
                            portraitTarget.src ||
                            basePortraitSrc
                          }
                          alt=""
                          decoding="sync"
                          draggable={false}
                          style={portraitImgStyle(
                            shownPortrait?.fit || portraitTarget.fit,
                            shownPortrait?.pos || portraitTarget.pos,
                            portraitTarget.frame || img?.frame,
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
        </div>

        {!vn.present ? (
          <OcAuPicker
            character={character}
            auIdx={auIdx}
            onAuChange={onAuChange}
            disabled={touchEnabled}
          />
        ) : null}

        {leftSections.length > 0 && (
          <nav className="oc-detail-left" aria-label="추가 정보">
            {leftSections.map((sec) => {
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
          </nav>
        )}

        {panelMounted && panelSection && (
          <div
            className={`oc-left-panel-shell${panelClosing ? ' is-closing' : ' is-open'}${
              panelSection.layout ? ` oc-left-panel-shell--${panelSection.layout}` : ' oc-left-panel-shell--text'
            }`}
            role="region"
            aria-label={panelSection.label}
            aria-hidden={panelClosing}
          >
            <div className="oc-left-content-panel">
              <div className="oc-left-content-inner" key={panelId}>
                <h3 className="oc-left-content-title">{panelSection.label}</h3>
                <div className="oc-left-content-body">{panelSection.content}</div>
              </div>
            </div>
          </div>
        )}

        <div className={`oc-detail-right${rightReady ? ' is-ready' : ''}`} ref={rightPanelRef}>
          <div className="oc-detail-right-scroll" ref={rightScrollRef}>
          <header className="oc-identity">
            <div className="oc-identity-no">
              <span className="oc-identity-no-label">No.</span>
              <span className="oc-identity-no-num">{charNo}</span>
            </div>
            {character.nameSub && <div className="oc-identity-sub">{character.nameSub}</div>}
            <div className="oc-identity-name-block">
              <h1 className="oc-identity-name">{character.name}</h1>
              <div className="oc-identity-accent-line" aria-hidden="true" />
            </div>
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
                    <div key={p.k} className="oc-attr-cell oc-attr-row">
                      <div className="oc-attr-row-body oc-attr-inline">
                        <span className="oc-attr-label">{p.k}</span>
                        <span className="oc-attr-value">{p.v}</span>
                      </div>
                    </div>
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

      {isAdmin && onSave ? (
        <LakeEditModal
          open={editOpen}
          className="lake-edit-modal--oc"
          title="캐릭터 수정"
          eyebrow="ADMIN · OC"
          onClose={() => setEditOpen(false)}
        >
          <OcEditForm
            key={character.id}
            character={character}
            categories={categories}
            compact
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
