'use client';

import type { CSSProperties } from 'react';
import type { TrpgPlayerProfile, TrpgSessionLog } from '@/lib/types/site-content';

type Block = {
  speaker: string;
  text: string;
  strike?: boolean;
};

function resolvePlayer(players: TrpgPlayerProfile[], speaker: string) {
  const key = speaker.trim().toLowerCase();
  return players.find((p) => {
    const names = [p.name, p.nameEn, p.role].filter(Boolean).map((n) => n!.trim().toLowerCase());
    return names.includes(key);
  });
}

function parseBlocks(body: string): Block[] {
  const chunks = body.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
  if (!chunks.length) return [];

  return chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const first = lines[0]?.trim() ?? '';
    const rest = lines.slice(1).join('\n').trim();
    const colon = first.match(/^(.+?)[:：]\s*(.*)$/);
    if (colon && !rest) {
      return { speaker: colon[1].trim(), text: colon[2].trim() || '' };
    }
    if (rest) {
      const strike = /~~(.+)~~/.test(first) || first.endsWith('—');
      return { speaker: first.replace(/~~/g, ''), text: rest, strike };
    }
    return { speaker: '', text: chunk };
  });
}

type Props = {
  log: TrpgSessionLog;
  players: TrpgPlayerProfile[];
  style?: CSSProperties;
};

export function TrpgLogSpeakerBody({ log, players, style }: Props) {
  if (log.html) {
    return (
      <div
        className="trpg-log__html trpg-log-speaker lh-scroll"
        style={style}
        dangerouslySetInnerHTML={{ __html: log.html }}
      />
    );
  }

  const blocks = parseBlocks(log.body || '');
  if (!blocks.length) {
    return (
      <div className="trpg-log__text lh-scroll" style={style}>
        {log.body || '—'}
      </div>
    );
  }

  return (
    <div className="trpg-log-speaker lh-scroll" style={style}>
      {blocks.map((block, i) => {
        const player = block.speaker ? resolvePlayer(players, block.speaker) : null;
        const label = block.speaker || '—';
        return (
          <div key={i} className="trpg-log-speaker__row">
            <div className="trpg-log-speaker__av" aria-hidden="true">
              {player?.img ? (
                <img src={player.img} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="trpg-log-speaker__av-ph">{player ? label[0] : '✒'}</span>
              )}
            </div>
            <div className="trpg-log-speaker__content">
              {block.speaker ? (
                <div className={`trpg-log-speaker__name${block.strike ? ' is-struck' : ''}`}>{label}</div>
              ) : null}
              <div className="trpg-log-speaker__text">{block.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
