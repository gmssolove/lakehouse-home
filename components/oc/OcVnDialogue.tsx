'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DialogueNode, OcCharacter } from '@/lib/types/character';

type Props = {
  character: OcCharacter;
  active: boolean;
  onClose: () => void;
  onExpression?: (src: string | null) => void;
  onMotion?: (motion: 'bounce' | 'shake' | null) => void;
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

export function OcVnDialogue({ character, active, onClose, onExpression, onMotion }: Props) {
  const list = useMemo(() => buildDialogueList(character), [character]);
  const [pos, setPos] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const typingDoneRef = useRef(true);
  const motionKeyRef = useRef('');

  const node = list[pos];
  const text = (node?.text || '').trim() || '...';
  const speaker = node?.speaker || character.name || '';
  const choices = node?.choices?.filter((c) => c.label) || [];
  const isLastNode = list.length === 0 || pos >= list.length - 1;
  const isTyping = typedLen < text.length;
  const atEnd = !choices.length && isLastNode && !isTyping;

  useEffect(() => {
    if (!active) {
      setPos(0);
      setTypedLen(0);
      motionKeyRef.current = '';
      onExpression?.(null);
      onMotion?.(null);
      return;
    }
    const start = nodeIndex(list, character.dialogueStart || null, character.dialogueStart);
    setPos(start);
    setTypedLen(0);
  }, [active, character.id, character.dialogueStart, list, onExpression, onMotion]);

  useEffect(() => {
    if (!active) return;
    const expr = node?.expression;
    onExpression?.(expr || null);
  }, [active, node?.expression, onExpression]);

  useEffect(() => {
    if (!active || !node) return;
    const key = `${node.id || pos}:${node.motion || ''}`;
    if (motionKeyRef.current === key) return;
    motionKeyRef.current = key;
    const m = node.motion;
    if (m === 'bounce' || m === 'shake') onMotion?.(m);
    else onMotion?.(null);
  }, [active, node, pos, onMotion]);

  useLayoutEffect(() => {
    if (!active) return;
    setTypedLen(0);
    typingDoneRef.current = false;
  }, [active, pos, text]);

  useEffect(() => {
    if (!active || typedLen >= text.length) {
      typingDoneRef.current = true;
      return;
    }
    const t = window.setTimeout(() => setTypedLen((n) => n + 1), 46);
    return () => window.clearTimeout(t);
  }, [active, text, typedLen]);

  const skipTyping = useCallback(() => {
    setTypedLen(text.length);
    typingDoneRef.current = true;
  }, [text]);

  const handleBoxClick = useCallback(() => {
    if (choices.length) return;
    if (isTyping) {
      skipTyping();
      return;
    }
    if (isLastNode || list.length === 0) {
      onClose();
      return;
    }
    setPos((p) => p + 1);
  }, [choices.length, isLastNode, isTyping, list.length, onClose, skipTyping]);

  const handleSurfaceClick = useCallback(() => {
    if (choices.length) return;
    if (isTyping) {
      skipTyping();
      return;
    }
    if (atEnd) {
      onClose();
      return;
    }
    if (isLastNode || list.length === 0) {
      onClose();
      return;
    }
    setPos((p) => p + 1);
  }, [atEnd, choices.length, isLastNode, isTyping, list.length, onClose, skipTyping]);

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
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);

  useEffect(() => {
    if (!active) return;

    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (
        t.closest(
          '.lh-vn-choice, .lh-vn-close, .lh-vn-box, .oc-left-acc, .oc-detail-right, .game-back, .oc-au-picker, .btn-edit, .oc-edit-panel',
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
  }, [active, atEnd, handleSurfaceClick, onClose]);

  useEffect(() => {
    if (!active) return;
    function blockCopy(e: ClipboardEvent) {
      if ((e.target as HTMLElement | null)?.closest?.('#lh-vn')) e.preventDefault();
    }
    document.addEventListener('copy', blockCopy, true);
    return () => document.removeEventListener('copy', blockCopy, true);
  }, [active]);

  if (!active) return null;

  const display = typedLen > 0 ? text.slice(0, typedLen) : '';
  const hasNext = !choices.length && !isLastNode;

  return (
    <div
      className={`lh-vn-overlay active oc-vn-overlay`}
      id="lh-vn"
      role="dialog"
      aria-label="대화"
    >
      <div
        className={`lh-vn-box${hasNext && !isTyping && !choices.length ? ' has-next' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if ((e.target as HTMLElement).closest('.lh-vn-choice, .lh-vn-close')) return;
          handleBoxClick();
        }}
      >
        <button type="button" className="lh-vn-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <div className="lh-vn-speaker" id="lh-vn-speaker">
          {speaker}
        </div>
        <div className={`lh-vn-text${isTyping ? ' lh-typing' : ''}`} id="lh-vn-text">
          {display}
        </div>
        {choices.length > 0 && !isTyping && (
          <div className="lh-vn-choices" id="lh-vn-choices">
            {choices.map((ch) => (
              <button
                key={`${ch.label}-${ch.next}`}
                type="button"
                className="lh-vn-choice"
                onClick={(e) => {
                  e.stopPropagation();
                  if (ch.next) goTo(ch.next);
                  else onClose();
                }}
              >
                {ch.label}
              </button>
            ))}
          </div>
        )}
        {hasNext && !isTyping && !choices.length && (
          <span className="lh-vn-next" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

export function useVnDialogue(character: OcCharacter) {
  const [active, setActive] = useState(false);
  const [expression, setExpression] = useState<string | null>(null);

  const open = useCallback(() => setActive(true), []);
  const close = useCallback(() => {
    setActive(false);
    setExpression(null);
  }, []);

  return { active, expression, open, close, setExpression };
}
