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
/** hard-nav(location.assign) 직후에만 재생 위치 복원 — 새로고침은 항상 1번 곡 */
const HARD_RESUME_KEY = 'lh_bgm_hard_resume';

/** React 트리 밖 마운트 — #yt-container 를 JSX로 두면 destroy/removeChild 레이스 */
function getYtMountBox(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let box = document.getElementById('lh-yt-mount');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lh-yt-mount';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText =
      'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;overflow:hidden;';
    document.documentElement.appendChild(box);
  }
  return box;
}

function clearYtMount(box: HTMLElement) {
  /* removeChild 루프 금지 — YT iframe 이 이미 detach 되면 null 로 TypeError */
  try {
    box.replaceChildren();
  } catch {
    try {
      box.innerHTML = '';
    } catch {
      /* ignore */
    }
  }
}

export type { BgmKind, BgmTrack } from '@/lib/bgm/types';

type SavedState = {
  kind?: BgmKind;
  id?: string;
  title?: string;
  artist?: string;
  scope?: string;
  playing?: boolean;
  /** 사용자가 일시정지 버튼을 누른 경우만 true — 자동재생 실패와 구분 */
  userPaused?: boolean;
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
  setSeekScrubbing: (active: boolean) => void;
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
  silenceMedia: () => void;
  /** /vn 등에서 사이트 BGM만 잠시 멈춤 — userPaused로 기록하지 않음 */
  setPlaybackSuppressed: (suppressed: boolean) => void;
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
  const routeSuppressedRef = useRef(false);
  const suppressedWasPlayingRef = useRef(false);
  const toggleBusyRef = useRef(false);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const audioLoadGenRef = useRef(0);
  const ytGenRef = useRef(0);
  const ytPendingPlayRef = useRef(false);
  const ytCreatingRef = useRef(false);
  const switchSerialRef = useRef(0);
  const pendingAutoplayRef = useRef(false);
  const seekScrubbingRef = useRef(false);
  const autoplayRetryTimersRef = useRef<number[]>([]);
  const audioReadyAbortRef = useRef<AbortController | null>(null);
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

  /** YT destroy — iframe이 아직 mount에 있을 때만 destroy (선 clear 금지) */
  const detachYtPlayer = useCallback(() => {
    ytPendingPlayRef.current = false;
    ytCreatingRef.current = false;
    ytGenRef.current += 1;
    const player = ytRef.current;
    ytRef.current = null;
    if (!player) return;
    try {
      player.pauseVideo?.();
    } catch {
      /* ignore */
    }
    try {
      player.stopVideo?.();
    } catch {
      /* ignore */
    }
    try {
      player.destroy?.();
    } catch {
      /* ignore */
    }
    /* destroy 가 iframe을 못 지운 경우만 비움 — 선 clear 하면 YT 가 null.removeChild */
    const box = typeof document !== 'undefined' ? document.getElementById('lh-yt-mount') : null;
    if (box?.childNodes.length) clearYtMount(box);
  }, []);

  const destroyYtPlayer = useCallback(() => {
    if (!ytRef.current) return;
    switchingTrackRef.current = true;
    detachYtPlayer();
    window.setTimeout(() => {
      switchingTrackRef.current = false;
    }, 200);
  }, [detachYtPlayer]);

  const stopAudio = useCallback((opts?: { clearSrc?: boolean }) => {
    audioReadyAbortRef.current?.abort();
    audioReadyAbortRef.current = null;
    for (const id of autoplayRetryTimersRef.current) window.clearTimeout(id);
    autoplayRetryTimersRef.current = [];
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    if (opts?.clearSrc !== false) {
      try {
        audio.removeAttribute('src');
        audio.load();
      } catch {
        /* ignore */
      }
      audioLoadGenRef.current += 1;
    }
  }, []);

  /** HTML·YouTube 모두 즉시 묵음 (파괴는 비동기여도 소리는 바로 끊김) */
  const silenceAllOutputs = useCallback(
    (opts?: { clearSrc?: boolean }) => {
      stopAudio(opts);
      detachYtPlayer();
    },
    [detachYtPlayer, stopAudio],
  );

  const stopAllMedia = useCallback(async () => {
    silenceAllOutputs();
    switchingTrackRef.current = false;
  }, [silenceAllOutputs]);

  const silenceMedia = useCallback(() => {
    /* 라우트/테마 전환용 묵음 — 사용자 일시정지로 기록하면 이후 자동·클릭 재생이 영구 차단됨 */
    playingRef.current = false;
    setPlaying(false);
    pendingAutoplayRef.current = false;
    ytPendingPlayRef.current = false;
    silenceAllOutputs();
  }, [silenceAllOutputs]);

  const syncDurationFromAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) setDuration(d);
  }, []);

  const isAudioPlaybackStuck = useCallback(() => {
    const track = trackRef.current;
    if (!track?.id || track.kind === 'youtube') return false;
    const audio = audioRef.current;
    if (!audio) return true;
    if (!audio.src) return true;
    if (audio.paused) return true;
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) return true;
    return false;
  }, []);

  const ensureAudioSource = useCallback((track: BgmTrack) => {
    const audio = audioRef.current;
    if (!audio || track.kind === 'youtube') return;
    if (!audio.src) {
      audio.src = track.id;
      audio.load();
    }
  }, []);

  const markPlaybackIdle = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const scheduleAutoplayRetries = useCallback(() => {
    for (const id of autoplayRetryTimersRef.current) window.clearTimeout(id);
    autoplayRetryTimersRef.current = [];

    const retry = () => {
      if (userPausedRef.current) return;
      const track = trackRef.current;
      if (!track?.id) return;
      if (playingRef.current && !isAudioPlaybackStuck()) return;
      /* 재시도 시 0으로 되감기지 않도록 현재 위치 유지 */
      let resumeAt = 0;
      try {
        if (track.kind === 'youtube' && ytRef.current?.getCurrentTime) {
          resumeAt = ytRef.current.getCurrentTime() || 0;
        } else if (audioRef.current) {
          resumeAt = audioRef.current.currentTime || 0;
        }
      } catch {
        resumeAt = 0;
      }
      playInternalRef.current(resumeAt > 0.25 ? resumeAt : undefined);
    };
    for (const ms of [150, 500, 1500]) {
      autoplayRetryTimersRef.current.push(window.setTimeout(retry, ms));
    }
  }, [isAudioPlaybackStuck]);

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
      let time = currentTime;
      try {
        if (t?.kind === 'youtube' && ytRef.current?.getCurrentTime) {
          time = ytRef.current.getCurrentTime() || time;
        } else if (audioRef.current) {
          time = audioRef.current.currentTime;
        }
      } catch {
        /* ignore */
      }
      writeJson(STATE_KEY, {
        kind: t?.kind,
        id: t?.id,
        title: t?.title,
        artist: t?.artist,
        scope: t?.scope,
        playing: playingRef.current,
        userPaused: userPausedRef.current,
        currentTime: time,
        ...extra,
      });
    },
    [currentTime],
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
      pendingAutoplayRef.current = false;
      ytPendingPlayRef.current = false;
      for (const id of autoplayRetryTimersRef.current) window.clearTimeout(id);
      autoplayRetryTimersRef.current = [];
      audioRef.current?.pause();
      try {
        ytRef.current?.pauseVideo?.();
      } catch {
        /* ignore */
      }
      setPlaying(false);
      if (markPaused) persistState({ playing: false, userPaused: true, currentTime: getTime() });
    },
    [getTime, persistState],
  );

  const playInternal = useCallback(
    (seek?: number) => {
      if (routeSuppressedRef.current) return;
      const track = trackRef.current;
      if (!track?.id) return;

      const pageMulti =
        track.scope === 'page' && pagePlaylistRef.current.length > 1;

      if (track.kind === 'youtube') {
        // HTML audio must never keep playing under a YT track
        stopAudio();
        const ensureYt = () => {
          const box = getYtMountBox();
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
              const broken = ytRef.current;
              ytRef.current = null;
              ytGenRef.current += 1;
              try {
                broken?.destroy?.();
              } catch {
                /* ignore */
              }
              clearYtMount(box);
            }
            if (ytRef.current) return;
          }

          // Prevent parallel YT.Player construction (double audio)
          if (ytCreatingRef.current) return;
          ytCreatingRef.current = true;

          clearYtMount(box);
          const host = document.createElement('div');
          host.id = 'yt-iframe';
          box.appendChild(host);
          const ytGen = ++ytGenRef.current;
          try {
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
                  ytCreatingRef.current = false;
                  if (ytGen !== ytGenRef.current) {
                    try {
                      e.target.destroy?.();
                    } catch {
                      /* ignore */
                    }
                    return;
                  }
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
            window.setTimeout(() => {
              if (ytGen === ytGenRef.current) ytCreatingRef.current = false;
            }, 4000);
          } catch {
            ytCreatingRef.current = false;
            ytRef.current = null;
            clearYtMount(box);
          }
        };

        if (window.YT?.Player) ensureYt();
        else {
          const existing = window.onYouTubeIframeAPIReady;
          if (!(window as unknown as { __lhYtReadyHooked?: boolean }).__lhYtReadyHooked) {
            (window as unknown as { __lhYtReadyHooked?: boolean }).__lhYtReadyHooked = true;
            window.onYouTubeIframeAPIReady = () => {
              existing?.();
              ensureYt();
            };
          } else {
            // API still loading — queue a single retry once ready via polling
            const wait = window.setInterval(() => {
              if (!window.YT?.Player) return;
              window.clearInterval(wait);
              ensureYt();
            }, 80);
            window.setTimeout(() => window.clearInterval(wait), 8000);
          }
          if (!document.getElementById('yt-api')) {
            const sc = document.createElement('script');
            sc.id = 'yt-api';
            sc.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(sc);
          }
        }
        return;
      }

      // Never leave HTML audio running under a YouTube track
      // (and never start a second play pipeline for the same load)
      if (!audioRef.current) return;
      // HTML 재생 전 YouTube 잔향 차단 (이중 재생 방지)
      try {
        ytRef.current?.pauseVideo?.();
      } catch {
        /* ignore */
      }
      try {
        ytRef.current?.stopVideo?.();
      } catch {
        /* ignore */
      }
      applyVolume();
      const audio = audioRef.current;
      ensureAudioSource(track);
      if (typeof seek === 'number' && seek > 0) {
        try {
          audio.currentTime = seek;
        } catch {
          /* ignore */
        }
      }

      if (!audio.paused && playingRef.current && !userPausedRef.current) {
        // Already playing this element — avoid stacking play() pipelines
        return;
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
    [applyVolume, deferYoutubePlay, ensureAudioSource, getTime, handleYtStateChange, loadYoutubeVideo, persistState, scheduleAutoplayRetries, stopAudio, syncDurationFromAudio],
  );

  playInternalRef.current = playInternal;

  const setPlaybackSuppressed = useCallback(
    (suppressed: boolean) => {
      if (routeSuppressedRef.current === suppressed) return;
      routeSuppressedRef.current = suppressed;
      if (suppressed) {
        suppressedWasPlayingRef.current =
          playingRef.current || Boolean(audioRef.current && !audioRef.current.paused);
        pauseInternal(false);
      } else if (suppressedWasPlayingRef.current && !userPausedRef.current && trackRef.current?.id) {
        suppressedWasPlayingRef.current = false;
        playInternal(getTime());
      } else {
        suppressedWasPlayingRef.current = false;
      }
    },
    [getTime, pauseInternal, playInternal],
  );

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
        if (wantPlay && (!playingRef.current || isAudioPlaybackStuck())) {
          const resumeAt = opts?.currentTime ?? getTime();
          playInternal(resumeAt > 0.25 ? resumeAt : undefined);
        }
        return;
      }

      if (wantPlay) {
        markPlaybackIdle();
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

        audioReadyAbortRef.current?.abort();
        const ac = new AbortController();
        audioReadyAbortRef.current = ac;

        const loadGen = ++audioLoadGenRef.current;
        // Always stop any current decode before swapping src
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        audio.src = next.id;
        applyVolume();
        audio.loop = next.scope === 'character' ? true : !pageMulti;
        audio.load();

        const start = () => {
          if (ac.signal.aborted) return;
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

        audio.addEventListener('loadedmetadata', syncDurationFromAudio, {
          once: true,
          signal: ac.signal,
        });
        audio.addEventListener('canplay', start, { once: true, signal: ac.signal });
        audio.addEventListener(
          'error',
          () => {
            if (serial !== switchSerialRef.current) return;
            markPlaybackIdle();
          },
          { once: true, signal: ac.signal },
        );
        /* 클릭 제스처 틱에서 즉시 play() — PV 중에도 테마가 바로 나오게 */
        start();
      };

      // MP3/URL 전환 — YouTube 160ms 대기 없이 즉시 (자동 넘김·⏭)
      if (next.kind !== 'youtube' && prev?.kind !== 'youtube') {
        persist(wantPlay);
        switchingTrackRef.current = true;
        /* clearSrc:false — src 비운 채 playing UI만 남는 먹통 방지. loadAndPlayAudio가 교체 */
        silenceAllOutputs({ clearSrc: false });
        const pageMulti = next.scope === 'page' && pagePlaylistRef.current.length > 1;
        if (!wantPlay) {
          switchingTrackRef.current = false;
          playingRef.current = false;
          setPlaying(false);
          /* 일시정지 복원이라도 src는 올려 두어 클릭 재생이 바로 되게 */
          const audio = audioRef.current;
          if (audio) {
            audio.src = next.id;
            audio.loop = next.scope === 'character' ? true : !pageMulti;
            audio.load();
            if (seek > 0) {
              const onMeta = () => {
                try {
                  audio.currentTime = seek;
                } catch {
                  /* ignore */
                }
              };
              audio.addEventListener('loadedmetadata', onMeta, { once: true });
            }
          }
          return;
        }
        loadAndPlayAudio(serial, pageMulti);
        switchingTrackRef.current = false;
        if (wantPlay) scheduleAutoplayRetries();
        return;
      }

      const runSwitch = () => {
        const pageMulti = next.scope === 'page' && pagePlaylistRef.current.length > 1;
        /* await 금지 — microtask로 넘어가면 클릭 제스처가 끊겨 테마 자동재생이 막힘 */
        silenceAllOutputs();
        switchingTrackRef.current = false;
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

      runSwitch();
    },
    [
      applyVolume,
      commitTrackUi,
      deferYoutubePlay,
      getTime,
      persistState,
      isAudioPlaybackStuck,
      markPlaybackIdle,
      playInternal,
      scheduleAutoplayRetries,
      silenceAllOutputs,
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

  const isMediaActuallyPlaying = useCallback(() => {
    const track = trackRef.current;
    if (!track?.id) return false;
    if (track.kind === 'youtube') {
      try {
        /* 1 = PLAYING */
        return ytRef.current?.getPlayerState?.() === 1;
      } catch {
        return false;
      }
    }
    const audio = audioRef.current;
    return !!(audio && audio.src && !audio.paused && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
  }, []);

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
        applyTrack(first, { autoplay: true, force: true });
      }
      return;
    }

    if (isMediaActuallyPlaying()) {
      pauseInternal(true);
      return;
    }

    /* UI만 ▶/⏸ 어긋난 경우·src 미로드·userPaused 잔여 → 무조건 재생 시도 */
    userPausedRef.current = false;
    persistState({ userPaused: false, playing: true });
    const t = trackRef.current;
    if (t && t.kind !== 'youtube') {
      const audio = audioRef.current;
      if (audio && (!audio.src || !audio.src.includes(t.id.slice(-24)))) {
        applyTrack(t, { autoplay: true, currentTime: getTime(), force: true });
        return;
      }
    }
    playInternal(getTime());
  }, [applyTrack, getTime, isMediaActuallyPlaying, pauseInternal, persistState, playInternal, siteBgm]);

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

  const setSeekScrubbing = useCallback((active: boolean) => {
    seekScrubbingRef.current = active;
  }, []);

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
      playing: playingRef.current,
    };
    snapshotRef.current = snap;
    pageSnapshotRef.current = snap;
  }, [getTime]);

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
          playingRef.current
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
    [applyTrack, destroyYtPlayer, pauseInternal, persistState, siteBgm, stopAudio],
  );

  const resumePageBgmIfNeeded = useCallback(() => {
    if (trackRef.current?.scope !== 'character') return;
    restorePageSnapshot(playingRef.current);
  }, [restorePageSnapshot]);

  const playCharacterTheme = useCallback(
    (
      src: { fileData?: string; youtubeId?: string; title?: string; artist?: string },
      _wasPlaying: boolean,
    ) => {
      const file = src.fileData?.trim() || '';
      const ytRaw = src.youtubeId?.trim() || '';
      if (!file && !ytRaw) return;

      const next = trackFromSrc({
        fileData: file || undefined,
        youtubeId: ytRaw || undefined,
        title: src.title || 'Theme',
        artist: src.artist || '',
        scope: 'character',
      });
      if (!next) return;

      /* 카드 클릭으로 이미 이 테마로 전환된 뒤 PV useEffect가 silence+재시작하면
         제스처가 없어 PV 내내 무음이 됨. 같은 테마면 재시작하지 않음. */
      if (
        trackRef.current?.scope === 'character' &&
        sameTrack(trackRef.current, next) &&
        !userPausedRef.current
      ) {
        if (!playingRef.current) playInternal(getTime());
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
    [applyTrack, getTime, playInternal, pushPageSnapshot, siteBgm],
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
    const flush = () => {
      persistState({});
      try {
        sessionStorage.setItem(HARD_RESUME_KEY, '1');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('lh-before-hard-nav', flush);
    return () => window.removeEventListener('lh-before-hard-nav', flush);
  }, [persistState]);

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
      // OC/세계관/TRPG 테마가 이미 재생 중이면 메인 첫 곡으로 덮지 않음
      if (track?.scope === 'character') {
        return;
      }

      /* hard-nav 직후에만 이전 곡·위치 복원. 새로고침은 항상 플레이리스트 1번 */
      let hardResume = false;
      try {
        hardResume = sessionStorage.getItem(HARD_RESUME_KEY) === '1';
        sessionStorage.removeItem(HARD_RESUME_KEY);
      } catch {
        hardResume = false;
      }

      const saved = readJson<SavedState>(STATE_KEY);
      if (hardResume && saved?.id && (saved.scope === 'page' || !saved.scope)) {
        const match = pl.find((t) => t.id === saved.id) ?? pl[0];
        const idx = pl.findIndex((t) => t.id === match.id);
        playlistIndexRef.current = idx >= 0 ? idx : 0;
        userPausedRef.current = saved.userPaused === true;
        applyTrackRef.current(match, {
          autoplay: saved.userPaused !== true,
          currentTime: Math.max(0, Number(saved.currentTime) || 0),
          force: true,
        });
        return;
      }

      userPausedRef.current = false;
      playlistIndexRef.current = 0;
      applyTrackRef.current(pl[0], { autoplay: true, currentTime: 0, force: true });
      return;
    }

    if (!track?.id && hasBgm) {
      if (trackRef.current?.scope === 'character') return;
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
  }, [siteBgm, syncPlaylistLoop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (seekScrubbingRef.current) return;
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
      if (switchingTrackRef.current) return;
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
      // 퍼즈 후 화면 클릭으로 재개 금지 — 자동재생 차단 해제만 허용
      if (routeSuppressedRef.current) return;
      if (userPausedRef.current || playingRef.current) return;
      if (!pendingAutoplayRef.current) return;
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
      if (seekScrubbingRef.current) return;
      const track = trackRef.current;
      /* UI만 재생 중·media는 빈 src/일시정지 → 자동 복구 (컨트롤 먹통처럼 보이던 상태) */
      if (
        track?.id &&
        track.kind !== 'youtube' &&
        !userPausedRef.current &&
        !routeSuppressedRef.current &&
        !switchingTrackRef.current &&
        isAudioPlaybackStuck()
      ) {
        applyTrackRef.current(track, {
          autoplay: true,
          currentTime: getTime() > 0.25 ? getTime() : 0,
          force: true,
        });
        return;
      }
      const t = getTime();
      setCurrentTime(t);
      if (track?.kind === 'youtube' && ytRef.current?.getDuration) {
        try {
          setDuration(ytRef.current.getDuration() || 0);
        } catch {
          /* ignore */
        }
      } else if (track && track.kind !== 'youtube') {
        syncDurationFromAudio();
      }
      maybeAdvanceNearEnd();
      persistState({ playing: true, currentTime: t });
    }, 500);
    return () => window.clearInterval(id);
  }, [getTime, isAudioPlaybackStuck, maybeAdvanceNearEnd, persistState, playing, syncDurationFromAudio]);

  useEffect(() => {
    const save = () => persistState({ currentTime: getTime() });
    window.addEventListener('beforeunload', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('beforeunload', save);
      window.removeEventListener('pagehide', save);
    };
  }, [getTime, persistState]);

  useEffect(() => {
    return () => {
      for (const id of autoplayRetryTimersRef.current) window.clearTimeout(id);
      autoplayRetryTimersRef.current = [];
      audioReadyAbortRef.current?.abort();
      try {
        audioRef.current?.pause();
      } catch {
        /* ignore */
      }
      /* Strict Mode 재마운트 시 src를 지우면 playing UI만 남는 먹통이 됨 — pause만 */
      try {
        ytRef.current?.stopVideo?.();
        ytRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      ytRef.current = null;
    };
  }, []);

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
      setSeekScrubbing,
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
      silenceMedia,
      setPlaybackSuppressed,
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
      setSeekScrubbing,
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
      silenceMedia,
      setPlaybackSuppressed,
    ],
  );

  return (
    <BgmContext.Provider value={contextValue}>
      <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
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
  getPlayerState?: () => number;
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
