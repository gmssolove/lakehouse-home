'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  DEFAULT_HANDOUT_LAYOUT,
  HANDOUT_EXIT_MS,
  handoutFigureStyle,
  normalizeHandoutLayoutOrDefault,
} from '@/lib/vn/handoutLayout';
import { clampHandoutRadius, type HandoutLayout } from '@/lib/vn/menuTheme';
import { useStagePixelSize, type StandPose } from '@/lib/vn/useStandPoseDrag';
import styles from './vn-engine.module.css';

type Props = {
  handout: string | null;
  resolveUrl: (key: string) => string | undefined;
  layouts?: Record<string, HandoutLayout | StandPose>;
  poseEditMode?: boolean;
  onPoseChange?: (handoutKey: string, pose: HandoutLayout) => void;
};

type Vis = 'off' | 'mount' | 'open' | 'leave';

const POSE_EPS = 0.08;

function poseChanged(a: HandoutLayout, b: HandoutLayout) {
  return (
    Math.abs(a.x - b.x) > POSE_EPS ||
    Math.abs(a.y - b.y) > POSE_EPS ||
    Math.abs(a.scale - b.scale) > 0.002 ||
    (a.radius ?? 0) !== (b.radius ?? 0)
  );
}

/**
 * 키퍼 핸드아웃.
 * - handout prop 이 있는 한 절대 숨기지 않음
 * - 재생 중: 레이어·이미지 전부 클릭 통과 (대사 진행과 별개)
 * - 위치조정: 이미지만 드래그, 클릭(무이동)은 무시
 */
