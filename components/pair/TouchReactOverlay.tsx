'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { TouchHoverStyle, TouchZone, TouchZoneLine } from '@/lib/types/character';
import {
  clampTouchBox,
  emptyTouchZoneLine,
  moveTouchBox,
  newTouchZoneId,
  rectFromPoints,
  resizeTouchBox,
  TOUCH_HOVER_STYLES,
  TOUCH_ZONE_MAX,
  TOUCH_ZONE_MIN_SIZE,
  touchZoneOverlapsAny,
  type TouchResizeCorner,
} from '@/lib/pair/touchZones';
import {
  DIALOGUE_FX_OPTIONS,
  DIALOGUE_MOTION_OPTIONS,
  isDialogueFx,
  isDialogueMotion,
  normalizeMotion,
} from '@/lib/vn/motions';
import { uploadImageFile } from '@/lib/r2/client';
import { balanceDialogueText } from '@/lib/shared/balanceDialogueText';

const DIALOGUE_HOLD_MS = 1600;
const TYPE_MS = 95;
const MOVE_THRESHOLD = 0.35;

type DraftRect = { x0: number; y0: number; x1: number; y1: number };

type BubbleState = {
  name: string;
  text: string;
  key: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type AdjustState =
  | {
      kind: 'move';
      id: string;
      startX: number;
      startY: number;
      orig: TouchZone;
      moved: boolean;
    }
  | {
      kind: 'resize';
      id: string;
      corner: TouchResizeCorner;
      startX: number;
      startY: number;
      orig: TouchZone;
      moved: boolean;
    };

export type TouchReactOverlayProps = {
  zones: TouchZone[];
  hoverStyle: TouchHoverStyle;
  /** 터치 반응 모드 ON — 체크 시 터치만, OFF면 부모에서 일러스트 VN 사용 */
  touchEnabled: boolean;
  speaker: string;
  editable?: boolean;
  interactive?: boolean;
  onZonesChange?: (zones: TouchZone[]) => void;
  onHoverStyleChange?: (style: TouchHoverStyle) => void;
  onTouchEnabledChange?: (v: boolean) => void;
  onSpeakerChange?: (s: string) => void;
  /** 터치 대사 재생 시 부모에게 표정/모션 전달 */
  onPlayLine?: (line: TouchZoneLine) => void;
  /** 대사 버블이 끝날 때 */
  onPlayEnd?: () => void;
  /** OC 탭 방문 단위: true면 TOUCH! 힌트 숨김 */
  touchHintDismissed?: boolean;
  onTouchHintDismiss?: () => void;
};

const RESIZE_CORNERS: TouchResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

function pctFromEvent(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return { x: 0, y: 0 };
  return {
    x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)),
    y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)),
  };
}

/**
 * 세로 앵커 — 기본은 영역 중앙.
 * 아래쪽 부위일 때만 살짝 올리고, 영역에서 멀어지지 않게 클램프.
 */
function bubbleVertical(b: BubbleState): { top: number; yShift: string } {
  const zoneTop = b.y;
  const zoneMid = b.y + b.h / 2;
  /* 중상 이하는 0, 발·다리 쪽으로 갈수록 1 */
  const depth = Math.max(0, Math.min(1, (zoneMid - 55) / 35));
  const ease = depth * depth;
  /* 최대 ~9%만 상승 — 영역과의 거리 유지 */
  const lift = ease * Math.min(9, 5 + b.h * 0.2);

  let top = zoneMid - lift;
  /* 영역 윗변보다 최대 6% 이상 올라가지 않음 */
  top = Math.max(zoneTop - 6, top);
  top = Math.max(4, Math.min(92, top));

  /* 아래 부위면 상자 기준점을 조금 위로 두어 시야 확보 (영역 옆 유지) */
  const yShift = ease > 0.12 ? `${-50 - ease * 22}%` : '-50%';

  return { top, yShift };
}

