'use client';

import { useState } from 'react';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import type { TrpgPlayerProfile, TrpgSessionLog } from '@/lib/types/site-content';
import type { User } from 'firebase/auth';

type Props = {
  logs: TrpgSessionLog[];
  players: TrpgPlayerProfile[];
  activeLogId: string | null;
  onSelect: (id: string) => void;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

function LogFilmCard({
  log,
  activeLogId,
  onSelect,
  players,
}: {
  log: TrpgSessionLog;
  activeLogId: string | null;
  onSelect: (id: string) => void;
  players: TrpgPlayerProfile[];
}) {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const hidden = log.thumbnailSpoiler && log.thumbnail && !revealed.has(log.id);

  return (
    <article
      className={`trpg-log-film${activeLogId === log.id ? ' is-active' : ''}`}
      onClick={() => onSelect(log.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(log.id)}
      role="button"
      tabIndex={0}
    >
      <div className="trpg-log-film__thumb">
        {log.thumbnail ? (
          hidden ? (
            <button
              type="button"
              className="trpg-log-film__spoiler"
              onClick={(e) => {
                e.stopPropagation();
                setRevealed((prev) => new Set(prev).add(log.id));
              }}
            >
              ! SPOILER
              <span>클릭 시 이미지가 보입니다</span>
            </button>
          ) : (
            <img src={log.thumbnail} alt="" />
          )
        ) : (
          <div className="trpg-log-film__thumb-empty">{log.title[0]}</div>
        )}
        {log.playerIds?.length ? (
          <div className="trpg-log-film__avatars">
            {log.playerIds.slice(0, 6).map((pid) => {
              const p = playerMap.get(pid);
              if (!p) return null;
              return p.img ? (
                <img key={pid} src={p.img} alt={p.name} title={p.name} />
              ) : (
                <span key={pid} title={p.name}>
                  {p.name[0]}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="trpg-log-film__body">
        {log.subtitle ? <span className="trpg-log-film__sub">{log.subtitle}</span> : null}
        <h3>
          {log.title}
          {log.secret ? <SecretLockBadge compact /> : null}
        </h3>
        {log.summary ? <p className="trpg-log-film__summary">{log.summary}</p> : null}
        <dl className="trpg-log-film__meta">
          {log.date ? (
            <>
              <dt>개봉일</dt>
              <dd>{log.date}</dd>
            </>
          ) : null}
        </dl>
        {log.tags?.length ? (
          <div className="trpg-log-film__tags">
            {log.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function TrpgLogFilmBoard({
  logs,
  players,
  activeLogId,
  onSelect,
  user,
  isAdmin,
  onOpenAuth,
}: Props) {
  if (!logs.length) return null;

  return (
    <div className="trpg-log-film-board">
      {logs.map((log) => (
        <SecretItemGate
          key={log.id}
          scope="trpg"
          item={log}
          isAdmin={isAdmin}
          loggedIn={!!user}
          onRequestLogin={onOpenAuth}
          lockedLabel={log.title}
        >
          <LogFilmCard log={log} activeLogId={activeLogId} onSelect={onSelect} players={players} />
        </SecretItemGate>
      ))}
    </div>
  );
}
