'use client';

/**
 * OcVnDialogue / PairVnDialogue 의 lh-vn 오버레이 JSX 구조·클래스 이식.
 * 우측 상단 세이브/로드 슬롯 UI 포함.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listVnSlots,
  loadVnSlot,
  saveVnSlot,
  VN_SAVE_SLOTS,
  type VNSaveData,
  type VNSaveSlotId,
} from '@/lib/vn/vnSave';
import { VnDialogueChoices } from '@/components/shared/VnDialogueChoices';
import { VnLocationLabel } from '@/components/vn/VnLocationLabel';
import '@/styles/shared/vn-savebar.css';
import '@/styles/shared/vn-location.css';

export type DialogueBoxChoice = {
  label: string;
  next?: string;
};

type Props = {
  speaker?: string;
  text: string;
  isTyping?: boolean;
  hasNext?: boolean;
  leaving?: boolean;
  isNarration?: boolean;
  choices?: DialogueBoxChoice[];
  /** 현재 씬 장소 — 대사창 안에만 표시 */
  location?: string | null;
  sceneId?: string;
  lineId?: string;
  missionsActive?: string[];
  missionsCompleted?: string[];
  hotspotsChecked?: string[];
  onClose: () => void;
  onBoxClick: () => void;
  onChoice?: (next?: string) => void;
  onLoadSave?: (data: VNSaveData) => void;
};

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

export function DialogueBox({
  speaker = '',
  text,
  isTyping = false,
  hasNext = false,
  leaving = false,
  isNarration = false,
  choices = [],
  location,
  sceneId,
  lineId,
  missionsActive = [],
  missionsCompleted = [],
  hotspotsChecked = [],
  onClose,
  onBoxClick,
  onChoice,
  onLoadSave,
}: Props) {
  const [panel, setPanel] = useState<'save' | 'load' | null>(null);
  const [slots, setSlots] = useState<Record<VNSaveSlotId, VNSaveData | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refreshSlots = useCallback(async () => {
    try {
      const list = await listVnSlots();
      setSlots(list);
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
    if (!panel) return;
    void refreshSlots();
  }, [panel, refreshSlots]);

  useEffect(() => {
    function blockCopy(e: ClipboardEvent) {
      if ((e.target as HTMLElement | null)?.closest?.('#lh-vn, .lh-vn-action-choices')) {
        e.preventDefault();
      }
    }
    function blockSelect(e: Event) {
      if (
        (e.target as HTMLElement | null)?.closest?.(
          '#lh-vn, .lh-vn-action-choices, .lh-vn-choice, .lh-vn-action-choice',
        )
      ) {
        e.preventDefault();
      }
    }
    function blockDrag(e: DragEvent) {
      if ((e.target as HTMLElement | null)?.closest?.('#lh-vn, .lh-vn-action-choices')) {
        e.preventDefault();
      }
    }
    document.addEventListener('copy', blockCopy, true);
    document.addEventListener('cut', blockCopy, true);
    document.addEventListener('selectstart', blockSelect, true);
    document.addEventListener('dragstart', blockDrag, true);
    return () => {
      document.removeEventListener('copy', blockCopy, true);
      document.removeEventListener('cut', blockCopy, true);
      document.removeEventListener('selectstart', blockSelect, true);
      document.removeEventListener('dragstart', blockDrag, true);
    };
  }, []);

  const openPanel = (mode: 'save' | 'load') => {
    setMsg('');
    setPanel((p) => (p === mode ? null : mode));
  };

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
      setMsg(`${slot} 저장됨`);
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
      onLoadSave?.(data);
      setPanel(null);
      setMsg('로드됨');
    } catch {
      setMsg('로드 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`lh-vn-overlay active oc-vn-overlay${leaving ? ' is-leaving' : ''}`}
      id="lh-vn"
      role="dialog"
      aria-label="대화"
    >
      <div
        className={`lh-vn-box${hasNext && !isTyping && !choices.length ? ' has-next' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (leaving) return;
          if ((e.target as HTMLElement).closest('.lh-vn-choice, .lh-vn-close, .lh-vn-savebar, .lh-vn-slot-panel'))
            return;
          onBoxClick();
        }}
      >
        <div className="lh-vn-savebar" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="lh-vn-save-btn" onClick={() => openPanel('save')} disabled={leaving}>
            세이브
          </button>
          <button type="button" className="lh-vn-save-btn" onClick={() => openPanel('load')} disabled={leaving}>
            로드
          </button>
        </div>

        {panel && (
          <div className="lh-vn-slot-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lh-vn-slot-panel-title">{panel === 'save' ? '저장 슬롯' : '불러오기'}</div>
            {VN_SAVE_SLOTS.map((slot, i) => {
              const data = slots?.[slot];
              return (
                <button
                  key={slot}
                  type="button"
                  className="lh-vn-slot-btn"
                  disabled={busy || (panel === 'load' && !data)}
                  onClick={() => (panel === 'save' ? handleSave(slot) : handleLoad(slot))}
                >
                  <span className="lh-vn-slot-num">{i + 1}</span>
                  <span className="lh-vn-slot-meta">
                    {data ? (
                      <>
                        <em>{data.sceneId}</em>
                        <small>{formatSavedAt(data.savedAt)}</small>
                      </>
                    ) : (
                      <small>비어 있음</small>
                    )}
                  </span>
                </button>
              );
            })}
            {msg && <div className="lh-vn-slot-msg">{msg}</div>}
          </div>
        )}

        <button type="button" className="lh-vn-close" onClick={onClose} aria-label="닫기" disabled={leaving}>
          ×
        </button>
        <VnLocationLabel location={location} />
        <div className={`lh-vn-speaker${isNarration || !speaker ? ' is-empty' : ''}`} id="lh-vn-speaker">
          {isNarration || !speaker ? '\u00A0' : speaker}
        </div>
        <div className={`lh-vn-text${isTyping ? ' lh-typing' : ''}`} id="lh-vn-text">
          {text}
        </div>
        {choices.length > 0 && !isTyping && (
          <VnDialogueChoices
            choices={choices}
            onPick={(next) => {
              if (next) onChoice?.(next);
              else onClose();
            }}
          />
        )}
        {hasNext && !isTyping && !choices.length && (
          <span className="lh-vn-next" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
