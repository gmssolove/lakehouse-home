'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clampBgmPlayerPosition, isBgmPlayerOffscreen, parsePx } from '@/lib/bgm/clampPlayerPosition';
import { formatBgmTime } from '@/lib/bgm/formatTime';
import { BGM_PLAYER_SIZE, useBgm } from '@/lib/contexts/BgmContext';
import { useMainBgmVisibility } from '@/lib/contexts/MainBgmVisibilityContext';

const COLLAPSED_SZ = 52;
const ANCHOR_KEY = 'lh_bgm_anchor';
const DRAG_THRESHOLD = 6;
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
  } = useBgm();

  const dragRef = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false });
  const resizeRef = useRef({ active: false, sw: 0, sh: 0, ox: 0, oy: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const collapseBtnRef = useRef<HTMLButtonElement>(null);
  const [uiReady, setUiReady] = useState(false);
  const [animClass, setAnimClass] = useState('');
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const minW = playlistActive ? MIN_W_PLAYLIST : BGM_PLAYER_SIZE.minW;

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
    if ((e.target as HTMLElement).closest('button')) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = {
      active: true,
      sx: r.left,
      sy: r.top,
      ox: e.clientX,
      oy: e.clientY,
      moved: false,
    };
  }

  function onResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const el = rootRef.current;
    if (!el || collapsed) return;
    resizeRef.current = {
      active: true,
      sw: el.offsetWidth,
      sh: el.offsetHeight,
      ox: e.clientX,
      oy: e.clientY,
    };
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = rootRef.current;
    if (!el) return;

    if (resizeRef.current.active) {
      const r = resizeRef.current;
      setPlayerSize(
        Math.max(minW, r.sw + (e.clientX - r.ox)),
        r.sh + (e.clientY - r.oy),
      );
      return;
    }

    if (!dragRef.current.active) return;
    const d = dragRef.current;
    if (Math.abs(e.clientX - d.ox) > DRAG_THRESHOLD || Math.abs(e.clientY - d.oy) > DRAG_THRESHOLD) {
      if (!d.moved) {
        d.moved = true;
        el.setPointerCapture(e.pointerId);
      }
    }
    if (!d.moved) return;
    const sz = collapsed ? COLLAPSED_SZ : el.offsetWidth;
    const sh = collapsed ? COLLAPSED_SZ : el.offsetHeight;
    const nx = clamp(d.sx + e.clientX - d.ox, 0, window.innerWidth - sz);
    const ny = clamp(d.sy + e.clientY - d.oy, 0, window.innerHeight - sh);
    setPosition(`${nx}px`, `${ny}px`);
    if (collapsed) writeAnchor(nx + COLLAPSED_SZ / 2, ny + COLLAPSED_SZ / 2);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (d.moved) {
      e.preventDefault();
    } else if (collapsed && d.active) {
      expandFromAnchor();
    }
    d.active = false;
    d.moved = false;
    resizeRef.current.active = false;
    rootRef.current?.releasePointerCapture(e.pointerId);
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
      className={`${collapsed ? 'collapsed' : ''}${animClass ? ` ${animClass}` : ''}`}
      style={{ ...posStyle, ...sizeStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
              onPointerDown={(e) => {
                e.stopPropagation();
                if (progressMax <= 0) return;
                setScrubbing(true);
                setScrubValue(parseFloat(e.currentTarget.value));
              }}
              onInput={(e) => {
                if (progressMax <= 0) return;
                setScrubValue(parseFloat(e.currentTarget.value));
              }}
              onChange={(e) => {
                if (progressMax <= 0) return;
                const next = parseFloat(e.target.value);
                setScrubValue(next);
                seek(next);
              }}
              onPointerUp={() => setScrubbing(false)}
              onPointerCancel={() => setScrubbing(false)}
            />
            <div id="bgm-progress-footer">
              <div id="bgm-info" key={activeTrackKey || 'bgm-empty'}>
                <div id="bgm-title">{title || 'BGM'}</div>
                {artist ? <div id="bgm-artist">{artist}</div> : null}
              </div>
              <div id="bgm-time">
                {formatBgmTime(currentTime)} / {formatBgmTime(duration)}
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
      <button
        type="button"
        id="bgm-expand-btn"
        aria-label="BGM 펼치기"
        onPointerDown={stopControlPointer}
        onClick={(e) => {
          e.stopPropagation();
          expandFromAnchor();
        }}
      >
        ♪
      </button>
    </div>
  );
}
