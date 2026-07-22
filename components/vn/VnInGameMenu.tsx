'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listVnSlots,
  VN_SAVE_SLOTS,
  type VNSaveData,
  type VNSaveSlotId,
} from '@/lib/vn/vnSave';
import {
  getBgmVolume,
  getSfxVolume,
  setBgmVolume,
  setSfxVolume,
} from '@/lib/vn/vnAudioVolume';
import styles from './vn-shell.module.css';

type Panel = 'none' | 'continue' | 'settings';

type Props = {
  backgroundUrl?: string;
  /** 배경 흐림 px (0–40) */
  backgroundBlur?: number;
  onStart: () => void;
  onContinue: (data: VNSaveData) => void;
  onExit: () => void;
};

function formatSavedAt(ts: number) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const ITEMS = [
  { id: 'start' as const, label: '게임 시작', sub: '새로운 이야기를 시작합니다.' },
  { id: 'continue' as const, label: '이어하기', sub: '저장된 지점부터 이어갑니다.' },
  { id: 'settings' as const, label: '환경 설정', sub: '소리와 환경을 조절합니다.' },
  { id: 'exit' as const, label: '게임 종료', sub: '타이틀을 떠납니다.' },
];

const PANEL_OUT_MS = 280;

function DustMotes() {
  return (
    <span className={styles.menuDust} aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={styles.menuDustMote} style={{ ['--i' as string]: i }} />
      ))}
    </span>
  );
}

/**
 * Shared VN title menu — horizontal options, no title chrome, dust hover.
 */
export function VnInGameMenu({
  backgroundUrl = '/vn/backgrounds/main_menu.png',
  backgroundBlur = 0,
  onStart,
  onContinue,
  onExit,
}: Props) {
  const [panel, setPanel] = useState<Panel>('none');
  const [panelPhase, setPanelPhase] = useState<'in' | 'out'>('in');
  const [focus, setFocus] = useState(0);
  const [bgOk, setBgOk] = useState(true);
  const [slots, setSlots] = useState<Record<VNSaveSlotId, VNSaveData | null> | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bgmVol, setBgmVol] = useState(0.55);
  const [sfxVol, setSfxVol] = useState(0.7);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    setBgmVol(getBgmVolume());
    setSfxVol(getSfxVolume());
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const openPanel = useCallback((next: Exclude<Panel, 'none'>) => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setPanel(next);
    setPanelPhase('in');
  }, []);

  const closePanel = useCallback(() => {
    if (panel === 'none' || panelPhase === 'out') return;
    setPanelPhase('out');
    closeTimer.current = window.setTimeout(() => {
      setPanel('none');
      setPanelPhase('in');
      closeTimer.current = null;
    }, PANEL_OUT_MS);
  }, [panel, panelPhase]);

  const openContinue = useCallback(() => {
    openPanel('continue');
    setSlotsLoading(true);
    void listVnSlots()
      .then((data) => {
        setSlots(data);
        setSlotsLoading(false);
      })
      .catch(() => setSlotsLoading(false));
  }, [openPanel]);

  const activate = useCallback(
    (id: (typeof ITEMS)[number]['id']) => {
      if (id === 'start') onStart();
      else if (id === 'continue') openContinue();
      else if (id === 'settings') openPanel('settings');
      else onExit();
    },
    [onStart, onExit, openContinue, openPanel],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (panel !== 'none') {
        if (e.key === 'Escape') {
          e.preventDefault();
          closePanel();
        }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        setFocus((f) => (f + dir + ITEMS.length) % ITEMS.length);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(ITEMS[focus].id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, panel, activate, closePanel]);

  const overlayClass = `${styles.menuOverlay} ${
    panelPhase === 'in' ? styles.menuOverlayIn : styles.menuOverlayOut
  }`;
  const panelClass = `${styles.menuPanel} ${
    panelPhase === 'in' ? styles.menuPanelIn : styles.menuPanelOut
  }`;

  const blurPx = Math.max(0, Math.min(40, Math.round(backgroundBlur || 0)));

  return (
    <div className={styles.menuRoot}>
      {bgOk ? (
        <img
          className={styles.menuBg}
          src={backgroundUrl}
          alt=""
          onError={() => setBgOk(false)}
          style={
            blurPx > 0
              ? {
                  filter: `blur(${blurPx}px)`,
                  transform: 'scale(1.08)',
                }
              : undefined
          }
        />
      ) : (
        <div className={styles.menuBgFallback} aria-hidden />
      )}
      <div className={styles.menuVeil} aria-hidden />

      <nav className={styles.menuNav} aria-label="메인 메뉴">
        {ITEMS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className={styles.menuItem}
            onMouseEnter={() => setFocus(i)}
            onFocus={() => setFocus(i)}
            onClick={() => activate(item.id)}
          >
            <span className={styles.menuItemGlow} aria-hidden />
            <DustMotes />
            <span className={styles.menuItemLabel}>{item.label}</span>
            <span className={styles.menuItemSub}>{item.sub}</span>
          </button>
        ))}
      </nav>

      {panel === 'continue' ? (
        <div
          className={overlayClass}
          role="dialog"
          aria-label="이어하기"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePanel();
          }}
        >
          <div className={panelClass} onClick={(e) => e.stopPropagation()}>
            <header className={styles.menuPanelHead}>
              <h2>이어하기</h2>
              <button type="button" onClick={closePanel}>
                닫기
              </button>
            </header>
            {slotsLoading ? <p className={styles.menuHint}>불러오는 중…</p> : null}
            <ul className={styles.menuSlots}>
              {VN_SAVE_SLOTS.map((id, i) => {
                const data = slots?.[id] ?? null;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={!data || slotsLoading}
                      onClick={() => data && onContinue(data)}
                    >
                      <span>슬롯 {i + 1}</span>
                      <span>{data ? formatSavedAt(data.savedAt) : '비어 있음'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {panel === 'settings' ? (
        <div
          className={overlayClass}
          role="dialog"
          aria-label="환경 설정"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePanel();
          }}
        >
          <div className={panelClass} onClick={(e) => e.stopPropagation()}>
            <header className={styles.menuPanelHead}>
              <h2>환경 설정</h2>
              <button type="button" onClick={closePanel}>
                닫기
              </button>
            </header>
            <label className={styles.menuSlider}>
              <span>BGM</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={bgmVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBgmVol(v);
                  setBgmVolume(v);
                }}
              />
            </label>
            <label className={styles.menuSlider}>
              <span>효과음</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sfxVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSfxVol(v);
                  setSfxVolume(v);
                }}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