export function VnHandoutLayer({
  handout,
  resolveUrl,
  layouts,
  poseEditMode = false,
  onPoseChange,
}: Props) {
  const [vis, setVis] = useState<Vis>('off');
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [shownUrl, setShownUrl] = useState<string | undefined>();
  const { stageRef, size } = useStagePixelSize();

  const resolveRef = useRef(resolveUrl);
  resolveRef.current = resolveUrl;
  const keyRef = useRef<string | null>(null);
  const urlRef = useRef<string | undefined>();
  const exitTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const poseEditRef = useRef(poseEditMode);
  poseEditRef.current = poseEditMode;

  const layout = normalizeHandoutLayoutOrDefault(
    (shownKey && layouts?.[shownKey]) || DEFAULT_HANDOUT_LAYOUT,
  );
  const radius = clampHandoutRadius(layout.radius);
  const editable = Boolean(poseEditMode && shownKey && onPoseChange);

  const clearTimers = () => {
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  /* handout 키만 구독 — 콜백 deps 로 effect 재실행 금지 */
  useEffect(() => {
    clearTimers();

    if (handout) {
      const url = resolveRef.current(handout) || urlRef.current;
      if (!url) {
        /* prop 은 있는데 URL 만 없으면 기존 표시 유지 */
        return;
      }

      const same = keyRef.current === handout;
      keyRef.current = handout;
      urlRef.current = url;
      setShownKey(handout);
      setShownUrl(url);

      if (same) {
        setVis((v) => (v === 'off' || v === 'leave' ? 'open' : v));
        return;
      }

      if (poseEditRef.current) {
        setVis('open');
        return;
      }

      setVis('mount');
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          if (keyRef.current === handout) setVis('open');
        });
      });
      return;
    }

    /* handout 이 실제로 꺼질 때만 퇴장 */
    keyRef.current = null;
    if (poseEditRef.current) {
      urlRef.current = undefined;
      setShownKey(null);
      setShownUrl(undefined);
      setVis('off');
      return;
    }

    setVis((v) => (v === 'off' ? v : 'leave'));
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      urlRef.current = undefined;
      setShownKey(null);
      setShownUrl(undefined);
      setVis('off');
    }, HANDOUT_EXIT_MS);

    return () => clearTimers();
  }, [handout]);

  useEffect(() => {
    if (poseEditMode) setVis((v) => (v === 'mount' ? 'open' : v));
  }, [poseEditMode]);

  useEffect(() => () => clearTimers(), []);

  const figureRef = useRef<HTMLDivElement | null>(null);
  const scalerRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HandoutLayout>(layout);
  const poseAtDownRef = useRef<HandoutLayout>(layout);
  const lockedScaleRef = useRef(layout.scale);
  const radiusRef = useRef(radius);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(
    null,
  );
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPoseChangeRef = useRef(onPoseChange);
  onPoseChangeRef.current = onPoseChange;
  const shownKeyRef = useRef(shownKey);
  shownKeyRef.current = shownKey;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const writeDom = useCallback((p: HandoutLayout) => {
    const el = figureRef.current;
    if (!el) return;
    const style = handoutFigureStyle(p);
    el.style.left = String(style.left);
    el.style.top = String(style.top);
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = String(style.transform);
    if (scalerRef.current) {
      scalerRef.current.style.transform = `scale(${p.scale})`;
    }
  }, []);

  useLayoutEffect(() => {
    if (draggingRef.current) return;
    const next = normalizeHandoutLayoutOrDefault(layout);
    liveRef.current = next;
    lockedScaleRef.current = next.scale;
    radiusRef.current = clampHandoutRadius(next.radius);
    writeDom(next);
  }, [layout.x, layout.y, layout.scale, layout.radius, writeDom]);

  const emitPoseIfChanged = useCallback(() => {
    const next = normalizeHandoutLayoutOrDefault({
      ...liveRef.current,
      scale: lockedScaleRef.current,
      radius: radiusRef.current,
    });
    liveRef.current = next;
    writeDom(next);
    if (!movedRef.current && !poseChanged(poseAtDownRef.current, next)) return;
    if (!poseChanged(poseAtDownRef.current, next)) return;
    const key = shownKeyRef.current;
    if (key) onPoseChangeRef.current?.(key, next);
  }, [writeDom]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!editable || !onPoseChange) return;
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const cur = normalizeHandoutLayoutOrDefault(liveRef.current);
      lockedScaleRef.current = cur.scale;
      radiusRef.current = clampHandoutRadius(cur.radius);
      poseAtDownRef.current = cur;
      movedRef.current = false;
      dragStart.current = { px: e.clientX, py: e.clientY, x: cur.x, y: cur.y };
      draggingRef.current = true;
      setDragging(true);
    },
    [editable, onPoseChange],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingRef.current || !dragStart.current) return;
      e.stopPropagation();
      const dx = e.clientX - dragStart.current.px;
      const dy = e.clientY - dragStart.current.py;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
      const sw = sizeRef.current.w || 1;
      const sh = sizeRef.current.h || 1;
      const next = normalizeHandoutLayoutOrDefault({
        x: dragStart.current.x + (dx / sw) * 100,
        y: dragStart.current.y + (dy / sh) * 100,
        scale: lockedScaleRef.current,
        radius: radiusRef.current,
      });
      liveRef.current = next;
      writeDom(next);
    },
    [writeDom],
  );

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    dragStart.current = null;
    emitPoseIfChanged();
    movedRef.current = false;
  }, [emitPoseIfChanged]);

  useEffect(() => {
    if (!dragging) return;
    const up = (e: PointerEvent) => {
      e.stopPropagation();
      endDrag();
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [dragging, endDrag]);

  useEffect(() => {
    const el = figureRef.current;
    if (!el || !editable || dragging) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const before = normalizeHandoutLayoutOrDefault({
        ...liveRef.current,
        scale: lockedScaleRef.current,
        radius: radiusRef.current,
      });
      poseAtDownRef.current = before;
      movedRef.current = true;
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      const nextScale = Math.min(2.4, Math.max(0.35, lockedScaleRef.current + delta));
      lockedScaleRef.current = nextScale;
      const next = normalizeHandoutLayoutOrDefault({
        ...liveRef.current,
        scale: nextScale,
        radius: radiusRef.current,
      });
      liveRef.current = next;
      writeDom(next);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelTimer.current = null;
        emitPoseIfChanged();
        movedRef.current = false;
      }, 180);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimer.current) {
        clearTimeout(wheelTimer.current);
        wheelTimer.current = null;
      }
    };
  }, [editable, dragging, writeDom, emitPoseIfChanged, shownKey]);

  if (vis === 'off' || !shownUrl) return null;

  const showOpen = vis === 'open' || (vis === 'mount' && poseEditMode);
  const dimOn = vis === 'open' || vis === 'mount';
  const leaving = vis === 'leave';

  return (
    <div
      ref={stageRef}
      className={`${styles.handoutLayer}${editable ? ` ${styles.handoutLayerEdit}` : ''}`}
      data-handout={shownKey || undefined}
      data-vis={vis}
    >
      <div
        className={`${styles.handoutDim}${dimOn ? ` ${styles.handoutDimShow}` : ''}${
          leaving ? ` ${styles.handoutDimHide}` : ''
        }`}
        aria-hidden
      />
      <div
        ref={figureRef}
        className={`${styles.handoutFigure} ${styles.handoutFigureLive}${
          dragging ? ` ${styles.handoutFigureDragging}` : ''
        }`}
        style={handoutFigureStyle(layout)}
        onPointerDown={editable ? onPointerDown : undefined}
        onPointerMove={editable ? onPointerMove : undefined}
        onClick={editable ? (e) => e.stopPropagation() : undefined}
      >
        <div
          ref={scalerRef}
          className={styles.handoutScaler}
          style={{ transform: `scale(${layout.scale})` }}
        >
          <div
            className={`${styles.handoutAnim}${showOpen ? ` ${styles.handoutAnimOpen}` : ''}${
              leaving ? ` ${styles.handoutAnimLeave}` : ''
            }${poseEditMode ? ` ${styles.handoutAnimInstant}` : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.handoutImg}
              src={shownUrl}
              alt=""
              draggable={false}
              style={{
                borderRadius: radius > 0 ? `${radius}px` : 0,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
