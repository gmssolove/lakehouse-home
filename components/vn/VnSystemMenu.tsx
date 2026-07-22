'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listVnSlots,
  loadVnSlot,
  saveVnSlot,
  VN_SAVE_SLOTS,
  type VNSaveData,
  type VNSaveSlotId,
} from '@/lib/vn/vnSave';
import {
  getBgmVolume,
  getSfxVolume,
  setBgmVolume,
  setSfxVolume,
  subscribeBgmVolume,
  subscribeSfxVolume,
} from '@/lib/vn/vnAudioVolume';
import styles from './vn-engine.module.css';

export type VnLogEntry = {
  speaker?: string;
  text: string;
};

type Props = {
  open: boolean;
  sceneId?: string;
  lineId?: string;
  missionsActive?: string[];
  missionsCompleted?: string[];
  hotspotsChecked?: string[];
  log: VnLogEntry[];
  onClose: () => void;
  /** 인게임 메인 메뉴로 */
  onMainMenu: () => void;
  /** TRPG/아카이브로 종료 */
  onExit?: () => void;
  onLoadSave: (data: VNSaveData) => void;
  /** 관리자 전용 — 스탠딩 위치 조정 (재생 화면) */
  standPoseEditable?: boolean;
  poseEditActive?: boolean;
  onTogglePoseEdit?: () => void;
};

type Sub = 'menu' | 'save' | 'load' | 'log' | 'settings';

function formatSavedAt(ts: number) {
  if (!ts) return '비어 있음';
  try {
    return new Date(ts).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '저장됨';
  }
}

const OUT_MS = 280;

/**
 * ESC 시스템 메뉴 — 넓은 글래스 패널.
 */
