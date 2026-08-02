'use client';

import { resolveOcChatPointStyle, normalizeHex } from '@/lib/oc/characterTheme';
import { resolveChatAvatarUrl } from '@/lib/oc/ocChatPrompt';
import type { OcCharacter } from '@/lib/types/character';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

/** 진행바·유지 시간. CSS `--oc-chat-notify-ms` 와 맞출 것 */
export const OC_CHAT_NOTIFY_MS = 5000;
/** 퇴장(블러+슬라이드 업) — 대사창 lhVNOutSlow 에 맞춤 */
export const OC_CHAT_NOTIFY_LEAVE_MS = 420;

export type OcChatNotifyKind = 'reply' | 'message';

export type OcChatNotifyPayload = {
  id: string;
  /** 읽음 후 해당 OC 토스트만 지우기 위함 */
  characterId?: string;
  name: string;
  /** 「OO님이 답장/메시지를 보냈습니다」 — aria / 향후 타이틀용 */
  title: string;
  /** 미리보기 1줄 */
  text: string;
  avatarUrl: string;
  personalColor?: string;
  sfxUrl?: string;
  kind: OcChatNotifyKind;
};

type Props = {
  /** 큐 앞쪽부터 순차 표시 (겹침 없음) */
  payload: OcChatNotifyPayload | null;
  onDone: (id: string) => void;
  onOpen?: (payload: OcChatNotifyPayload) => void;
};

function playNotifySfx(url: string | undefined) {
  const src = (url || '').trim();
  if (!src || typeof window === 'undefined') return;
  try {
    const audio = new Audio(src);
    audio.volume = 0.85;
    void audio.play().catch(() => {});
  } catch {
    /* autoplay / decode ignore */
  }
}

function previewText(msg: { content?: string; kind?: string }): string {
  const raw = (msg.content || '').replace(/\s+/g, ' ').trim();
  if (msg.kind === 'sticker') return raw || '스티커를 보냈어요';
  if (msg.kind === 'choice') return raw || '선택지가 있어요';
  return raw || '새 메시지';
}

/** 직전 유저 발화가 있으면 답장, 아니면 선톡/신규 메시지 */
export function resolveOcChatNotifyKind(
  messages: Array<{ id: string; role?: string; kind?: string }>,
  targetId: string,
): OcChatNotifyKind {
  const idx = messages.findIndex((m) => m.id === targetId);
  if (idx <= 0) return 'message';
  for (let i = idx - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.kind === 'narration') continue;
    if (m.role === 'user') return 'reply';
    if (m.role === 'assistant') return 'message';
  }
  return 'message';
}

export function buildOcChatNotifyTitle(name: string, kind: OcChatNotifyKind): string {
  const n = name.trim() || '캐릭터';
  return kind === 'reply' ? `${n}님이 답장을 보냈습니다` : `${n}님이 메시지를 보냈습니다`;
}

export function buildOcChatNotifyPayload(
  character: Pick<OcCharacter, 'id' | 'name' | 'personalColor' | 'chatbot'>,
  msg: { id: string; content?: string; kind?: string },
  messages?: Array<{ id: string; role?: string; kind?: string }>,
): OcChatNotifyPayload {
  const name = character.name?.trim() || '캐릭터';
  const kind = messages?.length
    ? resolveOcChatNotifyKind(messages, msg.id)
    : ('message' as OcChatNotifyKind);
  return {
    id: msg.id,
    characterId: character.id ? String(character.id) : undefined,
    name,
    title: buildOcChatNotifyTitle(name, kind),
    text: previewText(msg),
    avatarUrl: resolveChatAvatarUrl(character),
    personalColor: character.personalColor,
    sfxUrl: character.chatbot?.notifySfxUrl,
    kind,
  };
}

export function OcChatNotifyToast({ payload, onDone, onOpen }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const shownIdRef = useRef<string | null>(null);
  const doneOnceRef = useRef(false);
  const leaveTimer = useRef(0);
  const doneTimer = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback((id: string) => {
    if (doneOnceRef.current) return;
    doneOnceRef.current = true;
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(doneTimer.current);
    setVisible(false);
    setLeaving(false);
    onDoneRef.current(id);
  }, []);

  const startLeave = useCallback(
    (id: string) => {
      setLeaving(true);
      window.clearTimeout(doneTimer.current);
      doneTimer.current = window.setTimeout(() => {
        finish(id);
      }, OC_CHAT_NOTIFY_LEAVE_MS + 40);
    },
    [finish],
  );

  const pointStyle = useMemo(() => {
    const base = resolveOcChatPointStyle(payload?.personalColor);
    const hex = normalizeHex(payload?.personalColor) || '#d7a982';
    return {
      ...base,
      '--oc-chat-notify-ms': `${OC_CHAT_NOTIFY_MS}ms`,
      '--oc-chat-notify-leave-ms': `${OC_CHAT_NOTIFY_LEAVE_MS}ms`,
      '--oc-chat-notify-accent': hex,
    } as CSSProperties;
  }, [payload?.personalColor]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!payload) {
      shownIdRef.current = null;
      setVisible(false);
      setLeaving(false);
      doneOnceRef.current = false;
      return;
    }
    const id = payload.id;
    const isNew = shownIdRef.current !== id;
    if (isNew) {
      shownIdRef.current = id;
      doneOnceRef.current = false;
      setLeaving(false);
      setVisible(true);
      setAnimKey((k) => k + 1);
      playNotifySfx(payload.sfxUrl);
    }

    /*
     * startLeave 등 deps 변경으로 effect가 다시 돌아도 타이머를 다시 건다.
     * (예전: 같은 id면 early return → cleanup이 타이머만 지워 토스트가 안 사라짐)
     */
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(doneTimer.current);
    if (!doneOnceRef.current) {
      leaveTimer.current = window.setTimeout(() => {
        startLeave(id);
      }, OC_CHAT_NOTIFY_MS);
    }

    return () => {
      window.clearTimeout(leaveTimer.current);
      window.clearTimeout(doneTimer.current);
    };
  }, [payload, startLeave]);

  if (!mounted || !payload || !visible) return null;

  const ui = (
    <button
      type="button"
      key={animKey}
      className={`oc-chat-notify${leaving ? ' is-leaving' : ' is-enter'}`}
      style={pointStyle}
      aria-live="polite"
      aria-label={`${payload.title}. ${payload.text}`}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!leaving) return;
        if (!String(e.animationName || '').includes('oc-chat-notify-out')) return;
        finish(payload.id);
      }}
      onClick={() => {
        onOpen?.(payload);
        window.clearTimeout(leaveTimer.current);
        startLeave(payload.id);
      }}
    >
      <div className="oc-chat-notify__row">
        <img className="oc-chat-notify__avatar" src={payload.avatarUrl} alt="" />
        <div className="oc-chat-notify__text">
          <div className="oc-chat-notify__name">{payload.name}</div>
          <div className="oc-chat-notify__sub">{payload.text}</div>
        </div>
        <span className="oc-chat-notify__badge">NEW</span>
      </div>
      <div className="oc-chat-notify__track" aria-hidden="true">
        <div className="oc-chat-notify__bar" />
      </div>
    </button>
  );

  return createPortal(ui, document.body);
}
