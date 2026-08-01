'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatChatRelativeTime,
  type OcChatInboxItem,
} from '@/lib/oc/ocChat';
import { resolveChatAvatarUrl } from '@/lib/oc/ocChatPrompt';
import type { OcCharacter } from '@/lib/types/character';

export type OcChatInboxRow = OcChatInboxItem & {
  character: OcCharacter;
};

type Props = {
  items: OcChatInboxItem[];
  characters: OcCharacter[];
  onSelect: (character: OcCharacter) => void;
};

export function OcChatInboxList({
  items,
  characters,
  onSelect,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 45_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const byId = new Map(characters.map((c) => [String(c.id), c]));
    const out: OcChatInboxRow[] = [];
    for (const item of items) {
      const character = byId.get(String(item.characterId));
      if (!character?.chatbot?.enabled) continue;
      out.push({ ...item, character });
    }
    return out;
  }, [characters, items]);

  if (!rows.length) {
    return (
      <div className="oc-chat-inbox__empty" role="status">
        대화가 아직 없어요
      </div>
    );
  }

  return (
    <div className="oc-chat-inbox lh-scroll" role="list">
      {rows.map((row) => {
        const avatar = resolveChatAvatarUrl(row.character);
        const initial = (row.character.name || '?').trim().slice(0, 1) || '?';
        return (
          <button
            key={row.characterId}
            type="button"
            role="listitem"
            className="oc-chat-inbox__row"
            onClick={() => onSelect(row.character)}
          >
            <div className="oc-chat-inbox__avatar" aria-hidden>
              {avatar ? (
                <img src={avatar} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="oc-chat-inbox__mid">
              <div className="oc-chat-inbox__name">{row.character.name || '채팅'}</div>
              <div className="oc-chat-inbox__preview">{row.preview || ' '}</div>
            </div>
            <div className="oc-chat-inbox__right">
              <div className="oc-chat-inbox__time">
                {formatChatRelativeTime(row.lastAt, now)}
              </div>
              {row.unread > 0 ? (
                <div className="oc-chat-inbox__badge" aria-label={`미읽음 ${row.unread}`}>
                  {row.unread > 99 ? '99+' : row.unread}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
