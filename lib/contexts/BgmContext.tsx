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
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { SiteBgm } from '@/lib/types/site-content';

const STATE_KEY = 'lh_bgm_shared_state';
const UI_KEY = 'lh_bgm_ui_state';

export type BgmKind = 'url' | 'youtube' | 'file';

export type BgmTrack = {
  kind: BgmKind;
  id: string;
  title: string;
  artist: string;
  scope: 'page' | 'character';
};

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
  playCharacterTheme: (
    src: { fileData?: string; youtubeId?: string; title?: string; artist?: string },
    wasPlaying: boolean,
  ) => void;
};

const BgmContext = createContext<BgmContextValue | null>(null);

function readJson<T>(key: string): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as T;
  } catch {
    return {} as T;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const embed = u.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embed) return embed[1];
      const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shorts) return shorts[1];
    }
  } catch {
    /* not a URL */
  }

  const loose = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/,
  );
  return loose?.[1] || null;
}

function normalizeTrack(track: BgmTrack): BgmTrack {
  if (track.kind !== 'url') return track;
  const ytId = parseYoutubeId(track.id);
  if (!ytId) return track;
  return { ...track, kind: 'youtube', id: ytId };
}

function trackFromSrc(src: {
  url?: string;
  youtubeId?: string;
  fileData?: string;
  title?: string;
  artist?: string;
  scope?: 'page' | 'character';
}): BgmTrack | null {
  if (src.fileData) {
    return {
      kind: 'file',
      id: src.fileData,
      title: src.title || 'BGM',
      artist: src.artist || '',
      scope: src.scope || 'page',
    };
  }
  if (src.youtubeId) {
    return {
      kind: 'youtube',
      id: src.youtubeId,
      title: src.title || 'BGM',
      artist: src.artist || '',
      scope: src.scope || 'page',
    };
  }
  if (src.url) {
    const ytId = parseYoutubeId(src.url);
    if (ytId) {
      return {
        kind: 'youtube',
        id: ytId,
        title: src.title || 'BGM',
        artist: src.artist || '',
        scope: src.scope || 'page',
      };
    }
    return {
      kind: 'url',
      id: src.url,
      title: src.title || 'BGM',
      artist: src.artist || '',
      scope: src.scope || 'page',
    };
  }
  return null;
}

