'use client';

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatBgmTime } from '@/lib/bgm/formatTime';
import { BGM_PLAYER_SIZE, useBgm } from '@/lib/contexts/BgmContext';

const COLLAPSED_SZ = 52;
const ANCHOR_KEY = 'lh_bgm_anchor';

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
  const {
    playing,
    collapsed,
    volume,
    position,
    playerSize,
    title,
    artist,
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
  const [animClass, setAnimClass] = useState('');

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

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('#bgm-resize-handle')) return;
    if ((e.target as HTMLElement).closest('button, input') && !collapsed) return;
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
    el.setPointerCapture(e.pointerId);
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
      setPlayerSize(r.sw + (e.clientX - r.ox), r.sh + (e.clientY - r.oy));
      return;
    }

    if (!dragRef.current.active) return;
    const d = dragRef.current;
    const sz = collapsed ? COLLAPSED_SZ : el.offsetWidth;
    const sh = collapsed ? COLLAPSED_SZ : el.offsetHeight;
    const nx = clamp(d.sx + e.clientX - d.ox, 0, window.innerWidth - sz);
    const ny = clamp(d.sy + e.clientY - d.oy, 0, window.innerHeight - sh);
    if (Math.abs(e.clientX - d.ox) > 4 || Math.abs(e.clientY - d.oy) > 4) d.moved = true;
    setPosition(`${nx}px`, `${ny}px`);
    if (collapsed) writeAnchor(nx + COLLAPSED_SZ / 2, ny + COLLAPSED_SZ / 2);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (collapsed && d.active && !d.moved) {
      expandFromAnchor();
    }
    d.active = false;
    resizeRef.current.active = false;
    rootRef.current?.releasePointerCapture(e.pointerId);
  }

  const posStyle =
    position?.left && position?.top
      ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' }
      : { right: '1.5rem', bottom: '1.5rem' };

  const minW = playlistActive ? 252 : BGM_PLAYER_SIZE.minW;

  const sizeStyle = collapsed
    ? undefined
    : {
        width: `${Math.max(playerSize.width, minW)}px`,
        minWidth: `${minW}px`,
        maxWidth: `${BGM_PLAYER_SIZE.maxW}px`,
        minHeight: `${Math.max(playerSize.height, BGM_PLAYER_SIZE.minH)}px`,
        maxHeight: `${BGM_PLAYER_SIZE.maxH}px`,
      };

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
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
            />
            <div id="bgm-progress-footer">
              <div id="bgm-info">
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
      <button type="button" id="bgm-expand-btn" aria-label="BGM 펼치기" tabIndex={-1}>
        ♪
      </button>
    </div>
  );
}