function bubbleStyle(b: BubbleState): CSSProperties {
  const len = b.text.length;
  const blurBoost = Math.min(8, Math.floor(len / 14));
  const padY = 10 + Math.min(8, Math.floor(len / 24));
  const padX = 14 + Math.min(10, Math.floor(len / 18));
  const maxW = Math.min(46, 22 + Math.floor(len / 3.2));
  const blurVars = {
    ['--touch-blur' as string]: `${8 + blurBoost}px`,
    padding: `${padY}px ${padX}px`,
    maxWidth: `min(${maxW}%, 300px)`,
  };

  const cx = b.x + b.w / 2;
  const { top, yShift } = bubbleVertical(b);
  const gap = 2.4;
  if (cx <= 50) {
    return {
      ...blurVars,
      left: `${Math.max(1, b.x - gap)}%`,
      top: `${top}%`,
      transform: `translate(-100%, ${yShift})`,
      textAlign: 'right',
    };
  }
  return {
    ...blurVars,
    left: `${Math.min(99, b.x + b.w + gap)}%`,
    top: `${top}%`,
    transform: `translateY(${yShift})`,
    textAlign: 'left',
  };
}

function applyBox(zone: TouchZone, box: ReturnType<typeof clampTouchBox>): TouchZone {
  return { ...zone, ...box };
}

function sanitizeLineDraft(line: TouchZoneLine): TouchZoneLine | null {
  const text = line.text.trim();
  if (!text) return null;
  const expression = String(line.expression ?? '').trim() || undefined;
  const motion = normalizeMotion(line.motion) || undefined;
  const fx = isDialogueFx(line.fx) ? line.fx : undefined;
  return {
    text,
    ...(expression ? { expression } : {}),
    ...(motion ? { motion } : {}),
    ...(fx ? { fx } : {}),
  };
}