function sameTrack(a: BgmTrack | null, b: BgmTrack | null) {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

function buildPagePlaylist(bgm: SiteBgm): BgmTrack[] {
  const raw = bgm.playlist?.filter((p) => p.url?.trim()) ?? [];
  const items = raw.length
    ? raw
    : bgm.url?.trim()
      ? [{ title: bgm.title, artist: bgm.artist, url: bgm.url }]
      : [];
  return items
    .map((item) =>
      trackFromSrc({
        url: item.url,
        title: item.title || bgm.title || 'BGM',
        artist: item.artist || bgm.artist || '',
        scope: 'page',
      }),
    )
    .filter((t): t is BgmTrack => !!t);
}

function firstPageTrack(bgm: SiteBgm): BgmTrack | null {
  return buildPagePlaylist(bgm)[0] ?? null;
}

function readStoredVolume() {
  const ui = readJson<UiState>(UI_KEY);
  return typeof ui.volume === 'number' ? ui.volume : 40;
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
  const pagePlaylistRef = useRef<BgmTrack[]>([]);
  const playlistIndexRef = useRef(0);
  const playNextRef = useRef<() => void>(() => {});
  const playPrevRef = useRef<() => void>(() => {});
  const advanceLockRef = useRef(false);
  const volumeRef = useRef(readStoredVolume());

  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);
  const [volume, setVolumeState] = useState(() => volumeRef.current);
  const [position, setPositionState] = useState<{ left: string; top: string } | null>(null);
  const [playerSize, setPlayerSizeState] = useState<{ width: number; height: number }>({
    width: BGM_PLAYER_SIZE.defaultW,
    height: BGM_PLAYER_SIZE.defaultH,
  });
  const [title, setTitle] = useState('BGM');
  const [artist, setArtist] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playlistActive, setPlaylistActive] = useState(false);

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

  const applyVolume = useCallback((v = volumeRef.current) => {
    if (audioRef.current) audioRef.current.volume = v / 100;
    try {
      ytRef.current?.setVolume?.(v);
    } catch {
      /* ignore */
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
          if (ytRef.current) {
            try {
              if (typeof seek === 'number' && seek > 0) ytRef.current.seekTo(seek, true);
              ytRef.current.playVideo();
              setPlaying(true);
            } catch {
              /* ignore */
            }
            return;
          }
          const box = document.getElementById('yt-container');
          if (!box) return;
          box.innerHTML = '<div id="yt-iframe"></div>';
          ytRef.current = new window.YT!.Player('yt-iframe', {
            height: '1',
            width: '1',
            videoId: track.id,
            playerVars: {
              autoplay: 1,
              loop: pageMulti ? 0 : 1,
              playlist: pageMulti ? undefined : track.id,
              start: Math.floor(seek || 0),
              playsinline: 1,
            },
            events: {
              onReady: (e: { target: YTPlayer }) => {
                e.target.setVolume(volumeRef.current);
                if (seek) e.target.seekTo(seek, true);
                e.target.playVideo();
              },
              onStateChange: (e: { data: number }) => {
                if (e.data === 1) setPlaying(true);
                if (e.data === 2) setPlaying(false);
                if (e.data === 0) playNextRef.current();
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
      if (typeof seek === 'number' && seek > 0) {
        try {
          audioRef.current.currentTime = seek;
        } catch {
          /* ignore */
        }
      }
      audioRef.current
        .play()
        .then(() => {
          setPlaying(true);
          persistState({ playing: true, currentTime: getTime() });
        })
        .catch(() => setPlaying(false));
    },
    [applyVolume, getTime, persistState],
  );

  const applyTrack = useCallback(
    (next: BgmTrack | null, opts?: { autoplay?: boolean; currentTime?: number; force?: boolean }) => {
      if (!next?.id) return;

      next = normalizeTrack(next);

      const prev = trackRef.current;
      const changed = opts?.force || !sameTrack(prev, next);

      if (!changed) {
        trackRef.current = next;
        setTitle(next.title);
        setArtist(next.artist);
        syncPlaylistLoop(next);
        if (opts?.autoplay) {
          if (typeof opts.currentTime === 'number' && opts.currentTime > 0 && audioRef.current && next.kind !== 'youtube') {
            try {
              audioRef.current.currentTime = opts.currentTime;
            } catch {
              /* ignore */
            }
          }
          if (!playing) playInternal(opts.currentTime);
        }
        return;
      }

      if (changed) {
        pauseInternal(false);
        try {
          ytRef.current?.stopVideo?.();
        } catch {
          /* ignore */
        }
        ytRef.current = null;
        const box = document.getElementById('yt-container');
        if (box) box.innerHTML = '';

        if (next.kind !== 'youtube' && audioRef.current) {
          audioRef.current.src = next.id;
          applyVolume();
          audioRef.current.load();
          if (opts?.currentTime) {
            audioRef.current.addEventListener(
              'loadedmetadata',
              () => {
                if (audioRef.current && opts.currentTime) {
                  try {
                    audioRef.current.currentTime = opts.currentTime;
                  } catch {
                    /* ignore */
                  }
                }
              },
              { once: true },
            );
          }
        }
      }

      trackRef.current = next;
      setTitle(next.title);
      setArtist(next.artist);
      syncPlaylistLoop(next);
      advanceLockRef.current = false;

      if (next.scope === 'page') {
        const idx = pagePlaylistRef.current.findIndex((t) => sameTrack(t, next));
        if (idx >= 0) playlistIndexRef.current = idx;
      }

      persistState({
        kind: next.kind,
        id: next.id,
        title: next.title,
        artist: next.artist,
        scope: next.scope,
        currentTime: opts?.currentTime || getTime(),
        playing: !!opts?.autoplay,
      });

      if (opts?.autoplay) playInternal(opts.currentTime);
    },
    [applyVolume, getTime, pauseInternal, persistState, playInternal, playing, syncPlaylistLoop],
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

      const nextIdx = (playlistIndexRef.current + delta + pl.length) % pl.length;
      playlistIndexRef.current = nextIdx;
      applyTrack(pl[nextIdx], { autoplay: true, currentTime: 0, force: true });
    },
    [applyTrack],
  );

  const tryAdvancePlaylist = useCallback(() => {
    if (advanceLockRef.current) return;
    const pl = pagePlaylistRef.current;
    if (pl.length <= 1) return;
    if (trackRef.current?.scope !== 'page') return;
    advanceLockRef.current = true;
    window.setTimeout(() => {
      advanceLockRef.current = false;
    }, 1500);
    jumpPlaylist(1);
  }, [jumpPlaylist]);

  const playNextInPlaylist = useCallback(() => {
    jumpPlaylist(1);
  }, [jumpPlaylist]);

  const playPrevInPlaylist = useCallback(() => {
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
    if (!trackRef.current?.id) {
      const first = firstPageTrack(siteBgm);
      if (first) {
        applyTrack(first, { autoplay: true });
        return;
      }
    }
    if (playing) pauseInternal(true);
    else playInternal(getTime());
  }, [applyTrack, getTime, pauseInternal, playInternal, playing, siteBgm]);

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
      if (trackRef.current?.kind === 'youtube') {
        try {
          ytRef.current?.seekTo?.(t, true);
        } catch {
          /* ignore */
        }
      } else if (audioRef.current) {
        try {
          audioRef.current.currentTime = t;
        } catch {
          /* ignore */
        }
      }
      setCurrentTime(t);
      persistState({ currentTime: t });
    },
    [persistState],
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
      setPositionState({ left, top });
      persistUi({ posLeft: left, posTop: top });
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
        try {
          ytRef.current?.stopVideo?.();
        } catch {
          /* ignore */
        }
        ytRef.current = null;
        const box = document.getElementById('yt-container');
        if (box) box.innerHTML = '';
      }

      if (snap && snap.track.scope !== 'character') {
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
    [applyTrack, pauseInternal, persistState, siteBgm],
  );

  const playCharacterTheme = useCallback(
    (
      src: { fileData?: string; youtubeId?: string; title?: string; artist?: string },
      wasPlaying: boolean,
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
        if (wasPlaying && !playing) playInternal(getTime());
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
            playing: wasPlaying,
          };
          snapshotRef.current = fallback;
          pageSnapshotRef.current = fallback;
        }
      }

      setTrack(
        {
          fileData: src.fileData,
          youtubeId: src.youtubeId,
          title: src.title || 'Theme',
          artist: src.artist || '',
          scope: 'character',
        },
        { autoplay: wasPlaying },
      );
    },
    [getTime, playInternal, playing, pushPageSnapshot, setTrack, siteBgm],
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
    if (ui.posLeft && ui.posTop) setPositionState({ left: ui.posLeft, top: ui.posTop });
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
    if (siteInitRef.current) return;

    const saved = readJson<SavedState>(STATE_KEY);
    if (saved.id) {
      siteInitRef.current = true;
      const scope = (saved.scope as 'page' | 'character') || 'page';
      if (scope === 'character') {
        const first = firstPageTrack(siteBgm);
        if (first) applyTrackRef.current(first, { autoplay: false });
        return;
      }
      applyTrackRef.current(
        normalizeTrack({
          kind: saved.kind || 'url',
          id: saved.id,
          title: saved.title || 'BGM',
          artist: saved.artist || '',
          scope: 'page',
        }),
        { autoplay: !!saved.playing, currentTime: saved.currentTime || 0 },
      );
      return;
    }

    if (!siteBgm.url && !siteBgm.playlist?.some((p) => p.url?.trim())) return;

    siteInitRef.current = true;
    const first = firstPageTrack(siteBgm);
    if (first) applyTrackRef.current(first, { autoplay: true });
  }, [siteBgm]);

  useEffect(() => {
    if (playing || !trackRef.current?.id) return;
    const unlock = () => {
      if (!trackRef.current?.id) return;
      playInternal(getTime());
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [getTime, playInternal, playing, siteBgm.url, siteBgm.playlist]);

  useEffect(() => {
    pagePlaylistRef.current = buildPagePlaylist(siteBgm);
    const track = trackRef.current;
    syncPlaylistLoop(track);
    if (track?.scope === 'page') {
      const idx = pagePlaylistRef.current.findIndex((t) => sameTrack(t, track));
      if (idx >= 0) playlistIndexRef.current = idx;
    }
  }, [siteBgm, syncPlaylistLoop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
      const pl = pagePlaylistRef.current;
      const track = trackRef.current;
      if (
        track?.scope === 'page' &&
        pl.length > 1 &&
        audio.duration > 1 &&
        audio.currentTime >= audio.duration - 0.35
      ) {
        playNextRef.current();
      }
    };
    const onMeta = () => {
      setDuration(audio.duration || 0);
      applyVolumeRef.current();
    };
    const onEnded = () => playNextRef.current();

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCurrentTime(getTime());
      if (trackRef.current?.kind === 'youtube' && ytRef.current?.getDuration) {
        try {
          setDuration(ytRef.current.getDuration() || 0);
        } catch {
          /* ignore */
        }
      }
      persistState({ playing: true, currentTime: getTime() });
    }, 1000);
    return () => window.clearInterval(id);
  }, [getTime, persistState, playing]);

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
      playCharacterTheme,
    ],
  );

  return (
    <BgmContext.Provider value={contextValue}>
      <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} />
      <div id="yt-container" style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      {children}
    </BgmContext.Provider>
  );
}

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (s: number, allowSeek: boolean) => void;
  setVolume: (n: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

declare global {
  interface Window {
    YT?: { Player: new (el: string, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}
