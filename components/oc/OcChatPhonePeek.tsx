'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  characterName: string;
  unread?: number;
  hidden?: boolean;
  onOpen: () => void;
};

function chatInviteLabel(name: string) {
  const n = name.trim() || '캐릭터';
  const code = n.charCodeAt(n.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const batchim = (code - 0xac00) % 28 !== 0;
    return `${n}${batchim ? '과' : '와'} 채팅하기`;
  }
  return `${n}과 채팅하기`;
}

export function OcChatPhonePeek({ characterName, unread = 0, hidden, onOpen }: Props) {
  const [hintOn, setHintOn] = useState(false);
  const [hintOut, setHintOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintRef = useRef<HTMLSpanElement | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const moveRaf = useRef(0);
  const label = chatInviteLabel(characterName);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const flushHintPos = useCallback(() => {
    moveRaf.current = 0;
    const el = hintRef.current;
    if (!el) return;
    const { x, y } = lastPos.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, calc(-100% - 16px))`;
  }, []);

  const moveHint = useCallback(
    (x: number, y: number) => {
      lastPos.current = { x, y };
      if (moveRaf.current) return;
      moveRaf.current = window.requestAnimationFrame(flushHintPos);
    },
    [flushHintPos],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(
    () => () => {
      clearLeave();
      if (moveRaf.current) window.cancelAnimationFrame(moveRaf.current);
    },
    [clearLeave],
  );

  useLayoutEffect(() => {
    if (!hintOn) return;
    flushHintPos();
  }, [hintOn, flushHintPos]);

  useEffect(() => {
    if (hidden) {
      setShow(false);
      setReady(false);
      setHintOn(false);
      setHintOut(false);
      clearLeave();
      return;
    }
    // hidden 해제 순간 지연(setTimeout) + RAF 2단계가 합쳐지면
    // 알림이 뜰 때 프레임 드랍/깜빡임이 생길 수 있다.
    // show/ready는 즉시 토글하고, 시각 효과는 CSS transition이 처리한다.
    setShow(true);
  }, [hidden, clearLeave]);

  /* 마운트/재등장마다 아래에서 올라오는 인 애니메이션 */
  useLayoutEffect(() => {
    if (!show) {
      setReady(false);
      return;
    }
    setReady(false);
    // 2단계 RAF 대신 1단계만 사용해 토글 타이밍을 단순화한다.
    const raf = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(raf);
  }, [show]);

  if (!mounted || !show) return null;

  const ui = (
    <>
      <button
        type="button"
        className={`oc-chat-phone-peek${ready ? ' is-ready' : ''}`}
        aria-label={unread > 0 ? `${label}, 안 읽은 메시지 ${unread}` : label}
        onClick={onOpen}
        onPointerEnter={(e) => {
          clearLeave();
          moveHint(e.clientX, e.clientY);
          setHintOut(false);
          setHintOn(true);
        }}
        onPointerMove={(e) => {
          moveHint(e.clientX, e.clientY);
        }}
        onPointerLeave={() => {
          setHintOut(true);
          clearLeave();
          leaveTimer.current = setTimeout(() => {
            setHintOn(false);
            setHintOut(false);
          }, 140);
        }}
      >
        <span className="oc-chat-phone-peek__visual" aria-hidden>
          <img
            className="oc-chat-phone-peek__img"
            src="/oc/chat-phone-peek.png?v=3"
            alt=""
            draggable={false}
            decoding="async"
          />
          {unread > 0 ? (
            <span className="oc-chat-phone-peek__badge" aria-hidden>
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </span>
      </button>
      {hintOn ? (
        <span
          ref={hintRef}
          className={`oc-chat-phone-peek__hint${hintOut ? ' is-out' : ' is-in'}`}
          aria-hidden
        >
          {label}
        </span>
      ) : null}
    </>
  );

  return createPortal(ui, document.body);
}
