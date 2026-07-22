'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePairSlotLayoutDrag } from '@/components/pair/usePairSlotLayoutDrag';
import { VnActionChoices } from '@/components/shared/VnActionChoices';
import { VnAutoPlayButton } from '@/components/shared/VnAutoPlayButton';
import { VnDialogueChoices } from '@/components/shared/VnDialogueChoices';
import { isNarrationSpeaker } from '@/components/shared/DialogueNodesEditor';
import { VnLocationBanner } from '@/components/vn/VnLocationBanner';
import {
  buildPairSideDialogueList,
  pairHasDialogue,
  pairSideDialogueStart,
  type PairVnSide,
} from '@/lib/pair/dialogue';
import { useBalancedDialogueText } from '@/lib/hooks/useBalancedDialogueText';
import { VN_OUT_MS } from '@/lib/vn/presence';
import { playLineVoice, stopLineVoice } from '@/lib/vn/playLineVoice';
import { useVnAutoPlay } from '@/lib/vn/useVnAutoPlay';
import '@/styles/shared/vn-savebar.css';
import {
  DIALOGUE_FX_MS,
  DIALOGUE_MOTION_MS,
  isDialogueFx,
  normalizeMotion,
  pairMotionClass,
  type DialogueFx,
  type DialogueMotion,
} from '@/lib/vn/motions';
import { VnCharBloom, VnCharFx } from '@/components/shared/VnCharFx';
import type { DialogueNode, PairItem, PairVnStandPose } from '@/lib/types/character';
import type { ImageFrame } from '@/lib/shared/imageFrame';

export type PairVnSpeakerSide = 'A' | 'B' | null;
export type { PairVnSide };
export { pairHasDialogue };

type Props = {
  pair: PairItem;
  active: boolean;
  present: boolean;
  leaving: boolean;
  /** 어느 쪽 전신을 눌렀는지 — A=왼쪽, B=오른쪽 */
  openSide: PairVnSide;
  /** 열릴 때마다 증가 — 인 애니 재시작용 */
  session?: number;
  onClose: () => void;
  /** 관리자: 스탠딩 위치 조절 가능(버튼으로 모드 ON) */
  standEditable?: boolean;
  onStandPoseChange?: (slot: 0 | 1, pose: PairVnStandPose) => void;
};

