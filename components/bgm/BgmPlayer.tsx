'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clampBgmPlayerPosition, isBgmPlayerOffscreen, parsePx } from '@/lib/bgm/clampPlayerPosition';
import { formatBgmTime } from '@/lib/bgm/formatTime';
import { BGM_PLAYER_SIZE, useBgm } from '@/lib/contexts/BgmContext';
import { useMainBgmVisibility } from '@/lib/contexts/MainBgmVisibilityContext';

const COLLAPSED_SZ = 52;
const ANCHOR_KEY = 'lh_bgm_anchor';
const DRAG_THRESHOLD = 8;
/** ⏮ ▶ ⏭ · 볼륨 · ✕ — 플레이리스트 시 최소 가로 (버튼 가림 방지) */
const MIN_W_PLAYLIST = 252;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readAnchor() {
  try {
    const raw = sessionStorage.getItem(ANCHOR_KEY);
    if (raw) return JSON.parse(raw) as { x: number; y: number };
  } catch {
    /* ignore */
  }
  return null;
}

function writeAnchor(x: number, y: number) {
  try {
    sessionStorage.setItem(ANCHOR_KEY, JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}

export function BgmPlayer() {
  const { hidden } = useMainBgmVisibility();
  const {
    playing,
    collapsed,
    volume,
    position,
    playerSize,
    title,
    artist,
    activeTrackKey,
    currentTime,
    duration,
    toggle,
    setVolume,
    seek,
    setCollapsed,
    setPosition,
    setPlayerSize,
    playNext,
    playPrevious,
    playlistActive,
    setSeekScrubbing,
  } = useBgm();

  const dragRef = useRef({
    active: false,
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
    moved: false,
    w: COLLAPSED_SZ,
    h: COLLAPSED_SZ,
  });
  const suppressExpandClickRef = useRef(false);
  const resizeRef = useRef({ active: false, sw: 0, sh: 0, ox: 0, oy: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const collapseBtnRef = useRef<HTMLButtonElement>(null);
  const scrubbingRef = useRef(false);
  const dragRafRef = useRef(0);
  const pendingDragPosRef = useRef<{ left: number; top: number } | null>(null);
  const pendingResizeRef = useRef<{ w: number; h: number } | null>(null);
  const [uiReady, setUiReady] = useState(false);
  const [animClass, setAnimClass] = useState('');
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [draggingUi, setDraggingUi] = useState(false);

  const minW = playlistActive ? MIN_W_PLAYLIST : BGM_PLAYER_SIZE.minW;

  /** 드래그 중 React setState 금지 — style만 갱신 (리렌더·localStorage·리플로우 폭주 방지) */
  const flushDragStyle = useCallback(() => {
    dragRafRef.current = 0;
    const el = rootRef.current;
    if (!el) return;
    const pos = pendingDragPosRef.current;
    if (pos) {
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
    const sz = pendingResizeRef.current;
    if (sz) {
      el.style.width = `${sz.w}px`;
      el.style.minWidth = `${minW}px`;
      el.style.minHeight = `${sz.h}px`;
    }
  }, [minW]);

  const scheduleDragStyle = useCallback(() => {
    if (dragRafRef.current) return;
    dragRafRef.current = window.requestAnimationFrame(flushDragStyle);
  }, [flushDragStyle]);

  const ensureVisible = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;

    const sz = collapsed ? COLLAPSED_SZ : Math.max(el.offsetWidth, minW);
    const sh = collapsed ? COLLAPSED_SZ : Math.max(el.offsetHeight, BGM_PLAYER_SIZE.minH);

    if (!position?.left || !position?.top) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && isBgmPlayerOffscreen(r.left, r.top, r.width, r.height)) {
        setPosition('', '');
      }
      return;
    }

    const left = parsePx(position.left);
    const top = parsePx(position.top);
    if (left == null || top == null) return;

    if (isBgmPlayerOffscreen(left, top, sz, sh)) {
      setPosition('', '');
      return;
    }

    const next = clampBgmPlayerPosition(left, top, sz, sh);
    if (Math.abs(next.left - left) > 0.5 || Math.abs(next.top - top) > 0.5) {
      setPosition(`${next.left}px`, `${next.top}px`);
    }
  }, [collapsed, minW, position, setPosition]);

  useEffect(() => {
    setUiReady(true);
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      ensureVisible();
      window.requestAnimationFrame(ensureVisible);
    });
    window.addEventListener('resize', ensureVisible);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', ensureVisible);
    };
  }, [ensureVisible, playerSize, collapsed, playlistActive]);

  useEffect(() => {
    const t = window.setTimeout(ensureVisible, 120);
    return () => window.clearTimeout(t);
  }, [ensureVisible]);

  function positionCollapsedAt(clientX: number, clientY: number) {
    writeAnchor(clientX, clientY);
    const left = clamp(clientX - COLLAPSED_SZ / 2, 0, window.innerWidth - COLLAPSED_SZ);
    const top = clamp(clientY - COLLAPSED_SZ / 2, 0, window.innerHeight - COLLAPSED_SZ);
    setPosition(`${left}px`, `${top}px`);
  }

  const alignCloseToAnchor = useCallback(() => {
    const anchor = readAnchor();
    const root = rootRef.current;
    const btn = collapseBtnRef.current;
    if (!anchor || !root || !btn) return;

    const rootRect = root.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const offX = btnRect.left + btnRect.width / 2 - rootRect.left;
    const offY = btnRect.top + btnRect.height / 2 - rootRect.top;
    const left = clamp(anchor.x - offX, 0, window.innerWidth - root.offsetWidth);
    const top = clamp(anchor.y - offY, 0, window.innerHeight - root.offsetHeight);
    setPosition(`${left}px`, `${top}px`);
  }, [setPosition]);

  function collapseAt(clientX: number, clientY: number) {
    setAnimClass('is-collapsing');
    positionCollapsedAt(clientX, clientY);
    setCollapsed(true);
    window.setTimeout(() => setAnimClass(''), 260);
  }

  function expandFromAnchor() {
    setAnimClass('is-expanding');
    setCollapsed(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        alignCloseToAnchor();
        window.setTimeout(() => setAnimClass(''), 300);
      });
    });
  }

  function stopControlPointer(e: ReactPointerEvent) {
    e.stopPropagation();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('#bgm-resize-handle')) return;
    if ((e.target as HTMLElement).closest('input[type="range"]')) return;
    if (!collapsed && (e.target as HTMLElement).closest('button')) return;
    const el = rootRef.current;
    if (!el) return;
    suppressExpandClickRef.current = false;
    const r = el.getBoundingClientRect();
    dragRef.current = {
      active: true,
      sx: r.left,
      sy: r.top,
      ox: e.clientX,
      oy: e.clientY,
      moved: false,
      /* 드래그 중 offsetWidth 반복 읽기 금지 */
      w: collapsed ? COLLAPSED_SZ : Math.max(r.width, minW),
      h: collapsed ? COLLAPSED_SZ : Math.max(r.height, BGM_PLAYER_SIZE.minH),
    };
    if (collapsed) {
      el.setPointerCapture(e.pointerId);
    }
  }

  function onResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const el = rootRef.current;
    if (!el || collapsed) return;
    const r = el.getBoundingClientRect();
    resizeRef.current = {
      active: true,
      sw: r.width,
      sh: r.height,
      ox: e.clientX,
      oy: e.clientY,
    };
    setDraggingUi(true);
    el.classList.add('is-dragging');
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = rootRef.current;
    if (!el) return;

    if (resizeRef.current.active) {
      const r = resizeRef.current;
      const w = Math.max(minW, Math.min(BGM_PLAYER_SIZE.maxW, r.sw + (e.clientX - r.ox)));
      const h = Math.max(
        BGM_PLAYER_SIZE.minH,
        Math.min(BGM_PLAYER_SIZE.maxH, r.sh + (e.clientY - r.oy)),
      );
      pendingResizeRef.current = { w, h };
      scheduleDragStyle();
      return;
    }

    if (!dragRef.current.active) return;
    const d = dragRef.current;
    if (Math.abs(e.clientX - d.ox) > DRAG_THRESHOLD || Math.abs(e.clientY - d.oy) > DRAG_THRESHOLD) {
      if (!d.moved) {
        d.moved = true;
        setDraggingUi(true);
        el.classList.add('is-dragging');
        el.setPointerCapture(e.pointerId);
      }
    }
    if (!d.moved) return;
    const nx = clamp(d.sx + e.clientX - d.ox, 0, window.innerWidth - d.w);
    const ny = clamp(d.sy + e.clientY - d.oy, 0, window.innerHeight - d.h);
    pendingDragPosRef.current = { left: nx, top: ny };
    scheduleDragStyle();
    if (collapsed) writeAnchor(nx + COLLAPSED_SZ / 2, ny + COLLAPSED_SZ / 2);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const el = rootRef.current;
    const d = dragRef.current;
    const wasDrag = d.moved;
    const wasResize = resizeRef.current.active;

    if (dragRafRef.current) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = 0;
      flushDragStyle();
    }

    if (wasResize) {
      const sz = pendingResizeRef.current;
      if (sz) setPlayerSize(sz.w, sz.h);
      pendingResizeRef.current = null;
    }

    if (wasDrag) {
      suppressExpandClickRef.current = true;
      const pos = pendingDragPosRef.current;
      if (pos) setPosition(`${pos.left}px`, `${pos.top}px`);
      pendingDragPosRef.current = null;
    } else if (collapsed && d.active) {
      expandFromAnchor();
    }

    d.active = false;
    d.moved = false;
    resizeRef.current.active = false;
    setDraggingUi(false);
    el?.classList.remove('is-dragging');
    el?.releasePointerCapture(e.pointerId);
  }

  function onCollapsedClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!collapsed) return;
    e.stopPropagation();
    if (suppressExpandClickRef.current) {
      suppressExpandClickRef.current = false;
      return;
    }
    expandFromAnchor();
  }

  const posStyle =
    position?.left && position?.top
      ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' }
      : { right: '1.5rem', top: '1.5rem', bottom: 'auto', left: 'auto' };

  const progressMax = duration > 0 ? duration : 0;
  const progressValue = scrubbing
    ? scrubValue
    : progressMax > 0
      ? Math.min(currentTime, progressMax)
      : 0;
  const progressPct =
    progressMax > 0 ? Math.min(100, Math.max(0, (progressValue / progressMax) * 100)) : 0;

  const sizeStyle = collapsed
    ? undefined
    : {
        width: `${Math.max(playerSize.width, minW)}px`,
        minWidth: `${minW}px`,
        maxWidth: `${BGM_PLAYER_SIZE.maxW}px`,
        minHeight: `${Math.max(playerSize.height, BGM_PLAYER_SIZE.minH)}px`,
      };

  if (!uiReady) return null;

  if (hidden) {
    return <div id="bgm-player" className="collapsed lh-bgm-suppressed" aria-hidden="true" hidden />;
  }

  return (
    <div
      ref={rootRef}
      id="bgm-player"
      className={`${collapsed ? 'collapsed' : ''}${animClass ? ` ${animClass}` : ''}${draggingUi ? ' is-dragging' : ''}`}
      style={{ ...posStyle, ...sizeStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onCollapsedClick}
    >
      {!collapsed && (
        <>
          <div id="bgm-progress-wrap">
            <input
              type="range"
              id="bgm-progress"
              min={0}
              max={progressMax > 0 ? progressMax : 100}
              step={0.1}
              value={progressMax > 0 ? progressValue : 0}
              style={{ ['--progress' as string]: `${progressPct}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (progressMax <= 0) return;
                scrubbingRef.current = true;
                setScrubbing(true);
                setSeekScrubbing(true);
                const next = parseFloat(e.currentTarget.value);
                setScrubValue(next);
              }}
              onInput={(e) => {
                if (progressMax <= 0) return;
                const next = parseFloat(e.currentTarget.value);
                scrubbingRef.current = true;
                setScrubbing(true);
                setSeekScrubbing(true);
                setScrubValue(next);
              }}
              onChange={(e) => {
                if (progressMax <= 0) return;
                const next = parseFloat(e.currentTarget.value);
                setScrubValue(next);
                seek(next);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (scrubbingRef.current && progressMax > 0) {
                  const next = parseFloat(e.currentTarget.value);
                  setScrubValue(next);
                  seek(next);
                }
                scrubbingRef.current = false;
                setScrubbing(false);
                setSeekScrubbing(false);
              }}
              onPointerCancel={() => {
                scrubbingRef.current = false;
                setScrubbing(false);
                setSeekScrubbing(false);
              }}
            />
            <div id="bgm-progress-footer">
              <div id="bgm-info" key={activeTrackKey || 'bgm-empty'}>
                <div id="bgm-title">{title || 'BGM'}</div>
                {artist ? <div id="bgm-artist">{artist}</div> : null}
              </div>
              <div id="bgm-time">
                {formatBgmTime(scrubbing ? scrubValue : currentTime)} / {formatBgmTime(duration)}
              </div>
            </div>
          </div>
          <div id="bgm-controls-row">
            <div className="bgm-transport">
              {playlistActive && (
                <button
                  type="button"
                  id="bgm-prev-btn"
                  className="bgm-skip-btn"
                  aria-label="이전 곡"
                  onPointerDown={stopControlPointer}
                  onClick={(e) => {
                    e.stopPropagation();
                    playPrevious();
                  }}
                >
                  ⏮
                </button>
              )}
              <button
                type="button"
                id="bgm-play-btn"
                onPointerDown={stopControlPointer}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
              >
                {playing ? '⏸' : '▶'}
              </button>
              {playlistActive && (
                <button
                  type="button"
                  id="bgm-next-btn"
                  className="bgm-skip-btn"
                  aria-label="다음 곡"
                  onPointerDown={stopControlPointer}
                  onClick={(e) => {
                    e.stopPropagation();
                    playNext();
                  }}
                >
                  ⏭
                </button>
              )}
            </div>
            <div id="bgm-vol-wrap">
              <input
                type="range"
                id="bgm-vol"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <button
              type="button"
              id="bgm-toggle-collapse"
              ref={collapseBtnRef}
              onPointerDown={stopControlPointer}
              onClick={(e) => {
                e.stopPropagation();
                collapseAt(e.clientX, e.clientY);
              }}
            >
              ✕
            </button>
          </div>
          <div
            id="bgm-resize-handle"
            role="presentation"
            aria-hidden="true"
            onPointerDown={onResizeDown}
          />
        </>
      )}
      <span id="bgm-expand-btn" aria-hidden="true">
        ♪
      </span>
    </div>
  );
}