export function VnSystemMenu({
  open,
  sceneId,
  lineId,
  missionsActive = [],
  missionsCompleted = [],
  hotspotsChecked = [],
  log,
  onClose,
  onMainMenu,
  onExit,
  onLoadSave,
  standPoseEditable = false,
  poseEditActive = false,
  onTogglePoseEdit,
}: Props) {
  const [sub, setSub] = useState<Sub>('menu');
  const [slots, setSlots] = useState<Record<VNSaveSlotId, VNSaveData | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [bgmVol, setBgmVol] = useState(0.55);
  const [sfxVol, setSfxVol] = useState(0.7);
  const [shown, setShown] = useState(false);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    if (open) {
      setShown(true);
      setPhase('in');
      setSub('menu');
      setMsg('');
      return;
    }
    setPhase('out');
    const t = window.setTimeout(() => {
      setShown(false);
      setSub('menu');
      setMsg('');
    }, OUT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setBgmVol(getBgmVolume());
    setSfxVol(getSfxVolume());
    const offBgm = subscribeBgmVolume(setBgmVol);
    const offSfx = subscribeSfxVolume(setSfxVol);
    return () => {
      offBgm();
      offSfx();
    };
  }, []);

  const refreshSlots = useCallback(async () => {
    try {
      setSlots(await listVnSlots());
    } catch {
      setSlots(
        Object.fromEntries(VN_SAVE_SLOTS.map((s) => [s, null])) as Record<
          VNSaveSlotId,
          VNSaveData | null
        >,
      );
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (sub === 'save' || sub === 'load') void refreshSlots();
  }, [open, sub, refreshSlots]);

  const handleSave = async (slot: VNSaveSlotId) => {
    if (!sceneId || !lineId || busy) return;
    setBusy(true);
    setMsg('');
    try {
      await saveVnSlot(slot, {
        sceneId,
        lineId,
        missionsActive,
        missionsCompleted,
        hotspotsChecked,
      });
      await refreshSlots();
      setMsg('저장했습니다');
    } catch {
      setMsg('저장에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (slot: VNSaveSlotId) => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const data = await loadVnSlot(slot);
      if (!data) {
        setMsg('빈 슬롯입니다');
        return;
      }
      onLoadSave(data);
      onClose();
    } catch {
      setMsg('불러오기에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  if (!shown) return null;

  return (
    <div
      className={`${styles.sysOverlay} ${phase === 'in' ? styles.sysOverlayIn : styles.sysOverlayOut}`}
      role="dialog"
      aria-modal="true"
      aria-label="시스템 메뉴"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`${styles.sysPanel} ${phase === 'in' ? styles.sysPanelIn : styles.sysPanelOut}`}
        onClick={(e) => e.stopPropagation()}
      >
        {sub === 'menu' ? (
          <>
            <header className={styles.sysMenuHead}>
              <p className={styles.sysLatin}>SYSTEM</p>
              <h2 className={styles.sysTitle}>메뉴</h2>
            </header>
            <div className={styles.sysNav} role="navigation" aria-label="시스템 메뉴">
              <button type="button" className={styles.sysBtn} onClick={() => setSub('save')}>
                <span className={styles.sysBtnLabel}>저장하기</span>
                <span className={styles.sysBtnHint}>현재 진행을 슬롯에 저장</span>
              </button>
              <button type="button" className={styles.sysBtn} onClick={() => setSub('load')}>
                <span className={styles.sysBtnLabel}>불러오기</span>
                <span className={styles.sysBtnHint}>저장된 지점에서 이어하기</span>
              </button>
              <button type="button" className={styles.sysBtn} onClick={() => setSub('log')}>
                <span className={styles.sysBtnLabel}>지난 대사</span>
                <span className={styles.sysBtnHint}>지금까지의 대화를 다시 보기</span>
              </button>
              <button type="button" className={styles.sysBtn} onClick={() => setSub('settings')}>
                <span className={styles.sysBtnLabel}>환경 설정</span>
                <span className={styles.sysBtnHint}>BGM · 효과음 음량</span>
              </button>
              {standPoseEditable && onTogglePoseEdit ? (
                <button
                  type="button"
                  className={styles.sysBtn}
                  onClick={() => {
                    onTogglePoseEdit();
                    onClose();
                  }}
                >
                  <span className={styles.sysBtnLabel}>
                    {poseEditActive ? '✓ 위치 조정 중' : '위치 조정'}
                  </span>
                  <span className={styles.sysBtnHint}>
                    관리자 · 스탠딩·핸드아웃 드래그·휠
                  </span>
                </button>
              ) : null}
              <div className={styles.sysDivider} aria-hidden />
              <button
                type="button"
                className={styles.sysBtn}
                onClick={() => {
                  onClose();
                  window.setTimeout(() => onMainMenu(), OUT_MS);
                }}
              >
                <span className={styles.sysBtnLabel}>메인 메뉴</span>
                <span className={styles.sysBtnHint}>타이틀 화면으로 돌아가기</span>
              </button>
              <button
                type="button"
                className={styles.sysBtn}
                onClick={() => {
                  onClose();
                  window.setTimeout(() => (onExit ?? onMainMenu)(), OUT_MS);
                }}
              >
                <span className={styles.sysBtnLabel}>게임 종료</span>
                <span className={styles.sysBtnHint}>시나리오 화면으로 나가기</span>
              </button>
              <button
                type="button"
                className={`${styles.sysBtn} ${styles.sysBtnMuted}`}
                onClick={onClose}
              >
                <span className={styles.sysBtnLabel}>닫기</span>
                <span className={styles.sysBtnHint}>ESC · 계속하기</span>
              </button>
            </div>
          </>
        ) : null}

        {(sub === 'save' || sub === 'load') && (
          <>
            <header className={styles.sysHead}>
              <h2 className={styles.sysTitleSm}>{sub === 'save' ? '저장하기' : '불러오기'}</h2>
              <button type="button" className={styles.sysBack} onClick={() => setSub('menu')}>
                뒤로
              </button>
            </header>
            <ul className={styles.sysSlots}>
              {VN_SAVE_SLOTS.map((slot, i) => {
                const data = slots?.[slot] ?? null;
                const empty = !data;
                return (
                  <li key={slot}>
                    <button
                      type="button"
                      className={`${styles.sysSlot}${empty && sub === 'load' ? ` ${styles.sysSlotEmpty}` : ''}`}
                      disabled={busy || (sub === 'load' && empty)}
                      onClick={() => (sub === 'save' ? handleSave(slot) : handleLoad(slot))}
                    >
                      <span className={styles.sysSlotLabel}>슬롯 {i + 1}</span>
                      <span className={styles.sysSlotMeta}>
                        {empty ? '비어 있음' : `${data.sceneId} · ${formatSavedAt(data.savedAt)}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {msg ? <p className={styles.sysMsg}>{msg}</p> : null}
          </>
        )}

        {sub === 'log' ? (
          <>
            <header className={styles.sysHead}>
              <h2 className={styles.sysTitleSm}>지난 대사</h2>
              <button type="button" className={styles.sysBack} onClick={() => setSub('menu')}>
                뒤로
              </button>
            </header>
            <div className={styles.sysLog}>
              {log.length === 0 ? (
                <p className={styles.sysMsg}>아직 대사가 없습니다</p>
              ) : (
                log.map((entry, i) => (
                  <div key={`${i}-${entry.text.slice(0, 12)}`} className={styles.sysLogRow}>
                    {entry.speaker ? <em className={styles.sysLogSpeaker}>{entry.speaker}</em> : null}
                    <span className={styles.sysLogText}>{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}

        {sub === 'settings' ? (
          <>
            <header className={styles.sysHead}>
              <h2 className={styles.sysTitleSm}>환경 설정</h2>
              <button type="button" className={styles.sysBack} onClick={() => setSub('menu')}>
                뒤로
              </button>
            </header>
            <div className={styles.sysSound}>
              <label className={styles.sysSoundRow}>
                <span className={styles.sysSoundLabel}>BGM</span>
                <input
                  type="range"
                  className={styles.sysSoundRange}
                  min={0}
                  max={100}
                  value={Math.round(bgmVol * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    setBgmVol(v);
                    setBgmVolume(v);
                  }}
                  aria-valuetext={`${Math.round(bgmVol * 100)}%`}
                />
                <span className={styles.sysSoundVal}>{Math.round(bgmVol * 100)}</span>
              </label>
              <label className={styles.sysSoundRow}>
                <span className={styles.sysSoundLabel}>효과음</span>
                <input
                  type="range"
                  className={styles.sysSoundRange}
                  min={0}
                  max={100}
                  value={Math.round(sfxVol * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    setSfxVol(v);
                    setSfxVolume(v);
                  }}
                  aria-valuetext={`${Math.round(sfxVol * 100)}%`}
                />
                <span className={styles.sysSoundVal}>{Math.round(sfxVol * 100)}</span>
              </label>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
