'use client';

import { useEffect, useState } from 'react';
import { useBgm } from '@/lib/contexts/BgmContext';
import { formatBgmTime } from '@/lib/bgm/formatTime';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { MainStageFocal } from '@/components/home/MainStageFocal';
import { MainVinylDeck } from '@/components/home/MainVinylDeck';

/** 메인 화면 — 게임 UI 스테이지 */
export function MainGameStage() {
  const { main } = useSiteContent();
  const { playing, title, artist, currentTime, duration } = useBgm();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const live = mounted && playing;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const showLatin = main.latin?.trim();

  return (
    <div className="main-game-stage">
      <div className="main-game-stage__torch" aria-hidden="true" />
      <div className="main-game-stage__vignette" aria-hidden="true" />

      <div className="main-game-stage__corner main-game-stage__corner--tl" aria-hidden="true" />
      <div className="main-game-stage__corner main-game-stage__corner--tr" aria-hidden="true" />
      <div className="main-game-stage__corner main-game-stage__corner--bl" aria-hidden="true" />
      <div className="main-game-stage__corner main-game-stage__corner--br" aria-hidden="true" />

      <div className="main-game-stage__center">
        <MainStageFocal />
        {showLatin ? <p className="main-game-stage__latin">{main.latin}</p> : null}
      </div>

      <div className="main-game-stage__vinyl-zone">
        <MainVinylDeck />
        <div className={`main-game-stage__cue${live ? ' is-live' : ''}`}>
          <div className="main-game-stage__status">
            <span className="main-game-stage__status-dot" aria-hidden="true" />
            <span className="main-game-stage__status-label">{live ? 'Now Playing' : 'Standby'}</span>
          </div>
          <div className="main-game-stage__track-title">{mounted ? title || 'BGM' : 'BGM'}</div>
          {mounted && artist ? <div className="main-game-stage__track-artist">{artist}</div> : null}
          <div className="main-game-stage__progress" aria-hidden="true">
            <span
              className="main-game-stage__progress-fill"
              style={{ transform: `scaleX(${mounted ? progress / 100 : 0})` }}
            />
          </div>
          <div className="main-game-stage__times" aria-hidden="true">
            <span>{mounted ? formatBgmTime(currentTime) : '0:00'}</span>
            <span>{mounted ? formatBgmTime(duration) : '0:00'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
