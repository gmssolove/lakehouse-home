'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VnActionChoices } from '@/components/shared/VnActionChoices';
import { VnAutoPlayButton } from '@/components/shared/VnAutoPlayButton';
import { VnDialogueChoices } from '@/components/shared/VnDialogueChoices';
import { isNarrationSpeaker } from '@/components/shared/DialogueNodesEditor';
import { VnLocationBanner } from '@/components/vn/VnLocationBanner';
import { useBalancedDialogueText } from '@/lib/hooks/useBalancedDialogueText';
import { playLineVoice, stopLineVoice } from '@/lib/vn/playLineVoice';
import { VN_OUT_MS } from '@/lib/vn/presence';
import { useVnAutoPlay } from '@/lib/vn/useVnAutoPlay';
import { normalizeMotion, isDialogueFx, type DialogueFx, type DialogueMotion } from '@/lib/vn/motions';
import type { DialogueNode, OcCharacter } from '@/lib/types/character';
import '@/styles/shared/vn-savebar.css';

type Props = {
  character: OcCharacter;
  active: boolean;
  present: boolean;
  leaving: boolean;
  onClose: () => void;
  onExpression?: (src: string | null) => void;
  onMotion?: (motion: DialogueMotion | null) => void;
  onFx?: (fx: DialogueFx | null) => void;
};

function buildDialogueList(c: OcCharacter): DialogueNode[] {
  if (c.dialogue?.length) {
    return c.dialogue.filter((n) => n.text?.trim());
  }
  if (c.vnLines?.length) {
    return c.vnLines
      .filter((l) => l.text?.trim())
      .map((l, i) => ({
        id: String(i + 1),
        speaker: l.speaker || c.name,
        text: l.text || '',
        choices: [],
      }));
  }
  return [];
}

function nodeIndex(list: DialogueNode[], id: string | null, start?: string) {
  if (!list.length) return 0;
  const key = id || start || list[0].id;
  const idx = list.findIndex((n) => String(n.id) === String(key));
  return idx >= 0 ? idx : 0;
}

export function OcVnDialogue({
  character,
  active,
  present,
  leaving,
  onClose,
  onExpression,
  onMotion,
  onFx,
}: Props) {
  const list = useMemo(() => buildDialogueList(character), [character]);
  const [pos, setPos] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const typingDoneRef = useRef(true);
  const motionKeyRef = useRef('');
  const fxKeyRef = useRef('');

  const node = list[pos];
  const sourceText = (node?.text || '').trim() || '...';
  const { ref: textRef, text } = useBalancedDialogueText(sourceText, present && active && !leaving);
  const isNarration = isNarrationSpeaker(node?.speaker);
  const speaker = isNarration ? '' : node?.speaker || character.name || '';
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

  useEffect(() => {
    if (!present) {
      setPos(0);
      setTypedLen(0);
      motionKeyRef.current = '';
      fxKeyRef.current = '';
      onExpression?.(null);
      onMotion?.(null);
      onFx?.(null);
      return;
    }
    if (!active || leaving) return;
    const start = nodeIndex(list, character.dialogueStart || null, character.dialogueStart);
    setPos(start);
    setTypedLen(0);
  }, [active, present, leaving, character.id, character.dialogueStart, list, onExpression, onMotion, onFx]);

  useEffect(() => {
    if (!active || leaving) return;
    const expr = node?.expression;
    onExpression?.(expr || null);
  }, [active, leaving, node?.expression, onExpression]);

  useEffect(() => {
    if (!active || leaving || !node) return;
    const key = `${node.id || pos}:${node.motion || ''}`;
    if (motionKeyRef.current === key) return;
    motionKeyRef.current = key;
    const m = normalizeMotion(node.motion);
    if (m) onMotion?.(m);
    else onMotion?.(null);
  }, [active, leaving, node, pos, onMotion]);

  useEffect(() => {
    if (!active || leaving || !node) return;
    const key = `${node.id || pos}:${node.fx || ''}`;
    if (fxKeyRef.current === key) return;
    fxKeyRef.current = key;
    const f = node.fx;
    if (isDialogueFx(f)) onFx?.(f);
    else onFx?.(null);
  }, [active, leaving, node, pos, onFx]);

  useEffect(() => {
    if (!active || leaving) {
      stopLineVoice();
      return;
    }
    playLineVoice(node?.voice);
    return () => stopLineVoice();
  }, [active, leaving, pos, node?.id, node?.voice]);

  useLayoutEffect(() => {
    if (!active || leaving) return;
    setTypedLen(0);
    typingDoneRef.current = false;
  }, [active, leaving, pos, text]);

  useEffect(() => {
    if (!active || leaving || typedLen >= text.length) {
      typingDoneRef.current = true;
      return;
    }
    const t = window.setTimeout(() => setTypedLen((n) => n + 1), 68);
    return () => window.clearTimeout(t);
  }, [active, leaving, text, typedLen]);

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
      if (
        t.closest(
          '.lh-vn-choice, .lh-vn-action-choice, .lh-vn-close, .lh-vn-auto, .lh-vn-box, .oc-left-acc, .oc-detail-right, .game-back, .oc-au-picker, .oc-tease-fab, .oc-stat-hover__trigger, .oc-stat-hover__panel, .btn-edit, .oc-edit-panel',
        )
      ) {
        return;
      }

      const onChar = t.closest('#game-char-img, .game-left');
      if (onChar) {
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

  const actionLayer =
    actionChoices.length > 0 && !isTyping && !leaving ? (
      <VnActionChoices
        choices={actionChoices}
        onPick={(next) => {
          if (next) goTo(next);
          else onClose();
        }}
      />
    ) : null;

  const overlay = (
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
          if ((e.target as HTMLElement).closest('.lh-vn-choice, .lh-vn-close, .lh-vn-auto')) return;
          handleBoxClick();
        }}
      >
        <VnAutoPlayButton on={autoPlay} onToggle={toggleAutoPlay} disabled={leaving} />
        <button type="button" className="lh-vn-close" onClick={onClose} aria-label="닫기" disabled={leaving}>
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
        {hasNext && !isTyping && !choices.length && (
          <span className="lh-vn-next" aria-hidden="true" />
        )}
      </div>
    </div>
  );

  return (
    <>
      <VnLocationBanner location={node?.location} />
      {actionLayer}
      {overlay}
    </>
  );
}

export function useVnDialogue(character: OcCharacter) {
  void character;
  const [active, setActive] = useState(false);
  const [present, setPresent] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [expression, setExpression] = useState<string | null>(null);
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

  const open = useCallback(() => {
    clearLeaveTimer();
    setExpression(null);
    setLeaving(false);
    setPresent(true);
    setActive(true);
  }, [clearLeaveTimer]);

  const close = useCallback(() => {
    stopLineVoice();
    setActive(false);
    if (!presentRef.current) {
      setPresent(false);
      setLeaving(false);
      setExpression(null);
      return;
    }
    setLeaving((wasLeaving) => {
      if (wasLeaving) return true;
      /* 퇴장과 동시에 표정→기본 soft 전환 시작 (present 유지 중 expression 해제) */
      setExpression(null);
      clearLeaveTimer();
      leaveTimerRef.current = setTimeout(() => {
        setPresent(false);
        setLeaving(false);
        setExpression(null);
        leaveTimerRef.current = null;
      }, VN_OUT_MS);
      return true;
    });
  }, [clearLeaveTimer]);

  return { active, present, leaving, expression, open, close, setExpression };
}
