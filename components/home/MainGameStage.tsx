'use client';

import { useBgm } from '@/lib/contexts/BgmContext';
import { formatBgmTime } from '@/lib/bgm/formatTime';
import { MainVinylDeck } from '@/components/home/MainVinylDeck';

/** 메인 화면 — 게임 UI 스테이지 */
export function MainGameStage() {
  const { playing, title, artist, currentTime, duration } = useBgm();
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="main-game-stage">
      <div className="main-game-stage__torch" aria-hidden="true" />
      <div className="main-game-stage__vignette" aria-hidden="true" />

      <div className="main-game-stage__corner main-game-stage__corner--tl" aria-hidden="true" />
      <div className="main-game-stage__corner main-game-stage__corner--tr" aria-hidden="true" />
      <div className="main-game-stage__corner main-game-stage__corner--bl" aria-hidden="true" />
      <div className="main-game-stage__corner main-game-stage__corner--br" aria-hidden="true" />

      <div className="main-game-stage__vinyl-zone">
        <MainVinylDeck />
        <div className={`main-game-stage__cue${playing ? ' is-live' : ''}`}>
          <div className="main-game-stage__status">
            <span className="main-game-stage__status-dot" aria-hidden="true" />
            <span className="main-game-stage__status-label">{playing ? 'Now Playing' : 'Standby'}</span>
          </div>
          <div className="main-game-stage__track-title">{title || 'BGM'}</div>
          {artist ? <div className="main-game-stage__track-artist">{artist}</div> : null}
          <div className="main-game-stage__progress" aria-hidden="true">
            <span
              className="main-game-stage__progress-fill"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <div className="main-game-stage__times" aria-hidden="true">
            <span>{formatBgmTime(currentTime)}</span>
            <span>{formatBgmTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
