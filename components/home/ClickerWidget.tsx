'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeClickerBindKey,
  playClickerPreset,
  playClickerUrl,
  type ClickerSoundPresetId,
} from '@/lib/clicker/sounds';
import type { ClickerButton, ClickerSoundPreset } from '@/lib/types/site-content';
import { ImageFrameView } from '@/components/ui/ImageFrameView';

const POS_KEY = 'lh-clicker-pos';
const VOL_KEY = 'lh-clicker-vol';
const HIDDEN_KEY = 'lh-clicker-hidden';
/** 예전 영구 dismiss 키 — 마운트 시 제거해 힌트가 다시 보이도록 */

type Pos = { top: string; left: string };

type Props = {
  enabled: boolean;
  title: string;
  hint: string;
  defaultVolume: number;
  soundPreset: ClickerSoundPreset;
  soundCustom: string;
  buttons: ClickerButton[];
};

function clampVolume(n: number) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function ClickerWidget({
  enabled,
  title,
  hint,
  defaultVolume,
  soundPreset,
  soundCustom,
  buttons,
}: Props) {
  const [hidden, setHidden] = useState(false);
  const [volume, setVolume] = useState(() => clampVolume(defaultVolume));
  const [pressedIds, setPressedIds] = useState<Set<string>>(() => new Set());
  const [hintDone, setHintDone] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: '22%', left: '20px' });
  const [ready, setReady] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dragRef = useRef<{ offX: number; offY: number } | null>(null);
  const heldKeysRef = useRef<Set<string>>(new Set());
  const volumeRef = useRef(volume);
  const settingsRef = useRef({ soundPreset, soundCustom, buttons });
  volumeRef.current = volume;
  settingsRef.current = { soundPreset, soundCustom, buttons };

  // 버튼 이미지를 미리 받아 캐시에 올려둠 — 표시 시 즉시 렌더 (로딩 지연 방지)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    for (const btn of buttons) {
      const src = btn.img?.trim();
      if (!src) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    }
  }, [buttons]);

  const keyMap = useMemo(() => {
    const map = new Map<string, { btn: ClickerButton; index: number }>();
    buttons.forEach((btn, index) => {
      const k = normalizeClickerBindKey(btn.key);
      if (!k || map.has(k)) return;
      map.set(k, { btn, index });
    });
    return map;
  }, [buttons]);

  useEffect(() => {
    try {
      localStorage.removeItem('lh-clicker-hint-done');
      const savedPos = JSON.parse(localStorage.getItem(POS_KEY) || 'null') as Pos | null;
      if (savedPos?.top && savedPos?.left) setPos(savedPos);
      const savedVol = localStorage.getItem(VOL_KEY);
      if (savedVol != null) setVolume(clampVolume(parseFloat(savedVol)));
      else setVolume(clampVolume(defaultVolume));
      setHidden(localStorage.getItem(HIDDEN_KEY) === '1');
    } catch {
      setVolume(clampVolume(defaultVolume));
    }
    setHintDone(false);
    setReady(true);
  }, [defaultVolume]);

  const markHintDone = useCallback(() => {
    setHintDone(true);
  }, []);

  const playForButton = useCallback((btn: ClickerButton, index: number) => {
    const { soundPreset: preset, soundCustom: shared } = settingsRef.current;
    const custom = (btn.sound || shared || '').trim();
    if (custom) {
      playClickerUrl(custom, volumeRef.current);
      return;
    }
    playClickerPreset(audioCtxRef, preset as ClickerSoundPresetId, index, volumeRef.current);
  }, []);

  const addPressed = useCallback((id: string) => {
    setPressedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const removePressed = useCallback((id: string) => {
    setPressedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const triggerPress = useCallback(
    (btn: ClickerButton, index: number) => {
      playForButton(btn, index);
      markHintDone();
    },
    [markHintDone, playForButton],
  );

  useEffect(() => {
    if (!enabled || hidden) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key === ' ' ? ' ' : '';
      if (!k) return;
      const hit = keyMap.get(k);
      if (!hit) return;
      e.preventDefault();
      if (e.repeat || heldKeysRef.current.has(k)) return;
      heldKeysRef.current.add(k);
      addPressed(hit.btn.id);
      triggerPress(hit.btn, hit.index);
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key === ' ' ? ' ' : '';
      if (!k) return;
      heldKeysRef.current.delete(k);
      const hit = keyMap.get(k);
      if (hit) removePressed(hit.btn.id);
    }
    function onBlur() {
      heldKeysRef.current.clear();
      setPressedIds(new Set());
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [addPressed, enabled, hidden, keyMap, removePressed, triggerPress]);

  const onDragMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    setPos({
      top: `${Math.max(8, e.clientY - dragRef.current.offY)}px`,
      left: `${Math.max(8, e.clientX - dragRef.current.offX)}px`,
    });
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    setPos((p) => {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
      return p;
    });
  }, [onDragMove]);

  function onDragStart(e: React.MouseEvent<HTMLElement>) {
    const shell = e.currentTarget.closest('.lh-clicker') as HTMLElement | null;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  function setHiddenPersist(next: boolean) {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function onVolumeChange(next: number) {
    const v = clampVolume(next);
    setVolume(v);
    try {
      localStorage.setItem(VOL_KEY, String(v));
    } catch {
      /* ignore */
    }
  }

  if (!enabled || !ready || !buttons.length) return null;

  const hintVisible = !hintDone && hovered && !!hint.trim();

  return (
    <>
      <div
        className={`lh-clicker-wrap${hidden ? ' is-hidden' : ''}`}
        style={{ top: pos.top, left: pos.left }}
        aria-hidden={hidden}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="lh-clicker">
          <div className="lh-clicker__title" onMouseDown={onDragStart}>
            <span className="lh-clicker__label">{title || 'Clicker'}</span>
            <input
              type="range"
              className="lh-clicker__vol"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="클리커 볼륨"
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="lh-clicker__close"
              aria-label="클리커 닫기"
              onClick={() => setHiddenPersist(true)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>

          <div className="lh-clicker__keys">
            {buttons.map((btn, index) => {
              const img = btn.img?.trim();
              const cutout = Boolean(img && btn.cutout);
              const bind = normalizeClickerBindKey(btn.key) || '?';
              const face = (btn.label || bind).trim() || bind;
              return (
                <button
                  key={btn.id}
                  type="button"
                  className={`lh-clicker__key${cutout ? ' has-cutout' : ''}${
                    pressedIds.has(btn.id) ? ' is-press' : ''
                  }`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                    addPressed(btn.id);
                    triggerPress(btn, index);
                  }}
                  onPointerUp={(e) => {
                    try {
                      (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                    } catch {
                      /* ignore */
                    }
                    removePressed(btn.id);
                  }}
                  onPointerCancel={() => removePressed(btn.id)}
                  aria-label={`${face} (${bind})`}
                  title={bind === ' ' ? 'Space' : bind.toUpperCase()}
                >
                  {img ? (
                    <span className="lh-clicker__key-media">
                      <ImageFrameView
                        src={img}
                        frame={btn.imgFrame}
                        fit={cutout ? 'contain' : 'cover'}
                        pos={cutout ? 'center center' : 'center top'}
                      />
                    </span>
                  ) : (
                    <>
                      <span className="lh-clicker__kk">{face.toUpperCase().slice(0, 2)}</span>
                      <span className="lh-clicker__kl">{String(index + 1).padStart(2, '0')}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <p className={`lh-clicker__hint${hintVisible ? ' is-show' : ''}`} aria-hidden={!hintVisible}>
          {hint}
        </p>
      </div>

      {hidden ? (
        <button type="button" className="lh-clicker-reopen" onClick={() => setHiddenPersist(false)}>
          클리커 다시 열기
        </button>
      ) : null}
    </>
  );
}
