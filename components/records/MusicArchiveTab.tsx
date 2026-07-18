'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { MusicComment, MusicTrack } from '@/lib/types/site-content';
import { newId } from '@/lib/types/site-content';
import type { User } from 'firebase/auth';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MusicArchiveTab({ user, isAdmin, onOpenAuth }: Props) {
  const { musicPlaylists: rawPlaylists, musicTracks: rawTracks, saveMusicTracks } = useSiteContent();
  const musicPlaylists = rawPlaylists ?? [];
  const musicTracks = rawTracks ?? [];
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState<'off' | 'one' | 'all'>('off');
  const [volume, setVolume] = useState(0.72);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [commentDraft, setCommentDraft] = useState('');
  const [revealedTracks, setRevealedTracks] = useState<Set<string>>(() => new Set());
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const seekingRef = useRef(false);
  const seekInputRef = useRef<HTMLInputElement>(null);

  const playlist = musicPlaylists.find((p) => p.id === playlistId) ?? musicPlaylists[0] ?? null;

  useEffect(() => {
    if (!playlistId && musicPlaylists[0]) setPlaylistId(musicPlaylists[0].id);
  }, [musicPlaylists, playlistId]);

  const tracks = useMemo(() => {
    if (!playlist) return [] as MusicTrack[];
    return (playlist.trackIds ?? [])
      .map((id) => musicTracks.find((t) => t.id === id))
      .filter((t): t is MusicTrack => !!t && !!t.fileUrl);
  }, [musicTracks, playlist]);

  const current = tracks[trackIndex] ?? null;
  const currentSrc = current?.fileUrl ?? '';

  const activeLyric = useMemo(() => {
    if (!current?.lyricLines?.length) return current?.lyrics || '';
    const lines = [...current.lyricLines].sort((a, b) => a.time - b.time);
    let text = lines[0]?.text || '';
    for (const line of lines) {
      if (line.time <= currentTime) text = line.text;
      else break;
    }
    return text;
  }, [current, currentTime]);

  useEffect(() => {
    if (!tracks.length) {
      setTrackIndex(0);
      return;
    }
    if (trackIndex >= tracks.length) setTrackIndex(0);
  }, [tracks.length, trackIndex]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentSrc) {
      loadedSrcRef.current = null;
      return;
    }
    if (loadedSrcRef.current === currentSrc) return;

    loadedSrcRef.current = currentSrc;
    el.src = currentSrc;
    el.load();
    setCurrentTime(0);
    setDuration(0);
    if (playing) void el.play().catch(() => setPlaying(false));
  }, [currentSrc, playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentSrc) return;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, currentSrc]);

  const selectTrack = useCallback((index: number, autoplay = true) => {
    setTrackIndex(index);
    if (autoplay) setPlaying(true);
  }, []);

  function pickNext(delta: number) {
    if (!tracks.length) return;
    if (shuffle && tracks.length > 1) {
      let idx = trackIndex;
      while (idx === trackIndex) idx = Math.floor(Math.random() * tracks.length);
      selectTrack(idx);
      return;
    }
    const next = ((trackIndex + delta) % tracks.length + tracks.length) % tracks.length;
    selectTrack(next);
  }

  function onEnded() {
    if (loop === 'one') {
      const el = audioRef.current;
      if (el) {
        el.currentTime = 0;
        void el.play();
      }
      return;
    }
    if (trackIndex < tracks.length - 1 || loop === 'all') pickNext(1);
    else setPlaying(false);
  }

  async function addComment() {
    if (!current || !commentDraft.trim() || !user) return;
    const comment: MusicComment = {
      id: newId(),
      author: user.displayName || user.email?.split('@')[0] || 'Guest',
      body: commentDraft.trim(),
      date: new Date().toISOString().slice(0, 10),
    };
    const nextTracks = musicTracks.map((t) =>
      t.id === current.id ? { ...t, comments: [...(t.comments ?? []), comment] } : t,
    );
    await saveMusicTracks(nextTracks);
    setCommentDraft('');
  }

  function trackUnlocked(track: MusicTrack) {
    return isAdmin || !track.secret || revealedTracks.has(track.id);
  }

  function resolveDuration(el?: HTMLAudioElement | null) {
    const audio = el ?? audioRef.current;
    if (!audio) return 0;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) return d;
    try {
      if (audio.seekable.length > 0) {
        const end = audio.seekable.end(audio.seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch {
      /* ignore */
    }
    return 0;
  }

  const progressMax = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressValue = seeking
    ? seekValue
    : progressMax > 0
      ? Math.min(currentTime, progressMax)
      : 0;
  const progressPct =
    progressMax > 0 ? Math.min(100, Math.max(0, (progressValue / progressMax) * 100)) : 0;

  function applySeek(t: number) {
    const max = progressMax > 0 ? progressMax : resolveDuration();
    if (max <= 0) return;
    const next = Math.max(0, Math.min(t, max));
    setSeekValue(next);
    setCurrentTime(next);
    if (audioRef.current) audioRef.current.currentTime = next;
  }

  function beginSeek(el: HTMLInputElement, pointerId?: number) {
    seekingRef.current = true;
    setSeeking(true);
    setSeekValue(parseFloat(el.value) || 0);
    if (pointerId != null) {
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function endSeek(el: HTMLInputElement) {
    const next = parseFloat(el.value) || 0;
    applySeek(next);
    seekingRef.current = false;
    setSeeking(false);
  }

  if (!musicPlaylists.length) {
    return <div className="page-coming">— 플레이리스트가 없습니다 —</div>;
  }

  return (
    <div className="lh-music-archive">
      <aside className="lh-music-archive__playlists">
        {musicPlaylists.map((pl) => (
          <SecretItemGate
            key={pl.id}
            scope="music"
            item={pl}
            isAdmin={isAdmin}
            loggedIn={!!user}
            onRequestLogin={onOpenAuth}
            lockedLabel="탭하여 열람"
          >
            <button
              type="button"
              className={`lh-music-pl${playlist?.id === pl.id ? ' is-active' : ''}`}
              onClick={() => {
                setPlaylistId(pl.id);
                setTrackIndex(0);
                setPlaying(false);
              }}
            >
              {pl.coverUrl ? <img src={pl.coverUrl} alt="" loading="lazy" decoding="async" /> : <span className="lh-music-pl__ph">♪</span>}
              <span>
                <strong>
                  {pl.title}
                  {pl.secret ? <SecretLockBadge compact /> : null}
                </strong>
                {pl.description ? <em>{pl.description}</em> : null}
              </span>
            </button>
          </SecretItemGate>
        ))}
      </aside>

      <div className="lh-music-archive__main">
        <div className="lh-music-player">
          <audio
            ref={audioRef}
            onTimeUpdate={(e) => {
              if (seekingRef.current) return;
              setCurrentTime(e.currentTarget.currentTime);
              const d = resolveDuration(e.currentTarget);
              if (d > 0 && d !== duration) setDuration(d);
            }}
            onLoadedMetadata={(e) => setDuration(resolveDuration(e.currentTarget))}
            onDurationChange={(e) => setDuration(resolveDuration(e.currentTarget))}
            onSeeked={(e) => {
              if (seekingRef.current) return;
              setCurrentTime(e.currentTarget.currentTime);
            }}
            onEnded={onEnded}
          />
          {current?.coverUrl ? (
            <img src={current.coverUrl} alt="" className="lh-music-player__cover" />
          ) : (
            <div className="lh-music-player__cover lh-music-player__cover--empty">♪</div>
          )}
          <div className="lh-music-player__meta">
            <h3>{current?.title ?? '—'}</h3>
            <p>{current?.artist ?? ''}</p>
          </div>
          <div className="lh-music-player__lyric">{activeLyric}</div>
          <input
            ref={seekInputRef}
            className="lh-music-player__seek"
            type="range"
            min={0}
            max={progressMax > 0 ? progressMax : 100}
            step={0.1}
            value={progressMax > 0 ? progressValue : 0}
            disabled={!current}
            aria-label="재생 위치"
            style={{ ['--progress' as string]: `${progressPct}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!current) return;
              beginSeek(e.currentTarget, e.pointerId);
            }}
            onInput={(e) => {
              if (!current) return;
              if (!seekingRef.current) beginSeek(e.currentTarget);
              setSeekValue(parseFloat(e.currentTarget.value) || 0);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              if (!current) return;
              endSeek(e.currentTarget);
            }}
            onPointerCancel={(e) => {
              if (!current) return;
              endSeek(e.currentTarget);
            }}
            onKeyUp={(e) => {
              if (!current) return;
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                applySeek(parseFloat(e.currentTarget.value) || 0);
                seekingRef.current = false;
                setSeeking(false);
              }
            }}
          />
          <div className="lh-music-player__times">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div className="lh-music-player__controls">
            <button type="button" onClick={() => setShuffle((s) => !s)} className={shuffle ? 'is-on' : ''} title="셔플">
              🔀
            </button>
            <button type="button" onClick={() => pickNext(-1)} title="이전">
              ⏮
            </button>
            <button type="button" className="lh-music-player__play" onClick={() => setPlaying((p) => !p)} title="재생">
              {playing ? '⏸' : '▶'}
            </button>
            <button type="button" onClick={() => pickNext(1)} title="다음">
              ⏭
            </button>
            <button
              type="button"
              className={loop !== 'off' ? 'is-on' : ''}
              onClick={() => setLoop((l) => (l === 'off' ? 'all' : l === 'all' ? 'one' : 'off'))}
              title="반복"
            >
              {loop === 'one' ? '🔂' : '🔁'}
            </button>
            <button
              type="button"
              title="목록 비우기"
              onClick={() => {
                setPlaying(false);
                setTrackIndex(0);
                loadedSrcRef.current = null;
                if (audioRef.current) audioRef.current.removeAttribute('src');
              }}
            >
              ✕
            </button>
          </div>
          <label className="lh-music-player__vol">
            🔊
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </label>
        </div>

        <ol className="lh-music-tracklist">
          {tracks.length === 0 ? (
            <li className="lh-music-tracklist__empty">
              수록곡이 없습니다. 관리자에서 곡을 추가하고 오디오 파일을 업로드한 뒤 플레이리스트에 체크하세요.
            </li>
          ) : null}
          {tracks.map((track, idx) => (
            <li key={track.id}>
              <SecretItemGate
                scope="music"
                item={track}
                isAdmin={isAdmin}
                loggedIn={!!user}
                onRequestLogin={onOpenAuth}
              >
                <button
                  type="button"
                  className={`lh-music-track${idx === trackIndex ? ' is-active' : ''}`}
                  onClick={() => {
                    if (!trackUnlocked(track)) return;
                    selectTrack(idx);
                  }}
                >
                  <span>{idx + 1}</span>
                  <span>
                    {track.title}
                    {track.secret ? <SecretLockBadge compact /> : null}
                  </span>
                  <span>{track.artist}</span>
                </button>
              </SecretItemGate>
            </li>
          ))}
        </ol>

        {current ? (
          <section className="lh-music-comments">
            <h4>코멘트</h4>
            {(current.comments ?? []).map((c) => (
              <article key={c.id} className="lh-music-comment">
                <header>
                  <strong>{c.author}</strong>
                  <time>{c.date}</time>
                </header>
                <p>{c.body}</p>
                {c.reply ? <p className="lh-music-comment__reply">↳ {c.reply}</p> : null}
              </article>
            ))}
            {user ? (
              <div className="lh-music-comment-form">
                <input
                  className="form-input"
                  placeholder="코멘트"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                />
                <button type="button" className="btn-edit" onClick={() => void addComment()}>
                  등록
                </button>
              </div>
            ) : (
              <button type="button" className="btn-edit" onClick={onOpenAuth}>
                로그인 후 코멘트
              </button>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
