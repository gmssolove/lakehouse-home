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
  onMainMenu: () => void;
  onLoadSave: (data: VNSaveData) => void;
};

type Sub = 'menu' | 'save' | 'load' | 'log';

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

/**
 * ESC / 우클릭으로 여는 VN 시스템 메뉴
 * — 저장 · 불러오기 · 로그 · 메인으로
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
  onLoadSave,
}: Props) {
  const [sub, setSub] = useState<Sub>('menu');
  const [slots, setSlots] = useState<Record<VNSaveSlotId, VNSaveData | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open) {
      setSub('menu');
      setMsg('');
    }
  }, [open]);

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
      setMsg('저장되었습니다');
    } catch {
      setMsg('저장 실패');
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
        setMsg('빈 슬롯');
        return;
      }
      onLoadSave(data);
      onClose();
    } catch {
      setMsg('로드 실패');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={styles.sysOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="시스템 메뉴"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.sysPanel} onClick={(e) => e.stopPropagation()}>
        {sub === 'menu' ? (
          <>
            <p className={styles.sysLatin}>SYSTEM</p>
            <h2 className={styles.sysTitle}>메뉴</h2>
            <nav className={styles.sysNav} aria-label="시스템 메뉴">
              <button type="button" className={styles.sysBtn} onClick={() => setSub('save')}>
                저장하기
              </button>
              <button type="button" className={styles.sysBtn} onClick={() => setSub('load')}>
                불러오기
              </button>
              <button type="button" className={styles.sysBtn} onClick={() => setSub('log')}>
                지난 대사 보기
              </button>
              <button type="button" className={styles.sysBtn} onClick={onMainMenu}>
                메인으로
              </button>
              <button type="button" className={`${styles.sysBtn} ${styles.sysBtnMuted}`} onClick={onClose}>
                닫기
              </button>
            </nav>
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
                        {empty ? '빈 슬롯' : `${data.sceneId} · ${formatSavedAt(data.savedAt)}`}
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
                <p className={styles.sysMsg}>아직 기록이 없습니다.</p>
              ) : (
                log.map((entry, i) => (
                  <div key={`${i}-${entry.text.slice(0, 12)}`} className={styles.sysLogRow}>
                    {entry.speaker ? (
                      <span className={styles.sysLogSpeaker}>{entry.speaker}</span>
                    ) : (
                      <span className={styles.sysLogSpeaker}>나레이션</span>
                    )}
                    <p className={styles.sysLogText}>{entry.text}</p>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
