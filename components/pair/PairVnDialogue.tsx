'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
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
import { framedImageStyle, type ImageFrame } from '@/lib/shared/imageFrame';

export type PairVnSpeakerSide = 'A' | 'B' | null;
export type { PairVnSide };
export { pairHasDialogue };

type Props = {
  pair: PairItem;
  active: boolean;
  present: boolean;
  leaving: boolean;
  openSide: PairVnSide;
  session?: number;
  onClose: () => void;
  standEditable?: boolean;
  onStandPoseChange?: (slot: 0 | 1, pose: PairVnStandPose) => void;
  /** 위치 편집 중 — 부모에서 메인 전신을 보이게 */
  onPoseEditingChange?: (editing: boolean) => void;
};

type AnchorBox = { top: number; left: number; width: number; height: number };

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

/** 메인 .chara-body-wrapper[data-pair-stand] 박스 → VN 레이어 좌표 */
function usePairStandAnchor(
  side: 'A' | 'B',
  active: boolean,
  layoutKey: string,
): AnchorBox | null {
  const [box, setBox] = useState<AnchorBox | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setBox(null);
      return;
    }

    const read = () => {
      const el = document.querySelector(
        `.pair-detail-screen [data-pair-stand="${side}"]`,
      ) as HTMLElement | null;
      const layer = document.querySelector(
        '.pair-detail-screen .pair-vn-layer',
      ) as HTMLElement | null;
      if (!el || !layer) return;
      const er = el.getBoundingClientRect();
      const lr = layer.getBoundingClientRect();
      if (er.width < 2 || er.height < 2) return;
      setBox({
        top: er.top - lr.top,
        left: er.left - lr.left,
        width: er.width,
        height: er.height,
      });
    };

    read();
    const el = document.querySelector(`.pair-detail-screen [data-pair-stand="${side}"]`);
    const ro =
      typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(() => read()) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener('resize', read);
    window.addEventListener('scroll', read, true);
    const t1 = window.setTimeout(read, 32);
    const t2 = window.setTimeout(read, 200);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', read);
      window.removeEventListener('scroll', read, true);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active, side, layoutKey]);

  return box;
}

/**
 * VN 스탠딩 — 연출(등장/화자 딤)은 유지하되,
 * 박스는 메인 전신 wrapper 와 동일한 화면 좌표.
 * (레이아웃 transform 은 메인에 이미 반영되어 있으므로 여기선 좌표만 맞춤)
 */
