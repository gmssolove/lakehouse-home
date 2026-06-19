'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  clampBgmPlayerPosition,
  isBgmPlayerOffscreen,
  parsePx,
} from '@/lib/bgm/clampPlayerPosition';
import {
  buildPagePlaylist,
  firstPageTrack,
  normalizeTrack,
  sameTrack,
  trackFromSrc,
  trackKey as bgmTrackKey,
} from '@/lib/bgm/playlist';
import type { BgmKind, BgmTrack } from '@/lib/bgm/types';
import { useSiteContent } from '@/lib/hooks/useSiteContent';

const STATE_KEY = 'lh_bgm_shared_state';
const UI_KEY = 'lh_bgm_ui_state';

export type { BgmKind, BgmTrack } from '@/lib/bgm/types';

type SavedState = {
  kind?: BgmKind;
  id?: string;
  title?: string;
  artist?: string;
  scope?: string;
  playing?: boolean;
  currentTime?: number;
};

type UiState = {
  collapsed?: boolean;
  volume?: number;
  posLeft?: string;
  posTop?: string;
  playerWidth?: number;
  playerHeight?: number;
};

export const BGM_PLAYER_SIZE = {
  minW: 220,
  maxW: 340,
  minH: 108,
  maxH: 200,
  defaultW: 280,
  defaultH: 118,
} as const;

type Snapshot = {
  track: BgmTrack;
  currentTime: number;
  playing: boolean;
};

type BgmContextValue = {
  playing: boolean;
  collapsed: boolean;
  volume: number;
  position: { left: string; top: string } | null;
  playerSize: { width: number; height: number };
  title: string;
  artist: string;
  currentTime: number;
  duration: number;
  activeTrackKey: string;
  toggle: () => void;
  setVolume: (v: number) => void;
  seek: (t: number) => void;
  setCollapsed: (c: boolean) => void;
  setPosition: (left: string, top: string) => void;
  setPlayerSize: (width: number, height: number) => void;
  setTrack: (
    src: {
      url?: string;
      youtubeId?: string;
      fileData?: string;
      title?: string;
      artist?: string;
      scope?: 'page' | 'character';
    },
    opts?: { autoplay?: boolean; currentTime?: number },
  ) => void;
  playNext: () => void;
  playPrevious: () => void;
  playlistActive: boolean;
  pushPageSnapshot: () => void;
  restorePageSnapshot: (autoplay?: boolean) => void;
  resumePageBgmIfNeeded: () => void;
  playCharacterTheme: (
    src: { fileData?: string; youtubeId?: string; title?: string; artist?: string },
    wasPlaying: boolean,
  ) => void;
};

const BgmContext = createContext<BgmContextValue | null>(null);

const DEFAULT_VOLUME = 40;