export function TouchReactOverlay({
  zones,
  hoverStyle,
  touchEnabled,
  speaker,
  editable = false,
  interactive = true,
  onZonesChange,
  onHoverStyleChange,
  onTouchEnabledChange,
  onSpeakerChange,
  onPlayLine,
  onPlayEnd,
  touchHintDismissed = false,
  onTouchHintDismiss,
}: TouchReactOverlayProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const adjustRef = useRef<AdjustState | null>(null);
  const suppressClickRef = useRef(false);
  const editorDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [cursorHint, setCursorHint] = useState<{
    x: number;
    y: number;
    leaving: boolean;
  } | null>(null);
  const hintLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ripples, setRipples] = useState<{ id: string; key: number }[]>([]);
  const [lineCursor, setLineCursor] = useState<Record<string, number>>({});
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [bubbleOut, setBubbleOut] = useState(false);
  const [typedLen, setTypedLen] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [draft, setDraft] = useState<DraftRect | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [lineDrafts, setLineDrafts] = useState<TouchZoneLine[]>([emptyTouchZoneLine()]);
  const [liveZones, setLiveZones] = useState<TouchZone[] | null>(null);
  const liveZonesRef = useRef<TouchZone[] | null>(null);
  const [uploadingExprIdx, setUploadingExprIdx] = useState<number | null>(null);
  const [editorPos, setEditorPos] = useState<{ left: number; top: number } | null>(null);

  const displayZones = liveZones ?? zones;
  const selected = displayZones.find((z) => z.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setLineDrafts([emptyTouchZoneLine()]);
      return;
    }
    setLineDrafts(
      selected.lines.length
        ? selected.lines.map((l) => ({ ...l }))
        : [emptyTouchZoneLine()],
    );
  }, [selected?.id]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (outTimer.current) clearTimeout(outTimer.current);
      if (typeTimer.current) clearInterval(typeTimer.current);
      if (hintLeaveTimer.current) clearTimeout(hintLeaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (touchEnabled || editable) return;
    clearBubbleTimers();
    setBubble(null);
    setBubbleOut(false);
    setTypedLen(0);
  }, [touchEnabled, editable]);

  useEffect(() => {
    if (!editable) {
      adjustRef.current = null;
      liveZonesRef.current = null;
      setLiveZones(null);
      setDraft(null);
      setAdjusting(false);
      setSelectedId(null);
    }
  }, [editable]);

  const clearBubbleTimers = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (outTimer.current) clearTimeout(outTimer.current);
    if (typeTimer.current) clearInterval(typeTimer.current);
    hideTimer.current = null;
    outTimer.current = null;
    typeTimer.current = null;
  };

  const showCursorHint = (clientX: number, clientY: number) => {
    if (editable || !interactive || touchHintDismissed) return;
    const el = layerRef.current;
    if (!el) return;
    if (hintLeaveTimer.current) {
      clearTimeout(hintLeaveTimer.current);
      hintLeaveTimer.current = null;
    }
    const p = pctFromEvent(el, clientX, clientY);
    setCursorHint({ x: p.x, y: p.y, leaving: false });
  };

  const hideCursorHint = () => {
    setCursorHint((prev) => {
      if (!prev || prev.leaving) return prev;
      return { ...prev, leaving: true };
    });
    if (hintLeaveTimer.current) clearTimeout(hintLeaveTimer.current);
    hintLeaveTimer.current = setTimeout(() => {
      setCursorHint(null);
      hintLeaveTimer.current = null;
    }, 150);
  };

  const dismissTouchHint = () => {
    if (touchHintDismissed) return;
    onTouchHintDismiss?.();
    hideCursorHint();
  };

  const scheduleBubbleHide = useCallback(
    (textLen: number) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (outTimer.current) clearTimeout(outTimer.current);
      const hold = DIALOGUE_HOLD_MS + Math.min(1800, textLen * 28);
      hideTimer.current = setTimeout(() => {
        setBubbleOut(true);
        /* 대사 사라지기 시작과 동시에 표정 복귀 */
        onPlayEnd?.();
        outTimer.current = setTimeout(() => {
          setBubble(null);
          setBubbleOut(false);
          setTypedLen(0);
        }, 320);
      }, hold);
    },
    [onPlayEnd],
  );

  const showDialogue = useCallback(
    (text: string, zone: TouchZone) => {
      if (!text.trim()) return;
      clearBubbleTimers();
      const raw = text.trim();
      const layer = layerRef.current;
      const maxW = layer
        ? Math.max(72, Math.min(layer.clientWidth * 0.42, 280) - 6)
        : 200;
      const full = balanceDialogueText(
        raw,
        maxW,
        '400 16.5px "Gowun Dodum", "Noto Sans KR", sans-serif',
      );
      setBubbleOut(false);
      setTypedLen(0);
      setBubble({
        name: speaker.trim() || '…',
        text: full,
        key: Date.now(),
        x: zone.x,
        y: zone.y,
        w: zone.w,
        h: zone.h,
      });

      let i = 0;
      typeTimer.current = setInterval(() => {
        i += 1;
        setTypedLen(i);
        if (i >= full.length) {
          if (typeTimer.current) clearInterval(typeTimer.current);
          typeTimer.current = null;
          scheduleBubbleHide(full.length);
        }
      }, TYPE_MS);
    },
    [speaker, scheduleBubbleHide],
  );

  const skipOrHoldBubble = () => {
    if (!bubble || bubbleOut) return;
    if (typedLen < bubble.text.length) {
      if (typeTimer.current) clearInterval(typeTimer.current);
      typeTimer.current = null;
      setTypedLen(bubble.text.length);
      scheduleBubbleHide(bubble.text.length);
      return;
    }
    /* 이미 다 쳤으면 즉시 페이드 아웃 — 표정도 동시에 복귀 */
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setBubbleOut(true);
    onPlayEnd?.();
    outTimer.current = setTimeout(() => {
      setBubble(null);
      setBubbleOut(false);
      setTypedLen(0);
    }, 280);
  };

  const triggerRipple = (zoneId: string) => {
    const key = Date.now();
    setRipples((prev) => [...prev.filter((r) => r.id !== zoneId), { id: zoneId, key }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => !(r.id === zoneId && r.key === key)));
    }, 550);
  };

  const onZoneActivate = (zone: TouchZone) => {
    if (editable) {
      setSelectedId(zone.id);
      return;
    }
    dismissTouchHint();
    triggerRipple(zone.id);
    const lines = zone.lines.filter((l) => l.text.trim());
    if (!lines.length) return;
    const idx = lineCursor[zone.id] ?? 0;
    const next = idx % lines.length;
    const line = lines[next];
    /* 표정·대사 동시 — 표정 쪽을 먼저 커밋 */
    onPlayLine?.(line);
    showDialogue(line.text, zone);
    setLineCursor((prev) => ({ ...prev, [zone.id]: next + 1 }));
  };

  const patchLiveZone = (id: string, box: ReturnType<typeof clampTouchBox>) => {
    setLiveZones((prev) => {
      const base = prev ?? zones;
      const next = base.map((z) => (z.id === id ? applyBox(z, box) : z));
      liveZonesRef.current = next;
      return next;
    });
  };

  const beginAdjust = (e: ReactPointerEvent, next: AdjustState) => {
    if (!editable || !onZonesChange) return;
    e.preventDefault();
    e.stopPropagation();
    const el = layerRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    adjustRef.current = next;
    setAdjusting(true);
    const snapshot = zones.map((z) => (z.id === next.id ? { ...z } : z));
    liveZonesRef.current = snapshot;
    setLiveZones(snapshot);
  };

  const onZonePointerDown = (e: ReactPointerEvent, zone: TouchZone) => {
    if (!editable || !onZonesChange || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-touch-handle]')) return;
    const el = layerRef.current;
    if (!el) return;
    const p = pctFromEvent(el, e.clientX, e.clientY);
    beginAdjust(e, {
      kind: 'move',
      id: zone.id,
      startX: p.x,
      startY: p.y,
      orig: { ...zone },
      moved: false,
    });
  };

  const onHandlePointerDown = (
    e: ReactPointerEvent,
    zone: TouchZone,
    corner: TouchResizeCorner,
  ) => {
    if (!editable || !onZonesChange || e.button !== 0) return;
    const el = layerRef.current;
    if (!el) return;
    const p = pctFromEvent(el, e.clientX, e.clientY);
    beginAdjust(e, {
      kind: 'resize',
      id: zone.id,
      corner,
      startX: p.x,
      startY: p.y,
      orig: { ...zone },
      moved: false,
    });
  };

  const finishAdjust = (e: ReactPointerEvent<HTMLDivElement>) => {
    const adj = adjustRef.current;
    if (!adj || !onZonesChange) {
      adjustRef.current = null;
      setAdjusting(false);
      return;
    }
    try {
      layerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    adjustRef.current = null;
    setAdjusting(false);
    if (adj.moved) suppressClickRef.current = true;

    const resolveSelection = () => {
      if (!adj.moved) {
        setSelectedId(adj.id);
      } else {
        setSelectedId((prev) => (prev === adj.id ? prev : null));
      }
    };

    const working = liveZonesRef.current ?? zones;
    const current = working.find((z) => z.id === adj.id);
    if (!current) {
      liveZonesRef.current = null;
      setLiveZones(null);
      resolveSelection();
      return;
    }

    const box = clampTouchBox(current);
    const nextZone = applyBox(adj.orig, box);
    if (touchZoneOverlapsAny(nextZone, zones, adj.id)) {
      liveZonesRef.current = null;
      setLiveZones(null);
      resolveSelection();
      return;
    }
    onZonesChange(zones.map((z) => (z.id === adj.id ? nextZone : z)));
    liveZonesRef.current = null;
    setLiveZones(null);
    resolveSelection();
  };

  const onLayerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || !onZonesChange) return;
    if (e.button !== 0) return;
    if (adjustRef.current) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-touch-zone]') ||
      target.closest('[data-touch-handle]') ||
      target.closest('.touch-react__editor')
    ) {
      return;
    }

    if (selectedId) {
      setSelectedId(null);
      return;
    }

    if (zones.length >= TOUCH_ZONE_MAX) return;
    const el = layerRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const p = pctFromEvent(el, e.clientX, e.clientY);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onLayerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = layerRef.current;
    if (!el) return;
    const p = pctFromEvent(el, e.clientX, e.clientY);

    const adj = adjustRef.current;
    if (adj) {
      const dx = p.x - adj.startX;
      const dy = p.y - adj.startY;
      if (!adj.moved && Math.hypot(dx, dy) >= MOVE_THRESHOLD) {
        adj.moved = true;
      }
      const box =
        adj.kind === 'move'
          ? moveTouchBox(adj.orig, dx, dy)
          : resizeTouchBox(adj.orig, adj.corner, dx, dy);
      patchLiveZone(adj.id, box);
      return;
    }

    if (!draft) return;
    setDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : null));
  };

  const onLayerPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (adjustRef.current) {
      finishAdjust(e);
      return;
    }
    if (!draft || !onZonesChange) {
      setDraft(null);
      return;
    }
    try {
      layerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const box = rectFromPoints(draft.x0, draft.y0, draft.x1, draft.y1);
    setDraft(null);
    if (box.w < TOUCH_ZONE_MIN_SIZE || box.h < TOUCH_ZONE_MIN_SIZE) return;
    if (touchZoneOverlapsAny(box, zones)) return;
    if (zones.length >= TOUCH_ZONE_MAX) return;
    const id = newTouchZoneId();
    const next: TouchZone = {
      id,
      ...box,
      lines: [],
    };
    onZonesChange([...zones, next]);
    setSelectedId(id);
  };

  const saveSelectedLines = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!selected || !onZonesChange) return;
    const lines = lineDrafts.map(sanitizeLineDraft).filter((l): l is TouchZoneLine => !!l);
    onZonesChange(
      zones.map((z) =>
        z.id === selected.id
          ? {
              ...z,
              lines,
            }
          : z,
      ),
    );
    setSelectedId(null);
  };

  const deleteSelected = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!selected || !onZonesChange) return;
    onZonesChange(zones.filter((z) => z.id !== selected.id));
    setSelectedId(null);
  };

  const uploadExpression = async (i: number, file: File | undefined) => {
    if (!file) return;
    setUploadingExprIdx(i);
    try {
      const url = await uploadImageFile(file, 'oc/expression');
      setLineDrafts((prev) =>
        prev.map((p, j) => (j === i ? { ...p, expression: url } : p)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '표정 이미지 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setUploadingExprIdx(null);
    }
  };

  const onEditorHeadPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const root = rootRef.current;
    const editor = e.currentTarget.closest('.touch-react__editor') as HTMLElement | null;
    if (!root || !editor) return;
    e.preventDefault();
    e.stopPropagation();

    const rootRect = root.getBoundingClientRect();
    const edRect = editor.getBoundingClientRect();
    const origLeft = edRect.left - rootRect.left;
    const origTop = edRect.top - rootRect.top;
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    setEditorPos({ left: origLeft, top: origTop });
    editorDragRef.current = {
      startClientX,
      startClientY,
      origLeft,
      origTop,
    };

    const onMove = (ev: PointerEvent) => {
      const drag = editorDragRef.current;
      const r = rootRef.current;
      if (!drag || !r) return;
      ev.preventDefault();
      const rr = r.getBoundingClientRect();
      const dx = ev.clientX - drag.startClientX;
      const dy = ev.clientY - drag.startClientY;
      const maxL = Math.max(8, rr.width - 48);
      const maxT = Math.max(8, rr.height - 48);
      setEditorPos({
        left: Math.min(maxL, Math.max(0, drag.origLeft + dx)),
        top: Math.min(maxT, Math.max(0, drag.origTop + dy)),
      });
    };
    const onUp = () => {
      editorDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const draftBox = draft ? rectFromPoints(draft.x0, draft.y0, draft.x1, draft.y1) : null;
  const canDraw = editable && !selectedId && !adjusting && zones.length < TOUCH_ZONE_MAX;
  const showZones = editable || (touchEnabled && zones.length > 0);

  return (
    <div
      ref={rootRef}
      className={`touch-react${editable ? ' is-editable' : ''}${touchEnabled ? ' is-touch-on' : ''}${
        interactive ? '' : ' is-inert'
      }${selectedId && !adjusting ? ' has-editor' : ''}`}
      data-hover-style={hoverStyle}
    >
      {editable ? (
        <div className="touch-react__toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <div className="touch-react__style-row" role="radiogroup" aria-label="호버 애니메이션">
            {TOUCH_HOVER_STYLES.map((opt) => (
              <label key={opt.id} className="touch-react__style-opt">
                <input
                  type="radio"
                  name="touch-hover-style"
                  checked={hoverStyle === opt.id}
                  onChange={() => onHoverStyleChange?.(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <label className="touch-react__speaker">
            <span>대사 이름</span>
            <input
              type="text"
              value={speaker}
              placeholder="캐릭터 이름"
              onChange={(e) => onSpeakerChange?.(e.target.value)}
            />
          </label>
          <span className="touch-react__hint">
            {zones.length}/{TOUCH_ZONE_MAX} · 빈곳=추가 · 영역=이동 · 모서리=크기
          </span>
        </div>
      ) : null}

      {showZones ? (
        <div
          ref={layerRef}
          className={`touch-react__layer${canDraw ? ' can-draw' : ''}${editable ? ' is-editing' : ''}`}
          onPointerDown={onLayerPointerDown}
          onPointerMove={onLayerPointerMove}
          onPointerUp={onLayerPointerUp}
          onPointerCancel={() => {
            adjustRef.current = null;
            liveZonesRef.current = null;
            setLiveZones(null);
            setDraft(null);
            setAdjusting(false);
          }}
        >
          {displayZones.map((z) => {
            const hovered = hoverId === z.id;
            const rippling = ripples.some((r) => r.id === z.id);
            const isSelected = selectedId === z.id;
            return (
              <div
                key={z.id}
                data-touch-zone={z.id}
                className={[
                  'touch-react__zone',
                  `touch-react__zone--${hoverStyle}`,
                  hovered ? 'is-hover' : '',
                  rippling ? 'is-ripple' : '',
                  isSelected ? 'is-selected' : '',
                  editable ? 'is-edit' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: `${z.x}%`,
                  top: `${z.y}%`,
                  width: `${z.w}%`,
                  height: `${z.h}%`,
                }}
              >
                <button
                  type="button"
                  className="touch-react__zone-hit"
                  aria-label={editable ? '터치 영역 편집' : '터치 반응'}
                  tabIndex={interactive ? 0 : -1}
                  disabled={!interactive}
                  onPointerEnter={(e) => {
                    if (!interactive) return;
                    setHoverId(z.id);
                    if (!editable) showCursorHint(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (!editable && interactive) showCursorHint(e.clientX, e.clientY);
                  }}
                  onPointerLeave={() => {
                    setHoverId((id) => (id === z.id ? null : id));
                    if (!editable) hideCursorHint();
                  }}
                  onPointerDown={(e) => {
                    if (editable) {
                      onZonePointerDown(e, z);
                      return;
                    }
                    if (!interactive || e.button !== 0) return;
                    /* 손가락/마우스 누름 즉시 — 뗄 때까지 기다리지 않음 */
                    e.preventDefault();
                    e.stopPropagation();
                    onZoneActivate(z);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!interactive) return;
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    /* view: 마우스/터치는 pointerdown 처리. 키보드(detail=0)만 click */
                    if (!editable && e.detail !== 0) return;
                    onZoneActivate(z);
                  }}
                >
                  {hoverStyle === 'corners' ? (
                    <span className="touch-react__brackets" aria-hidden>
                      <i className="touch-react__br touch-react__br--tl" />
                      <i className="touch-react__br touch-react__br--tr" />
                      <i className="touch-react__br touch-react__br--bl" />
                      <i className="touch-react__br touch-react__br--br" />
                    </span>
                  ) : (
                    <span className="touch-react__dash" aria-hidden />
                  )}
                  {rippling && hoverStyle === 'corners' ? (
                    <span className="touch-react__ripple" aria-hidden />
                  ) : null}
                </button>

                {editable
                  ? RESIZE_CORNERS.map((corner) => (
                      <span
                        key={corner}
                        data-touch-handle={corner}
                        className={`touch-react__handle touch-react__handle--${corner}`}
                        onPointerDown={(e) => onHandlePointerDown(e, z, corner)}
                      />
                    ))
                  : null}
              </div>
            );
          })}

          {draftBox ? (
            <div
              className="touch-react__draft"
              style={{
                left: `${draftBox.x}%`,
                top: `${draftBox.y}%`,
                width: `${draftBox.w}%`,
                height: `${draftBox.h}%`,
              }}
              aria-hidden
            />
          ) : null}

          {cursorHint && !editable && !touchHintDismissed ? (
            <span
              className={`touch-react__cursor-hint${cursorHint.leaving ? ' is-out' : ' is-in'}`}
              style={{ left: `${cursorHint.x}%`, top: `${cursorHint.y}%` }}
              aria-hidden
            >
              TOUCH!
            </span>
          ) : null}
        </div>
      ) : null}

      {bubble && !editable ? (
        <div
          key={bubble.key}
          className={`touch-react__bubble is-near-zone${bubbleOut ? ' is-out' : ' is-in'}`}
          style={bubbleStyle(bubble)}
          role="status"
          aria-live="polite"
          onClick={(e) => {
            e.stopPropagation();
            skipOrHoldBubble();
          }}
        >
          <div className="touch-react__bubble-blur" aria-hidden="true" />
          <div className="touch-react__bubble-name">{bubble.name}</div>
          <div className="touch-react__bubble-text">
            {bubble.text.slice(0, typedLen)}
          </div>
        </div>
      ) : null}

      {editable && selected && !adjusting ? (
        <div
          className={`touch-react__editor${editorPos ? ' is-placed' : ''}`}
          style={
            editorPos
              ? { left: editorPos.left, top: editorPos.top, right: 'auto', bottom: 'auto' }
              : undefined
          }
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="touch-react__editor-head"
            onPointerDown={onEditorHeadPointerDown}
            title="드래그해서 패널 위치 이동"
          >
            <span className="touch-react__editor-drag" aria-hidden>
              ⠿
            </span>
            <strong>
              영역 대사 ({lineDrafts.filter((l) => l.text.trim()).length})
            </strong>
            <button type="button" className="touch-react__editor-del" onClick={deleteSelected}>
              영역 삭제
            </button>
          </div>
          <p className="touch-react__editor-hint">
            위 제목을 드래그해 패널을 옮길 수 있어요. 영역 드래그·모서리로 크기 조정이 가능합니다.
          </p>

          <ul className="touch-react__line-list">
            {lineDrafts.map((line, i) => (
              <li
                key={i}
                className="touch-react__line-row"
                style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
              >
                <span className="touch-react__line-idx">{i + 1}</span>
                <div
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <input
                    type="text"
                    value={line.text}
                    placeholder={`대사 ${i + 1}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLineDrafts((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, text: v } : p)),
                      );
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <select
                      aria-label={`대사 ${i + 1} 모션`}
                      value={isDialogueMotion(line.motion) ? line.motion : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLineDrafts((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? { ...p, motion: isDialogueMotion(v) ? v : '' }
                              : p,
                          ),
                        );
                      }}
                      style={{ flex: '1 1 7rem', minWidth: 0 }}
                    >
                      <option value="">모션 없음</option>
                      {DIALOGUE_MOTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`대사 ${i + 1} 이펙트`}
                      value={isDialogueFx(line.fx) ? line.fx : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLineDrafts((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, fx: isDialogueFx(v) ? v : '' } : p,
                          ),
                        );
                      }}
                      style={{ flex: '1 1 7rem', minWidth: 0 }}
                    >
                      <option value="">이펙트 없음</option>
                      {DIALOGUE_FX_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={line.expression ?? ''}
                      placeholder="표정 이미지 URL"
                      onChange={(e) => {
                        const v = e.target.value;
                        setLineDrafts((prev) =>
                          prev.map((p, j) => (j === i ? { ...p, expression: v } : p)),
                        );
                      }}
                    />
                    <label style={{ flex: '0 0 auto', cursor: 'pointer' }}>
                      <span
                        className="touch-react__line-add"
                        style={{
                          display: 'inline-block',
                          width: 'auto',
                          marginTop: 0,
                          padding: '6px 8px',
                          whiteSpace: 'nowrap',
                          opacity: uploadingExprIdx === i ? 0.5 : 1,
                        }}
                      >
                        {uploadingExprIdx === i ? '…' : '업로드'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={uploadingExprIdx === i}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          void uploadExpression(i, file);
                        }}
                      />
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  className="touch-react__line-remove"
                  aria-label={`대사 ${i + 1} 삭제`}
                  disabled={lineDrafts.length <= 1}
                  onClick={() =>
                    setLineDrafts((prev) =>
                      prev.length <= 1 ? prev : prev.filter((_, j) => j !== i),
                    )
                  }
                >
                  −
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="touch-react__line-add"
            onClick={() => setLineDrafts((prev) => [...prev, emptyTouchZoneLine()])}
          >
            + 대사 추가
          </button>
          <div className="touch-react__editor-actions">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedId(null);
              }}
            >
              닫기
            </button>
            <button type="button" className="is-primary" onClick={saveSelectedLines}>
              적용
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