function resolveSpeakerSide(pair: PairItem, speaker?: string): PairVnSpeakerSide {
  if (isNarrationSpeaker(speaker)) return null;
  const raw = (speaker || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const nameA = (pair.chars[0] || '').trim();
  const nameB = (pair.chars[1] || '').trim();
  if (raw === 'A' || lower === 'a' || (nameA && raw === nameA)) return 'A';
  if (raw === 'B' || lower === 'b' || (nameB && raw === nameB)) return 'B';
  return null;
}

function displaySpeakerName(pair: PairItem, speaker?: string) {
  if (isNarrationSpeaker(speaker)) return '';
  const raw = (speaker || '').trim();
  if (raw === 'A' || raw.toLowerCase() === 'a') return pair.chars[0] || 'A';
  if (raw === 'B' || raw.toLowerCase() === 'b') return pair.chars[1] || 'B';
  return raw || '';
}

function nodeIndex(list: DialogueNode[], id: string | null, start?: string) {
  if (!list.length) return 0;
  const key = id || start || list[0].id;
  const idx = list.findIndex((n) => String(n.id) === String(key));
  return idx >= 0 ? idx : 0;
}

function StandFigure({
  src,
  pose,
  className,
  motion,
  fx,
  editable,
  onPoseChange,
}: {
  src: string;
  pose?: PairVnStandPose;
  className: string;
  motion?: DialogueMotion | null;
  fx?: DialogueFx | null;
  editable?: boolean;
  onPoseChange?: (pose: PairVnStandPose) => void;
}) {
  const frame = useMemo<ImageFrame>(
    () => ({
      x: pose?.x ?? 0,
      y: pose?.y ?? 0,
      scale: pose?.scale ?? 1,
      bottomBlur: pose?.bottomBlur ?? 0,
    }),
    [pose?.x, pose?.y, pose?.scale, pose?.bottomBlur],
  );
  const blur = Math.max(0, Math.min(100, frame.bottomBlur ?? 0));
  const handlePoseChange = useCallback(
    (next: ImageFrame) => {
      onPoseChange?.({
        x: next.x,
        y: next.y,
        scale: next.scale,
        bottomBlur: blur,
      });
    },
    [blur, onPoseChange],
  );
  const drag = usePairSlotLayoutDrag(
    frame,
    onPoseChange ? handlePoseChange : undefined,
    Boolean(editable && onPoseChange),
  );

  const layoutStyle: CSSProperties = {
    ...drag.layoutStyle(),
    transformOrigin: 'center bottom',
  };

  return (
    <div
      ref={drag.elRef}
      className={`${className}${editable ? ' is-stand-editable' : ''}${drag.selected ? ' is-layout-selected' : ''}${drag.dragging ? ' is-dragging' : ''}`}
      style={layoutStyle}
      {...drag.handlers}
    >
      <div className={`pair-vn-stand__motion${pairMotionClass(motion)}`}>
        {motion === 'pulse' ? <VnCharBloom src={src} /> : null}
        <div
          className={`pair-vn-stand__clip${blur > 0 ? ' has-bottom-blur' : ''}`}
          style={blur > 0 ? ({ '--img-bottom-blur': `${blur}%` } as CSSProperties) : undefined}
        >
          <img src={src} alt="" referrerPolicy="no-referrer" draggable={false} />
        </div>
        <VnCharFx fx={fx} />
      </div>
    </div>
  );
}

export function PairVnDialogue({
  pair,
  active,
  present,
  leaving,
  openSide,
  session = 0,
  onClose,
  standEditable,
  onStandPoseChange,
}: Props) {
  const list = useMemo(() => buildPairSideDialogueList(pair, openSide), [pair, openSide]);
  const startKey = pairSideDialogueStart(pair, openSide);
  const [pos, setPos] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [standPoseMode, setStandPoseMode] = useState(false);
  const [motionA, setMotionA] = useState<DialogueMotion | null>(null);
  const [motionB, setMotionB] = useState<DialogueMotion | null>(null);
  const [fxA, setFxA] = useState<DialogueFx | null>(null);
  const [fxB, setFxB] = useState<DialogueFx | null>(null);
  const [enterAnim, setEnterAnim] = useState(false);
  const typingDoneRef = useRef(true);
  const motionKeyRef = useRef('');
  const fxKeyRef = useRef('');
  const motionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fxClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poseEditing = Boolean(standEditable && standPoseMode && !leaving);

  const node = list[pos];
  const sourceText = (node?.text || '').trim() || '...';
  const { ref: textRef, text } = useBalancedDialogueText(sourceText, present && active && !leaving);
  const speakerRaw = node?.speaker || '';
  const isNarration = isNarrationSpeaker(speakerRaw);
  const speaker = displaySpeakerName(pair, speakerRaw);
  const speakerSide = resolveSpeakerSide(pair, speakerRaw);
  const choices = node?.choices?.filter((c) => c.label) || [];
  const isActionChoices = node?.choiceMode === 'action';
  const lineChoices = isActionChoices ? [] : choices;
  const actionChoices = isActionChoices ? choices : [];
  const isLastNode = list.length === 0 || pos >= list.length - 1;
  const isTyping = typedLen < text.length;
  const nextRaw = node?.next?.trim() || '';
  const endsHere = nextRaw === '__end__';
  const hasLinkedNext = Boolean(nextRaw) && !endsHere;
  const atEnd = !choices.length && (endsHere || (!hasLinkedNext && isLastNode)) && !isTyping;

  const bodyA = pair.charBodyImgs?.[0]?.trim() || pair.charImgs?.[0]?.trim() || '';
  const bodyB = pair.charBodyImgs?.[1]?.trim() || pair.charImgs?.[1]?.trim() || '';
  const expr = node?.expression?.trim() || '';
  const standA = speakerSide === 'A' && expr ? expr : bodyA;
  const standB = speakerSide === 'B' && expr ? expr : bodyB;

  useEffect(() => {
    if (!present) {
      setPos(0);
      setTypedLen(0);
      setStandPoseMode(false);
      motionKeyRef.current = '';
      fxKeyRef.current = '';
      setMotionA(null);
      setMotionB(null);
      setFxA(null);
      setFxB(null);
      setEnterAnim(false);
      if (enterClearRef.current) clearTimeout(enterClearRef.current);
      return;
    }
    if (!active || leaving) return;
    const start = nodeIndex(list, startKey || null, startKey);
    setPos(start);
    setTypedLen(0);
    setStandPoseMode(false);
  }, [active, present, leaving, pair.id, openSide, startKey, list]);

  /* 등장은 paint 전에 is-enter — useEffect면 첫 프레임이 스냅으로 보임 */
  useLayoutEffect(() => {
    if (!present || leaving) {
      setEnterAnim(false);
      if (enterClearRef.current) clearTimeout(enterClearRef.current);
      return;
    }
    if (!active) return;
    setEnterAnim(true);
    if (enterClearRef.current) clearTimeout(enterClearRef.current);
    enterClearRef.current = setTimeout(() => setEnterAnim(false), 1400);
    return () => {
      if (enterClearRef.current) clearTimeout(enterClearRef.current);
    };
  }, [active, present, leaving, pair.id, openSide]);

  useEffect(() => {
    if (!active || leaving || !node) return;
    const key = `${node.id || pos}:${node.motion || ''}`;
    if (motionKeyRef.current === key) return;
    motionKeyRef.current = key;
    if (motionClearRef.current) clearTimeout(motionClearRef.current);
    setMotionA(null);
    setMotionB(null);
    const m = normalizeMotion(node.motion);
    if (!m) return;
    /* is-enter는 유지 — 감정 모션은 CSS !important로 stand-in을 덮음.
       enterAnim을 끄면 딤·스탠딩 인 애니까 잘려 대사창이 툭 뜨는 느낌 */
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (speakerSide === 'A') setMotionA(m);
        else if (speakerSide === 'B') setMotionB(m);
        else {
          setMotionA(m);
          setMotionB(m);
        }
        motionClearRef.current = setTimeout(() => {
          setMotionA(null);
          setMotionB(null);
        }, DIALOGUE_MOTION_MS[m]);
      });
    });
  }, [active, leaving, node, pos, speakerSide]);

  useEffect(() => {
    if (!active || leaving || !node) return;
    const key = `${node.id || pos}:${node.fx || ''}`;
    if (fxKeyRef.current === key) return;
    fxKeyRef.current = key;
    if (fxClearRef.current) clearTimeout(fxClearRef.current);
    setFxA(null);
    setFxB(null);
    const f = node.fx;
    if (!isDialogueFx(f)) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (speakerSide === 'A') setFxA(f);
        else if (speakerSide === 'B') setFxB(f);
        else {
          setFxA(f);
          setFxB(f);
        }
        fxClearRef.current = setTimeout(() => {
          setFxA(null);
          setFxB(null);
        }, DIALOGUE_FX_MS);
      });
    });
  }, [active, leaving, node, pos, speakerSide]);

  useEffect(() => {
    if (!active || leaving) {
      stopLineVoice();
      return;
    }
    playLineVoice(node?.voice);
    return () => stopLineVoice();
  }, [active, leaving, pos, node?.id, node?.voice]);

  useEffect(() => {
    return () => {
      if (motionClearRef.current) clearTimeout(motionClearRef.current);
      if (fxClearRef.current) clearTimeout(fxClearRef.current);
      if (enterClearRef.current) clearTimeout(enterClearRef.current);
      stopLineVoice();
    };
  }, []);

  useEffect(() => {
    if (!active || leaving || typedLen >= text.length) {
      typingDoneRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => setTypedLen((n) => n + 1), 68);
    return () => window.clearTimeout(timer);
  }, [active, leaving, text, typedLen]);

  useLayoutEffect(() => {
    if (!active || leaving) return;
    setTypedLen(0);
    typingDoneRef.current = false;
  }, [active, leaving, pos, text]);

  const skipTyping = useCallback(() => {
    setTypedLen(text.length);
    typingDoneRef.current = true;
  }, [text]);

  const advance = useCallback(() => {
    if (choices.length) return;
    const nextId = node?.next?.trim();
    if (nextId === '__end__') {
      onClose();
      return;
    }
    if (nextId) {
      const idx = list.findIndex((n) => String(n.id) === String(nextId));
      if (idx < 0) {
        onClose();
        return;
      }
      setPos(idx);
      return;
    }
    if (isLastNode || list.length === 0) {
      onClose();
      return;
    }
    setPos((p) => p + 1);
  }, [choices.length, isLastNode, list, node?.next, onClose]);

  const handleBoxClick = useCallback(() => {
    if (choices.length) return;
    if (isTyping) {
      skipTyping();
      return;
    }
    advance();
  }, [advance, choices.length, isTyping, skipTyping]);

  const handleSurfaceClick = useCallback(() => {
    if (choices.length) return;
    if (isTyping) {
      skipTyping();
      return;
    }
    if (atEnd && !node?.next?.trim()) {
      onClose();
      return;
    }
    advance();
  }, [advance, atEnd, choices.length, isTyping, node?.next, onClose, skipTyping]);

  const { autoPlay, toggleAutoPlay } = useVnAutoPlay({
    active: present && active,
    leaving,
    isTyping,
    hasChoices: choices.length > 0,
    lineKey: node?.id || pos,
    textLength: text.length,
    onAdvance: advance,
  });

  const goTo = useCallback(
    (id: string) => {
      const idx = list.findIndex((n) => String(n.id) === String(id));
      if (idx < 0) {
        onClose();
        return;
      }
      setPos(idx);
    },
    [list, onClose],
  );

  useEffect(() => {
    if (!active || leaving) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, leaving, onClose]);

  useEffect(() => {
    if (!active || leaving) return;

    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest('.lh-vn-choice, .lh-vn-action-choice, .lh-vn-close, .lh-vn-auto, .lh-vn-box, .btn-edit, .pair-vn-stand-pose-btn, .pair-edit-form, .archive-topbar')) {
        return;
      }
      /* 스탠딩 위치 조절 중에는 대사 진행 안 함 */
      if (t.closest('.pair-vn-stand.is-stand-editable')) {
        return;
      }
      if (t.closest('.pair-vn-layer, .pair-vn-stand, .chara-body-wrapper.is-vn-trigger')) {
        e.preventDefault();
        handleSurfaceClick();
        return;
      }
      if (atEnd) onClose();
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [active, leaving, atEnd, handleSurfaceClick, onClose]);

  useEffect(() => {
    if (!present) return;
    function blockCopy(e: ClipboardEvent) {
      if ((e.target as HTMLElement | null)?.closest?.('#lh-vn, .lh-vn-action-choices')) {
        e.preventDefault();
      }
    }
    function blockSelect(e: Event) {
      if ((e.target as HTMLElement | null)?.closest?.('#lh-vn, .lh-vn-action-choices, .lh-vn-choice, .lh-vn-action-choice')) {
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
  }, [present]);

  if (!present) return null;

  const display = typedLen > 0 ? text.slice(0, typedLen) : '';
  const hasNext = !choices.length && !endsHere && (hasLinkedNext || !isLastNode);

  return (
    <div
      key={session}
      className={`pair-vn-layer${leaving ? ' is-leaving' : enterAnim ? ' is-enter' : ''}`}
      role="presentation"
    >
      <div className="pair-vn-dim" aria-hidden />

      <div className="pair-vn-stage" aria-hidden={!standA && !standB}>
        {standEditable ? (
          <button
            type="button"
            className={`pair-vn-stand-pose-btn${poseEditing ? ' is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setStandPoseMode((v) => !v);
            }}
            title="스탠딩 위치·크기 조정"
          >
            {poseEditing ? '✓ 위치' : '위치'}
          </button>
        ) : null}
        {poseEditing ? (
          <p className="pair-vn-stand-hint" role="status">
            스탠딩을 클릭해 선택한 뒤 드래그·휠로 위치·크기 조절
          </p>
        ) : null}
        {standA ? (
          <StandFigure
            src={standA}
            pose={pair.vnStandPos?.[0]}
            editable={poseEditing}
            motion={motionA}
            fx={fxA}
            onPoseChange={onStandPoseChange ? (pose) => onStandPoseChange(0, pose) : undefined}
            className={[
              'pair-vn-stand',
              'pair-vn-stand--a',
              !isNarration && speakerSide === 'A' ? 'is-speaking' : '',
              isNarration || speakerSide === 'B' ? 'is-dimmed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ) : null}
        {standB ? (
          <StandFigure
            src={standB}
            pose={pair.vnStandPos?.[1]}
            editable={poseEditing}
            motion={motionB}
            fx={fxB}
            onPoseChange={onStandPoseChange ? (pose) => onStandPoseChange(1, pose) : undefined}
            className={[
              'pair-vn-stand',
              'pair-vn-stand--b',
              !isNarration && speakerSide === 'B' ? 'is-speaking' : '',
              isNarration || speakerSide === 'A' ? 'is-dimmed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ) : null}
      </div>

      {actionChoices.length > 0 && !isTyping && !leaving ? (
        <VnActionChoices
          choices={actionChoices}
          onPick={(next) => {
            if (next) goTo(next);
            else onClose();
          }}
        />
      ) : null}

      <VnLocationBanner location={node?.location} />

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
            if ((e.target as HTMLElement).closest('.lh-vn-choice, .lh-vn-close, .lh-vn-auto')) return;
            handleBoxClick();
          }}
        >
          <VnAutoPlayButton on={autoPlay} onToggle={toggleAutoPlay} disabled={leaving} />
          <button
            type="button"
            className="lh-vn-close"
            onClick={onClose}
            aria-label="닫기"
            disabled={leaving}
          >
            ×
          </button>
          <div className={`lh-vn-speaker${isNarration || !speaker ? ' is-empty' : ''}`} id="lh-vn-speaker">
            {isNarration || !speaker ? '\u00A0' : speaker}
          </div>
          <div
            ref={textRef}
            className={`lh-vn-text${isTyping ? ' lh-typing' : ''}`}
            id="lh-vn-text"
          >
            {display}
          </div>
          {lineChoices.length > 0 && !isTyping && (
            <VnDialogueChoices
              choices={lineChoices}
              onPick={(next) => {
                if (next) goTo(next);
                else onClose();
              }}
            />
          )}
          {hasNext && !isTyping && !choices.length && <span className="lh-vn-next" aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}

export function usePairVnDialogue() {
  const [active, setActive] = useState(false);
  const [present, setPresent] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [openSide, setOpenSide] = useState<PairVnSide>('A');
  const [session, setSession] = useState(0);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentRef = useRef(false);
  presentRef.current = present;

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  const open = useCallback(
    (side: PairVnSide = 'A') => {
      clearLeaveTimer();
      setOpenSide(side);
      setLeaving(false);
      setSession((n) => n + 1);
      setPresent(true);
      setActive(true);
    },
    [clearLeaveTimer],
  );

  const close = useCallback(() => {
    stopLineVoice();
    setActive(false);
    if (!presentRef.current) return;
    setLeaving((wasLeaving) => {
      if (wasLeaving) return true;
      clearLeaveTimer();
      leaveTimerRef.current = setTimeout(() => {
        setPresent(false);
        setLeaving(false);
        leaveTimerRef.current = null;
      }, VN_OUT_MS);
      return true;
    });
  }, [clearLeaveTimer]);

  return { active, present, leaving, openSide, open, close, session };
}