function StandFigure({
  src,
  side,
  bodyLayout,
  bodyFrame,
  className,
  motion,
  fx,
  present,
  poseEditing,
}: {
  src: string;
  side: 'A' | 'B';
  bodyLayout?: ImageFrame;
  bodyFrame?: ImageFrame;
  className: string;
  motion?: DialogueMotion | null;
  fx?: DialogueFx | null;
  present: boolean;
  poseEditing?: boolean;
}) {
  const layoutKey = `${bodyLayout?.x ?? 0}:${bodyLayout?.y ?? 0}:${bodyLayout?.scale ?? 1}`;
  const anchor = usePairStandAnchor(side, present && !poseEditing, layoutKey);
  const blur = Math.max(0, Math.min(100, bodyFrame?.bottomBlur ?? bodyLayout?.bottomBlur ?? 22));

  const bodyImgStyle = framedImageStyle(bodyFrame, {
    fit: 'contain',
    pos: 'center top',
  });
  /* wrapper 에 이미 transform 반영된 박스를 쓰므로 img 에는 fit 만 */
  const { transform: _t, ...bodyImgStyleBase } = bodyImgStyle;

  if (poseEditing) return null;
  if (!anchor) return null;

  const style: CSSProperties = {
    position: 'absolute',
    top: anchor.top,
    left: anchor.left,
    width: anchor.width,
    height: anchor.height,
    margin: 0,
    transform: 'none',
    transformOrigin: side === 'A' ? 'left top' : 'right top',
  };

  return (
    <div className={className} style={style}>
      <div className={`pair-vn-stand__motion${pairMotionClass(motion)}`}>
        {motion === 'pulse' ? <VnCharBloom src={src} /> : null}
        <div
          className={`pair-vn-stand__clip${blur > 0 ? ' has-bottom-blur' : ''}`}
          style={blur > 0 ? ({ '--img-bottom-blur': `${blur}%` } as CSSProperties) : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            decoding="async"
            fetchPriority="high"
            draggable={false}
            style={bodyImgStyleBase}
          />
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
  onPoseEditingChange,
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
  const openedAtRef = useRef(0);
  const poseEditing = Boolean(standEditable && standPoseMode && !leaving);

  useEffect(() => {
    onPoseEditingChange?.(poseEditing);
  }, [poseEditing, onPoseEditingChange]);

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

  useLayoutEffect(() => {
    if (!present || leaving) {
      setEnterAnim(false);
      if (enterClearRef.current) clearTimeout(enterClearRef.current);
      return;
    }
    if (!active) return;
    openedAtRef.current = Date.now();
    setEnterAnim(true);
    if (enterClearRef.current) clearTimeout(enterClearRef.current);
    enterClearRef.current = setTimeout(() => setEnterAnim(false), 1400);
    return () => {
      if (enterClearRef.current) clearTimeout(enterClearRef.current);
    };
  }, [active, present, leaving, pair.id, openSide, session]);

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
    const timer = window.setTimeout(() => setTypedLen((n) => n + 1), 90);
    return () => window.clearTimeout(timer);
  }, [active, leaving, text, typedLen]);

  useLayoutEffect(() => {
    if (!active || leaving) return;
    setTypedLen(0);
    typingDoneRef.current = false;
  }, [active, leaving, pos, sourceText]);

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

  const canAdvanceInput = useCallback(() => {
    if (Date.now() - openedAtRef.current < 500) return false;
    return true;
  }, []);

  const handleBoxClick = useCallback(() => {
    if (!canAdvanceInput()) return;
    if (choices.length) return;
    if (isTyping) {
      skipTyping();
      return;
    }
    advance();
  }, [advance, canAdvanceInput, choices.length, isTyping, skipTyping]);

  const handleSurfaceClick = useCallback(() => {
    if (!canAdvanceInput()) return;
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
  }, [advance, atEnd, canAdvanceInput, choices.length, isTyping, node?.next, onClose, skipTyping]);

  const { autoPlay, toggleAutoPlay } = useVnAutoPlay({
    active: present && active,
    leaving,
    isTyping,
    hasChoices: choices.length > 0,
    lineKey: node?.id || pos,
    textLength: sourceText.length,
    onAdvance: advance,
    scope: 'detail',
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
      if (
        t.closest(
          '.lh-vn-choice, .lh-vn-action-choice, .lh-vn-close, .lh-vn-auto, .lh-vn-box, .btn-edit, .pair-vn-stand-pose-btn, .pair-edit-form, .archive-topbar',
        )
      ) {
        return;
      }
      if (t.closest('.pair-vn-stand.is-stand-editable, .chara-body-wrapper.is-layout-editable')) {
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
      if (
        (e.target as HTMLElement | null)?.closest?.(
          '#lh-vn, .lh-vn-action-choices, .lh-vn-choice, .lh-vn-action-choice',
        )
      ) {
        e.preventDefault();
      }
    }
    function blockDrag(e: Event) {
      if ((e.target as HTMLElement | null)?.closest?.('#lh-vn')) {
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
            전신을 클릭해 선택한 뒤 드래그·휠로 위치·크기 조절
          </p>
        ) : null}
        {standA ? (
          <StandFigure
            src={standA}
            side="A"
            bodyLayout={pair.charBodyLayout?.[0]}
            bodyFrame={pair.charBodyImgFrames?.[0]}
            present={present}
            poseEditing={poseEditing}
            motion={motionA}
            fx={fxA}
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
            side="B"
            bodyLayout={pair.charBodyLayout?.[1]}
            bodyFrame={pair.charBodyImgFrames?.[1]}
            present={present}
            poseEditing={poseEditing}
            motion={motionB}
            fx={fxB}
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
          <div ref={textRef} className={`lh-vn-text${isTyping ? ' lh-typing' : ''}`} id="lh-vn-text">
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