function readJson<T>(key: string): T {
  if (typeof window === 'undefined') return {} as T;
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as T;
  } catch {
    return {} as T;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useBgm() {
  const ctx = useContext(BgmContext);
  if (!ctx) throw new Error('useBgm must be used within BgmProvider');
  return ctx;
}

export function BgmProvider({ children }: { children: ReactNode }) {
  const { bgm: siteBgm } = useSiteContent();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const trackRef = useRef<BgmTrack | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const pageSnapshotRef = useRef<Snapshot | null>(null);
  const siteInitRef = useRef(false);
  const prevPlaylistLenRef = useRef(0);
  const pagePlaylistRef = useRef<BgmTrack[]>([]);
  const playlistIndexRef = useRef(0);
  const playNextRef = useRef<() => void>(() => {});
  const playPrevRef = useRef<() => void>(() => {});
  const advanceLockRef = useRef(false);
  const switchingTrackRef = useRef(false);
  const userPausedRef = useRef(false);
  const playingRef = useRef(false);
  const toggleBusyRef = useRef(false);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const audioLoadGenRef = useRef(0);
  const ytGenRef = useRef(0);
  const ytPendingPlayRef = useRef(false);
  const switchSerialRef = useRef(0);
  const pendingAutoplayRef = useRef(false);
  const playInternalRef = useRef<(seek?: number) => void>(() => {});

  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [position, setPositionState] = useState<{ left: string; top: string } | null>(null);
  const [playerSize, setPlayerSizeState] = useState<{ width: number; height: number }>({
    width: BGM_PLAYER_SIZE.defaultW,
    height: BGM_PLAYER_SIZE.defaultH,
  });
  const [title, setTitle] = useState('BGM');
  const [artist, setArtist] = useState('');
  const [activeTrackKey, setActiveTrackKey] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playlistActive, setPlaylistActive] = useState(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const destroyYtPlayer = useCallback(() => {
    if (!ytRef.current) return;
    switchingTrackRef.current = true;
    ytGenRef.current += 1;
    ytPendingPlayRef.current = false;
    try {
      ytRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    ytRef.current = null;
    const box = document.getElementById('yt-container');
    if (box) box.innerHTML = '';
    window.setTimeout(() => {
      switchingTrackRef.current = false;
    }, 200);
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audioLoadGenRef.current += 1;
  }, []);

  const stopAllMedia = useCallback(async () => {
    stopAudio();

    if (!ytRef.current) {
      switchingTrackRef.current = false;
      return;
    }

    await new Promise<void>((resolve) => {
      switchingTrackRef.current = true;
      ytGenRef.current += 1;
      ytPendingPlayRef.current = false;
      try {
        ytRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      ytRef.current = null;
      const box = document.getElementById('yt-container');
      if (box) box.innerHTML = '';
      window.setTimeout(() => {
        switchingTrackRef.current = false;
        resolve();
      }, 160);
    });
  }, [stopAudio]);

  const syncDurationFromAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) setDuration(d);
  }, []);

  const scheduleAutoplayRetries = useCallback(() => {
    const retry = () => {
      if (userPausedRef.current || playingRef.current) return;
      const track = trackRef.current;
      if (!track?.id || track.scope !== 'page') return;
      playInternalRef.current(0);
    };
    for (const ms of [150, 500, 1500]) {
      window.setTimeout(retry, ms);
    }
  }, []);

  const applyVolume = useCallback((v = volumeRef.current) => {
    if (audioRef.current) audioRef.current.volume = v / 100;
    try {
      ytRef.current?.setVolume?.(v);
    } catch {
      /* ignore */
    }
  }, []);

  /** ENDED 직후·loadVideoById 직후 동기 playVideo()는 실패하므로 지연 재시도 */
  const deferYoutubePlay = useCallback(() => {
    if (userPausedRef.current) {
      ytPendingPlayRef.current = false;
      return;
    }
    ytPendingPlayRef.current = true;
    for (const delay of [0, 120, 400]) {
      window.setTimeout(() => {
        if (!ytPendingPlayRef.current || userPausedRef.current) return;
        try {
          ytRef.current?.playVideo?.();
        } catch {
          /* ignore */
        }
      }, delay);
    }
  }, []);

  const loadYoutubeVideo = useCallback(
    (videoId: string, startSecs: number, wantPlay: boolean) => {
      const player = ytRef.current;
      if (!player?.loadVideoById) return false;
      switchingTrackRef.current = true;
      ytPendingPlayRef.current = wantPlay && !userPausedRef.current;
      window.setTimeout(() => {
        if (ytPendingPlayRef.current) switchingTrackRef.current = false;
      }, 4500);
      try {
        try {
          player.pauseVideo?.();
        } catch {
          /* ignore */
        }
        playingRef.current = false;
        setPlaying(false);
        player.loadVideoById(videoId, Math.floor(startSecs));
        applyVolume();
        if (wantPlay && !userPausedRef.current) {
          deferYoutubePlay();
        } else {
          ytPendingPlayRef.current = false;
          player.pauseVideo?.();
          playingRef.current = false;
          setPlaying(false);
          switchingTrackRef.current = false;
        }
        return true;
      } catch {
        ytPendingPlayRef.current = false;
        switchingTrackRef.current = false;
        return false;
      }
    },
    [applyVolume, deferYoutubePlay],
  );

  const handleYtStateChange = useCallback((state: number) => {
    if ((state === 5 || state === -1 || state === 3) && ytPendingPlayRef.current && !userPausedRef.current) {
      try {
        ytRef.current?.playVideo?.();
      } catch {
        /* wait for next state */
      }
      return;
    }
    if (state === 1) {
      ytPendingPlayRef.current = false;
      switchingTrackRef.current = false;
      if (userPausedRef.current) {
        try {
          ytRef.current?.pauseVideo?.();
        } catch {
          /* ignore */
        }
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      playingRef.current = true;
      setPlaying(true);
      return;
    }
    if (state === 2) {
      if (switchingTrackRef.current || ytPendingPlayRef.current) return;
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    if (state === 0) {
      if (switchingTrackRef.current) return;
      if (userPausedRef.current) return;
      const track = trackRef.current;
      if (track?.scope !== 'page') return;

      const pl = pagePlaylistRef.current;
      if (pl.length <= 1) {
        if (track.kind === 'youtube' && !userPausedRef.current) {
          try {
            ytRef.current?.seekTo(0, true);
            deferYoutubePlay();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      playingRef.current = false;
      setPlaying(false);
      window.setTimeout(() => playNextRef.current(), 80);
    }
  }, [deferYoutubePlay]);

  const syncPlaylistLoop = useCallback((track: BgmTrack | null = trackRef.current) => {
    const pl = pagePlaylistRef.current;
    const active = pl.length > 1;
    setPlaylistActive(active);
    const audio = audioRef.current;
    if (audio && track && track.kind !== 'youtube') {
      audio.loop = track.scope === 'character' ? true : !active;
    }
    return active;
  }, []);

  const commitTrackUi = useCallback(
    (next: BgmTrack, resetTime = true) => {
      trackRef.current = next;
      setTitle(next.title);
      setArtist(next.artist);
      setActiveTrackKey(bgmTrackKey(next));
      if (resetTime) {
        setCurrentTime(0);
        setDuration(0);
      }
      syncPlaylistLoop(next);
      if (next.scope === 'page') {
        const idx = pagePlaylistRef.current.findIndex((t) => sameTrack(t, next));
        if (idx >= 0) playlistIndexRef.current = idx;
      }
    },
    [syncPlaylistLoop],
  );

  const maybeAdvanceNearEnd = useCallback(() => {
    if (advanceLockRef.current || switchingTrackRef.current || userPausedRef.current) return;
    const track = trackRef.current;
    if (track?.scope !== 'page') return;
    const pl = pagePlaylistRef.current;
    if (pl.length <= 1) return;
    if (!playingRef.current) return;

    let t = 0;
    let d = 0;
    try {
      if (track.kind === 'youtube' && ytRef.current) {
        t = ytRef.current.getCurrentTime?.() || 0;
        d = ytRef.current.getDuration?.() || 0;
      } else if (audioRef.current) {
        t = audioRef.current.currentTime;
        d = audioRef.current.duration;
        if (!Number.isFinite(d)) d = 0;
      }
    } catch {
      return;
    }
    if (d > 1 && t >= d - 0.45) {
      playNextRef.current();
    }
  }, []);

  const persistUi = useCallback((extra: UiState) => {
    writeJson(UI_KEY, { ...readJson<UiState>(UI_KEY), ...extra });
  }, []);

  const persistState = useCallback(
    (extra: SavedState) => {
      const t = trackRef.current;
      writeJson(STATE_KEY, {
        kind: t?.kind,
        id: t?.id,
        title: t?.title,
        artist: t?.artist,
        scope: t?.scope,
        playing,
        currentTime: audioRef.current?.currentTime ?? currentTime,
        ...extra,
      });
    },
    [playing, currentTime],
  );

  const getTime = useCallback(() => {
    try {
      if (trackRef.current?.kind === 'youtube' && ytRef.current?.getCurrentTime) {
        return ytRef.current.getCurrentTime() || 0;
      }
      return audioRef.current?.currentTime || 0;
    } catch {
      return 0;
    }
  }, []);

  const pauseInternal = useCallback(
    (markPaused = true) => {
      if (markPaused) userPausedRef.current = true;
      playingRef.current = false;
      audioRef.current?.pause();
      try {
        ytRef.current?.pauseVideo?.();
      } catch {
        /* ignore */
      }
      setPlaying(false);
      if (markPaused) persistState({ playing: false, currentTime: getTime() });
    },
    [getTime, persistState],
  );

  const playInternal = useCallback(
    (seek?: number) => {
      const track = trackRef.current;
      if (!track?.id) return;

      const pageMulti =
        track.scope === 'page' && pagePlaylistRef.current.length > 1;

      if (track.kind === 'youtube') {
        const ensureYt = () => {
          const box = document.getElementById('yt-container');
          if (!box) return;

          if (ytRef.current) {
            try {
              const currentId = ytRef.current.getVideoData?.()?.video_id;
              if (!currentId || currentId !== track.id) {
                if (loadYoutubeVideo(track.id, seek || 0, !userPausedRef.current)) return;
              }
              if (typeof seek === 'number' && seek > 0) ytRef.current.seekTo(seek, true);
              if (userPausedRef.current) {
                ytRef.current.pauseVideo();
                playingRef.current = false;
                setPlaying(false);
              } else {
                ytPendingPlayRef.current = false;
                ytRef.current.playVideo();
                playingRef.current = true;
                setPlaying(true);
              }
            } catch {
              ytRef.current = null;
              ytGenRef.current += 1;
              box.innerHTML = '';
            }
            if (ytRef.current) return;
          }

          if (box.querySelector('iframe, #yt-iframe')) box.innerHTML = '';
          box.innerHTML = '<div id="yt-iframe"></div>';
          const ytGen = ++ytGenRef.current;
          ytRef.current = new window.YT!.Player('yt-iframe', {
            height: '1',
            width: '1',
            videoId: track.id,
            playerVars: {
              autoplay: userPausedRef.current ? 0 : 1,
              loop: pageMulti ? 0 : 1,
              playlist: pageMulti ? undefined : track.id,
              start: Math.floor(seek || 0),
              playsinline: 1,
            },
            events: {
              onReady: (e: { target: YTPlayer }) => {
                e.target.setVolume(volumeRef.current);
                if (seek) e.target.seekTo(seek, true);
                if (userPausedRef.current) {
                  e.target.pauseVideo();
                  playingRef.current = false;
                  setPlaying(false);
                } else {
                  ytPendingPlayRef.current = false;
                  e.target.playVideo();
                }
              },
              onStateChange: (e: { data: number }) => {
                if (ytGen !== ytGenRef.current) return;
                handleYtStateChange(e.data);
              },
            },
          });
        };

        if (window.YT?.Player) ensureYt();
        else {
          const prev = window.onYouTubeIframeAPIReady;
          window.onYouTubeIframeAPIReady = () => {
            prev?.();
            ensureYt();
          };
          if (!document.getElementById('yt-api')) {
            const sc = document.createElement('script');
            sc.id = 'yt-api';
            sc.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(sc);
          }
        }
        return;
      }

      if (!audioRef.current) return;
      applyVolume();
      const audio = audioRef.current;
      if (typeof seek === 'number' && seek > 0) {
        try {
          audio.currentTime = seek;
        } catch {
          /* ignore */
        }
      }

      const markPlaying = () => {
        if (userPausedRef.current) {
          audio.pause();
          playingRef.current = false;
          setPlaying(false);
          return;
        }
        playingRef.current = true;
        setPlaying(true);
        pendingAutoplayRef.current = false;
        syncDurationFromAudio();
        persistState({ playing: true, currentTime: getTime() });
      };

      const tryPlay = (allowMuted: boolean): Promise<void> => {
        audio.muted = allowMuted;
        return audio
          .play()
          .then(() => {
            if (allowMuted) {
              audio.muted = false;
              applyVolume();
            }
            markPlaying();
          })
          .catch(() => {
            if (!allowMuted) return tryPlay(true);
            playingRef.current = false;
            setPlaying(false);
            if (!userPausedRef.current) {
              pendingAutoplayRef.current = true;
              scheduleAutoplayRetries();
            }
          });
      };

      void tryPlay(false);
    },
    [applyVolume, deferYoutubePlay, getTime, handleYtStateChange, loadYoutubeVideo, persistState, scheduleAutoplayRetries, syncDurationFromAudio],
  );

  playInternalRef.current = playInternal;

  const applyTrack = useCallback(
    (next: BgmTrack | null, opts?: { autoplay?: boolean; currentTime?: number; force?: boolean }) => {
      if (!next?.id) return;

      next = normalizeTrack(next);
      const serial = ++switchSerialRef.current;
      const prev = trackRef.current;
      const changed = !!opts?.force || !sameTrack(prev, next);
      const wantPlay = opts?.autoplay !== false && !userPausedRef.current;
      const seek = opts?.currentTime ?? 0;

      commitTrackUi(next, changed);
      advanceLockRef.current = false;

      if (!changed) {
        if (wantPlay && !playingRef.current) playInternal(seek);
        return;
      }

      const persist = (playingNow: boolean) => {
        persistState({
          kind: next.kind,
          id: next.id,
          title: next.title,
          artist: next.artist,
          scope: next.scope,
          currentTime: seek,
          playing: playingNow,
        });
      };

      // YouTube → YouTube: 클릭 제스처 유지를 위해 async 없이 동기 전환
      if (next.kind === 'youtube' && ytRef.current?.loadVideoById) {
        stopAudio();
        switchingTrackRef.current = true;
        ytPendingPlayRef.current = wantPlay && !userPausedRef.current;
        try {
          ytRef.current.pauseVideo?.();
        } catch {
          /* ignore */
        }
        try {
          ytRef.current.loadVideoById(next.id, Math.floor(seek));
          applyVolume();
          if (wantPlay && !userPausedRef.current) {
            try {
              ytRef.current.playVideo();
              playingRef.current = true;
              setPlaying(true);
              ytPendingPlayRef.current = false;
              switchingTrackRef.current = false;
            } catch {
              deferYoutubePlay();
            }
          } else {
            ytPendingPlayRef.current = false;
            switchingTrackRef.current = false;
            playingRef.current = false;
            setPlaying(false);
          }
          persist(wantPlay && !userPausedRef.current);
          return;
        } catch {
          ytPendingPlayRef.current = false;
          switchingTrackRef.current = false;
        }
      }

      const loadAndPlayAudio = (serial: number, pageMulti: boolean) => {
        const audio = audioRef.current;
        if (!audio) return;

        const loadGen = ++audioLoadGenRef.current;
        audio.src = next.id;
        applyVolume();
        audio.loop = next.scope === 'character' ? true : !pageMulti;
        audio.load();

        const start = () => {
          if (serial !== switchSerialRef.current) return;
          if (audioLoadGenRef.current !== loadGen) return;
          syncDurationFromAudio();
          if (seek > 0) {
            try {
              audio.currentTime = seek;
            } catch {
              /* ignore */
            }
          }
          playInternal(seek);
        };

        audio.addEventListener('loadedmetadata', syncDurationFromAudio, { once: true });

        if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          start();
        } else {
          audio.addEventListener('canplay', start, { once: true });
          audio.addEventListener('loadeddata', start, { once: true });
          audio.addEventListener(
            'error',
            () => {
              if (serial !== switchSerialRef.current) return;
              playingRef.current = false;
              setPlaying(false);
            },
            { once: true },
          );
        }
      };

      // MP3/URL 전환 — YouTube 160ms 대기 없이 즉시 (자동 넘김·⏭)
      if (next.kind !== 'youtube' && prev?.kind !== 'youtube') {
        persist(wantPlay);
        if (!wantPlay) {
          playingRef.current = false;
          setPlaying(false);
          return;
        }
        if (prev) stopAudio();
        const pageMulti = next.scope === 'page' && pagePlaylistRef.current.length > 1;
        loadAndPlayAudio(serial, pageMulti);
        if (wantPlay) scheduleAutoplayRetries();
        return;
      }

      const runSwitch = async () => {
        const pageMulti = next.scope === 'page' && pagePlaylistRef.current.length > 1;

        if (prev?.kind === 'youtube' || next.kind !== 'youtube') {
          await stopAllMedia();
        } else {
          stopAudio();
        }
        if (serial !== switchSerialRef.current) return;

        persist(wantPlay);
        if (!wantPlay) {
          playingRef.current = false;
          setPlaying(false);
          return;
        }

        if (next.kind === 'youtube') {
          playInternal(seek);
          if (wantPlay) scheduleAutoplayRetries();
          return;
        }

        loadAndPlayAudio(serial, pageMulti);
        if (wantPlay) scheduleAutoplayRetries();
      };

      void runSwitch();
    },
    [
      applyVolume,
      commitTrackUi,
      deferYoutubePlay,
      persistState,
      playInternal,
      scheduleAutoplayRetries,
      stopAllMedia,
      stopAudio,
      syncDurationFromAudio,
    ],
  );

  const jumpPlaylist = useCallback(
    (delta: 1 | -1) => {
      const pl = pagePlaylistRef.current;
      if (pl.length <= 1) return;

      if (trackRef.current?.scope === 'character') {
        const nextIdx = delta === 1 ? 0 : pl.length - 1;
        playlistIndexRef.current = nextIdx;
        applyTrack(pl[nextIdx], { autoplay: true, currentTime: 0, force: true });
        return;
      }

      let currentIdx = playlistIndexRef.current;
      const track = trackRef.current;
      if (track?.scope === 'page') {
        const found = pl.findIndex((t) => sameTrack(t, track));
        if (found >= 0) currentIdx = found;
      }

      const nextIdx = (currentIdx + delta + pl.length) % pl.length;
      playlistIndexRef.current = nextIdx;
      userPausedRef.current = false;
      advanceLockRef.current = false;
      try {
        ytRef.current?.pauseVideo?.();
      } catch {
        /* ignore */
      }
      playingRef.current = false;
      setPlaying(false);
      applyTrack(pl[nextIdx], { autoplay: true, currentTime: 0, force: true });
    },
    [applyTrack],
  );

  const tryAdvancePlaylist = useCallback(() => {
    if (advanceLockRef.current || switchingTrackRef.current) return;
    const pl = pagePlaylistRef.current;
    if (pl.length <= 1) return;
    if (trackRef.current?.scope !== 'page') return;
    advanceLockRef.current = true;
    window.setTimeout(() => {
      advanceLockRef.current = false;
    }, 800);
    jumpPlaylist(1);
  }, [jumpPlaylist]);

  const playNextInPlaylist = useCallback(() => {
    if (switchingTrackRef.current) return;
    jumpPlaylist(1);
  }, [jumpPlaylist]);

  const playPrevInPlaylist = useCallback(() => {
    if (switchingTrackRef.current) return;
    jumpPlaylist(-1);
  }, [jumpPlaylist]);

  playNextRef.current = tryAdvancePlaylist;
  playPrevRef.current = playPrevInPlaylist;

  const setTrack = useCallback(
    (
      src: {
        url?: string;
        youtubeId?: string;
        fileData?: string;
        title?: string;
        artist?: string;
        scope?: 'page' | 'character';
      },
      opts?: { autoplay?: boolean; currentTime?: number },
    ) => {
      const next = trackFromSrc(src);
      if (next) applyTrack(next, opts);
    },
    [applyTrack],
  );

  const toggle = useCallback(() => {
    if (toggleBusyRef.current) return;
    toggleBusyRef.current = true;
    window.setTimeout(() => {
      toggleBusyRef.current = false;
    }, 400);

    if (!trackRef.current?.id) {
      const first = firstPageTrack(siteBgm);
      if (first) {
        userPausedRef.current = false;
        applyTrack(first, { autoplay: true });
      }
      return;
    }
    if (playingRef.current) {
      pauseInternal(true);
    } else {
      userPausedRef.current = false;
      playInternal(getTime());
    }
  }, [applyTrack, getTime, pauseInternal, playInternal, siteBgm]);

  const setVolume = useCallback(
    (v: number) => {
      volumeRef.current = v;
      setVolumeState(v);
      applyVolume(v);
      persistUi({ volume: v });
    },
    [applyVolume, persistUi],
  );

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, t);
      if (trackRef.current?.kind === 'youtube') {
        try {
          ytRef.current?.seekTo?.(clamped, true);
        } catch {
          /* ignore */
        }
      } else if (audioRef.current) {
        try {
          const d = audioRef.current.duration;
          audioRef.current.currentTime =
            Number.isFinite(d) && d > 0 ? Math.min(clamped, d) : clamped;
          syncDurationFromAudio();
        } catch {
          /* ignore */
        }
      }
      setCurrentTime(clamped);
      persistState({ currentTime: clamped });
    },
    [persistState, syncDurationFromAudio],
  );

  const setCollapsed = useCallback(
    (c: boolean) => {
      setCollapsedState(c);
      persistUi({ collapsed: c });
    },
    [persistUi],
  );

  const setPosition = useCallback(
    (left: string, top: string) => {
      setPositionState(left && top ? { left, top } : null);
      persistUi({ posLeft: left || undefined, posTop: top || undefined });
    },
    [persistUi],
  );

  const setPlayerSize = useCallback(
    (width: number, height: number) => {
      const w = Math.round(Math.max(BGM_PLAYER_SIZE.minW, Math.min(BGM_PLAYER_SIZE.maxW, width)));
      const h = Math.round(Math.max(BGM_PLAYER_SIZE.minH, Math.min(BGM_PLAYER_SIZE.maxH, height)));
      setPlayerSizeState({ width: w, height: h });
      persistUi({ playerWidth: w, playerHeight: h });
    },
    [persistUi],
  );

  const pushPageSnapshot = useCallback(() => {
    const t = trackRef.current;
    if (!t || t.scope === 'character') return;
    const snap: Snapshot = {
      track: { ...t },
      currentTime: getTime(),
      playing,
    };
    snapshotRef.current = snap;
    pageSnapshotRef.current = snap;
  }, [getTime, playing]);

  const restorePageSnapshot = useCallback(
    (autoplay?: boolean) => {
      const shouldPlay = autoplay ?? true;
      const snap = snapshotRef.current ?? pageSnapshotRef.current;

      if (trackRef.current?.scope === 'character') {
        pauseInternal(false);
        if (trackRef.current.kind === 'youtube') {
          destroyYtPlayer();
        } else {
          stopAudio();
        }
      }

      if (snap && snap.track.scope !== 'character') {
        if (
          sameTrack(trackRef.current, snap.track) &&
          trackRef.current?.scope === 'page' &&
          playing
        ) {
          snapshotRef.current = null;
          pageSnapshotRef.current = null;
          return;
        }
        applyTrack(snap.track, {
          autoplay: shouldPlay && snap.playing,
          currentTime: snap.currentTime,
          force: true,
        });
        snapshotRef.current = null;
        pageSnapshotRef.current = null;
        return;
      }

      snapshotRef.current = null;
      pageSnapshotRef.current = null;
      const first = firstPageTrack(siteBgm);
      if (!first) {
        pauseInternal(false);
        trackRef.current = null;
        setTitle(siteBgm.title || 'BGM');
        setArtist(siteBgm.artist || '');
        persistState({ scope: 'page', playing: false });
        return;
      }

      applyTrack(first, { autoplay: shouldPlay, currentTime: 0, force: true });
    },
    [applyTrack, destroyYtPlayer, pauseInternal, persistState, playing, siteBgm, stopAudio],
  );

  const resumePageBgmIfNeeded = useCallback(() => {
    if (trackRef.current?.scope !== 'character') return;
    restorePageSnapshot(playing);
  }, [playing, restorePageSnapshot]);

  const playCharacterTheme = useCallback(
    (
      src: { fileData?: string; youtubeId?: string; title?: string; artist?: string },
      _wasPlaying: boolean,
    ) => {
      const id = src.fileData || src.youtubeId;
      if (!id) return;

      const next = trackFromSrc({
        fileData: src.fileData,
        youtubeId: src.youtubeId,
        title: src.title || 'Theme',
        artist: src.artist || '',
        scope: 'character',
      });
      if (!next) return;

      if (sameTrack(trackRef.current, next)) {
        if (!userPausedRef.current && !playingRef.current) {
          applyTrack(next, { autoplay: true, currentTime: getTime() });
        }
        return;
      }

      if (trackRef.current?.scope !== 'character') {
        pushPageSnapshot();
      } else if (!pageSnapshotRef.current && !snapshotRef.current) {
        const first = firstPageTrack(siteBgm);
        if (first) {
          const fallback: Snapshot = {
            track: { ...first },
            currentTime: 0,
            playing: playingRef.current,
          };
          snapshotRef.current = fallback;
          pageSnapshotRef.current = fallback;
        }
      }

      userPausedRef.current = false;
      applyTrack(next, { autoplay: true, currentTime: 0, force: true });
    },
    [applyTrack, getTime, pushPageSnapshot, siteBgm],
  );

  const applyTrackRef = useRef(applyTrack);
  const setTrackRef = useRef(setTrack);
  const applyVolumeRef = useRef(applyVolume);
  applyTrackRef.current = applyTrack;
  setTrackRef.current = setTrack;
  applyVolumeRef.current = applyVolume;

  useEffect(() => {
    const ui = readJson<UiState>(UI_KEY);
    if (ui.collapsed) setCollapsedState(true);
    if (ui.volume != null) {
      volumeRef.current = ui.volume;
      setVolumeState(ui.volume);
      applyVolume(ui.volume);
    }
    if (ui.posLeft && ui.posTop) {
      const left = parsePx(ui.posLeft);
      const top = parsePx(ui.posTop);
      const w = ui.collapsed ? 52 : ui.playerWidth || BGM_PLAYER_SIZE.defaultW;
      const h = ui.collapsed ? 52 : ui.playerHeight || BGM_PLAYER_SIZE.defaultH;
      if (left != null && top != null && !isBgmPlayerOffscreen(left, top, w, h)) {
        const next = clampBgmPlayerPosition(left, top, w, h);
        setPositionState({ left: `${next.left}px`, top: `${next.top}px` });
      } else {
        persistUi({ posLeft: undefined, posTop: undefined });
      }
    }
    if (ui.playerWidth && ui.playerHeight) {
      setPlayerSizeState({
        width: Math.max(BGM_PLAYER_SIZE.minW, Math.min(BGM_PLAYER_SIZE.maxW, ui.playerWidth)),
        height: Math.max(BGM_PLAYER_SIZE.minH, Math.min(BGM_PLAYER_SIZE.maxH, ui.playerHeight)),
      });
    }
  }, []);

  useEffect(() => {
    applyVolume();
  }, [volume, applyVolume]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) applyVolume();
    };
    const onFocus = () => applyVolume();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [applyVolume]);

  useEffect(() => {
    const pl = buildPagePlaylist(siteBgm);
    const prevLen = prevPlaylistLenRef.current;
    pagePlaylistRef.current = pl;
    prevPlaylistLenRef.current = pl.length;
    syncPlaylistLoop(trackRef.current);

    const hasBgm = pl.length > 0;
    const track = trackRef.current;

    if (!siteInitRef.current) {
      if (!hasBgm || !pl[0]?.id) return;

      siteInitRef.current = true;
      userPausedRef.current = false;
      playlistIndexRef.current = 0;
      applyTrackRef.current(pl[0], { autoplay: true, currentTime: 0, force: true });
      scheduleAutoplayRetries();
      return;
    }

    if (!track?.id && hasBgm) {
      applyTrackRef.current(pl[0], { autoplay: !userPausedRef.current, currentTime: 0, force: true });
      return;
    }

    if (track?.scope === 'page' && hasBgm) {
      const idx = pl.findIndex((t) => sameTrack(t, track));
      if (idx >= 0) playlistIndexRef.current = idx;

      // 1곡→다곡 플레이리스트로 갱신되면 loop:1 플레이어를 다시 만들어 ENDED/다음곡이 동작하게
      if (prevLen <= 1 && pl.length > 1 && track.kind === 'youtube') {
        applyTrackRef.current(pl[playlistIndexRef.current] ?? pl[0], {
          autoplay: playingRef.current && !userPausedRef.current,
          currentTime: 0,
          force: true,
        });
      }
    }
  }, [siteBgm, syncPlaylistLoop, scheduleAutoplayRetries]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      syncDurationFromAudio();
      setCurrentTime(audio.currentTime);
      const pl = pagePlaylistRef.current;
      const track = trackRef.current;
      const d = audio.duration;
      if (
        track?.scope === 'page' &&
        pl.length > 1 &&
        Number.isFinite(d) &&
        d > 1 &&
        audio.currentTime >= d - 0.35
      ) {
        playNextRef.current();
      }
    };
    const onMeta = () => {
      syncDurationFromAudio();
      applyVolumeRef.current();
    };
    const onDurationChange = () => syncDurationFromAudio();
    const onPlay = () => {
      if (userPausedRef.current) {
        audio.pause();
        return;
      }
      playingRef.current = true;
      setPlaying(true);
    };
    const onPause = () => {
      playingRef.current = false;
      setPlaying(false);
    };
    const onEnded = () => playNextRef.current();

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [syncDurationFromAudio]);

  useEffect(() => {
    const unlock = () => {
      if (userPausedRef.current || playingRef.current) return;
      if (!pendingAutoplayRef.current && !trackRef.current?.id) return;
      pendingAutoplayRef.current = false;
      playInternalRef.current(getTime());
    };
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [getTime]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const t = getTime();
      setCurrentTime(t);
      if (trackRef.current?.kind === 'youtube' && ytRef.current?.getDuration) {
        try {
          setDuration(ytRef.current.getDuration() || 0);
        } catch {
          /* ignore */
        }
      } else if (trackRef.current && trackRef.current.kind !== 'youtube') {
        syncDurationFromAudio();
      }
      maybeAdvanceNearEnd();
      persistState({ playing: true, currentTime: t });
    }, 500);
    return () => window.clearInterval(id);
  }, [getTime, maybeAdvanceNearEnd, persistState, playing, syncDurationFromAudio]);

  useEffect(() => {
    const save = () => persistState({ playing, currentTime: getTime() });
    window.addEventListener('beforeunload', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('beforeunload', save);
      window.removeEventListener('pagehide', save);
    };
  }, [currentTime, getTime, persistState, playing]);

  const contextValue = useMemo<BgmContextValue>(
    () => ({
      playing,
      collapsed,
      volume,
      position,
      playerSize,
      title,
      artist,
      activeTrackKey,
      currentTime,
      duration,
      toggle,
      setVolume,
      seek,
      setCollapsed,
      setPosition,
      setPlayerSize,
      setTrack,
      playNext: playNextInPlaylist,
      playPrevious: playPrevInPlaylist,
      playlistActive,
      pushPageSnapshot,
      restorePageSnapshot,
      resumePageBgmIfNeeded,
      playCharacterTheme,
    }),
    [
      playing,
      collapsed,
      volume,
      position,
      playerSize,
      title,
      artist,
      activeTrackKey,
      currentTime,
      duration,
      toggle,
      setVolume,
      seek,
      setCollapsed,
      setPosition,
      setPlayerSize,
      setTrack,
      playNextInPlaylist,
      playPrevInPlaylist,
      playlistActive,
      pushPageSnapshot,
      restorePageSnapshot,
      resumePageBgmIfNeeded,
      playCharacterTheme,
    ],
  );

  return (
    <BgmContext.Provider value={contextValue}>
      <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
      <div id="yt-container" style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      {children}
    </BgmContext.Provider>
  );
}

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  getVideoData?: () => { video_id?: string };
  seekTo: (s: number, allowSeek: boolean) => void;
  setVolume: (n: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy?: () => void;
};

declare global {
  interface Window {
    YT?: { Player: new (el: string, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}
