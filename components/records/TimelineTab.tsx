'use client';

import { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useSaveToast } from '@/components/ui/SaveToast';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { uploadImageFile } from '@/lib/r2/client';
import { normalizeUploadFile } from '@/lib/r2/mime';
import { newId, type TimelinePost, type TimelineReply } from '@/lib/types/site-content';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

type SearchMode = 'all' | 'body';
type ReactionKey = 'like' | 'heart';

function formatDate(d: string) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${mm}.${dd} ${hh}:${min}`;
}

function reactionCounts(post: TimelinePost) {
  const map = post.userReactions ?? {};
  let like = 0;
  let heart = 0;
  for (const v of Object.values(map)) {
    if (v === 'like') like += 1;
    else if (v === 'heart') heart += 1;
  }
  return { like, heart };
}

function IconReply() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M2.5 3.5h9a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H6.5L3.5 13V9.5h-1a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function IconThumb() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M4.5 7.2V13h-1.8a.8.8 0 0 1-.8-.8V8a.8.8 0 0 1 .8-.8h1.8Zm0 0 2.2-3.4a1.2 1.2 0 0 1 1.2-.5l.1 3.9h2.6a1.2 1.2 0 0 1 1.2 1.4l-.7 3.4a1.2 1.2 0 0 1-1.2.9H4.5" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M8 13.2S3.8 10.2 3.8 6.8A2.4 2.4 0 0 1 8 4.9a2.4 2.4 0 0 1 4.2 1.9c0 3.4-4.2 6.3-4.2 6.3Z" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
      <circle cx="6" cy="7" r="1" />
      <path d="m3.5 11 2.5-2.5 2 2 2.5-3 2 2.5" />
    </svg>
  );
}

async function uploadTimelineImage(file: File) {
  const normalized = normalizeUploadFile(file);
  try {
    return await uploadImageFile(normalized, 'site/timeline');
  } catch (err) {
    const legacy = typeof window !== 'undefined' ? window.LakeR2Upload : undefined;
    if (legacy?.uploadFile) return legacy.uploadFile(normalized, 'site/timeline');
    throw err;
  }
}

export function TimelineTab({ user, isAdmin, onOpenAuth }: Props) {
  const { timeline, saveTimeline } = useSiteContent();
  const { showSaveToast } = useSaveToast();
  const [activeTag, setActiveTag] = useState('전체');
  const [searchMode, setSearchMode] = useState<SearchMode>('all');
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [attachUrl, setAttachUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    return timeline.filter((p) => {
      if (p.secret && !isAdmin) return false;
      if (activeTag !== '전체' && !(p.tags ?? []).includes(activeTag)) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      if (searchMode === 'body') return (p.body || '').toLowerCase().includes(q);
      const hay = [p.body, p.authorName, ...(p.tags ?? [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [timeline, isAdmin, activeTag, query, searchMode]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    timeline.forEach((p) => {
      if (p.secret && !isAdmin) return;
      (p.tags ?? []).forEach((t) => map.set(t, (map.get(t) || 0) + 1));
    });
    return map;
  }, [timeline, isAdmin]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    timeline.forEach((p) => (p.tags ?? []).forEach((t) => set.add(t)));
    return ['전체', ...Array.from(set)];
  }, [timeline]);

  async function persist(next: TimelinePost[]) {
    await saveTimeline(next);
  }

  async function pickAttach(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setAttachUrl(await uploadTimelineImage(file));
      showSaveToast();
    } catch (err) {
      alert(err instanceof Error ? err.message : '이미지 업로드 실패');
    } finally {
      setUploading(false);
    }
  }

  async function submitPost() {
    if (!user) {
      onOpenAuth();
      return;
    }
    const text = body.trim();
    if (!text && !attachUrl.trim()) return;
    const post: TimelinePost = {
      id: newId(),
      authorName: user.displayName || user.email?.split('@')[0] || '익명',
      authorUid: user.uid,
      body: text,
      tags: tagInput
        .split(/[,，、#]/)
        .map((s) => s.trim())
        .filter(Boolean),
      imageUrl: attachUrl.trim() || undefined,
      date: new Date().toISOString(),
      replies: [],
      userReactions: {},
    };
    await persist([post, ...timeline]);
    setBody('');
    setAttachUrl('');
    showSaveToast();
  }

  async function addReply(postId: string) {
    if (!user) {
      onOpenAuth();
      return;
    }
    const text = (replyDraft[postId] || '').trim();
    if (!text) return;
    const reply: TimelineReply = {
      id: newId(),
      authorName: user.displayName || '익명',
      authorUid: user.uid,
      body: text,
      date: new Date().toISOString(),
    };
    await persist(
      timeline.map((p) => (p.id === postId ? { ...p, replies: [...(p.replies ?? []), reply] } : p)),
    );
    setReplyDraft((d) => ({ ...d, [postId]: '' }));
    setReplyOpen((o) => ({ ...o, [postId]: true }));
    showSaveToast();
  }

  async function react(postId: string, key: ReactionKey) {
    if (!user) {
      onOpenAuth();
      return;
    }
    await persist(
      timeline.map((p) => {
        if (p.id !== postId) return p;
        const userReactions = { ...(p.userReactions ?? {}) };
        const cur = userReactions[user.uid];
        if (cur === key) delete userReactions[user.uid];
        else userReactions[user.uid] = key;
        return { ...p, userReactions };
      }),
    );
  }

  function renderAvatar(post: TimelinePost) {
    if (post.authorAvatarUrl) {
      return <img src={post.authorAvatarUrl} alt="" className="lh-timeline-post__av lh-timeline-post__av--img" />;
    }
    return <span className="lh-timeline-post__av">{post.authorName[0] || '?'}</span>;
  }

  return (
    <div className="lh-timeline">
      <div className="lh-timeline__search">
        <div className="lh-timeline__search-modes" role="tablist" aria-label="검색 범위">
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'all'}
            className={`lh-timeline__search-mode${searchMode === 'all' ? ' is-active' : ''}`}
            onClick={() => setSearchMode('all')}
          >
            전체
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'body'}
            className={`lh-timeline__search-mode${searchMode === 'body' ? ' is-active' : ''}`}
            onClick={() => setSearchMode('body')}
          >
            내용
          </button>
        </div>
        <input
          className="lh-timeline__search-input"
          placeholder="검색어를 입력하세요"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="lh-timeline__tags">
        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`lh-timeline__tag${activeTag === tag ? ' is-active' : ''}`}
            onClick={() => setActiveTag(tag)}
          >
            {tag}
            {tag !== '전체' && tagCounts.get(tag) ? ` (${tagCounts.get(tag)})` : ''}
          </button>
        ))}
      </div>

      <div className="lh-timeline__composer">
        <textarea
          className="lh-timeline__composer-input"
          placeholder="글 입력…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        {attachUrl ? (
          <div className="lh-timeline__attach-preview">
            <img src={attachUrl} alt="" />
            <button type="button" onClick={() => setAttachUrl('')}>
              제거
            </button>
          </div>
        ) : null}
        <div className="lh-timeline__composer-tools">
          <button
            type="button"
            className="lh-timeline__tool"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            aria-label="이미지 추가"
          >
            <IconImage />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pickAttach(e.target.files?.[0])}
          />
          <input
            className="lh-timeline__tag-input"
            placeholder="태그 (쉼표)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
          <button type="button" className="lh-timeline__submit" onClick={() => void submitPost()} disabled={uploading}>
            등록
          </button>
        </div>
      </div>

      <div className="lh-timeline__feed">
        {!visible.length ? <div className="page-coming">— 글이 없습니다 —</div> : null}
        {visible.map((post) => {
          const counts = reactionCounts(post);
          const myReaction = user?.uid ? post.userReactions?.[user.uid] : undefined;
          return (
            <article key={post.id} className="lh-timeline-post">
              <header className="lh-timeline-post__head">
                {renderAvatar(post)}
                <div>
                  <strong>{post.authorName}</strong>
                  <time>{formatDate(post.date)}</time>
                </div>
              </header>
              {post.body ? <p className="lh-timeline-post__body">{post.body}</p> : null}
              {post.imageUrl ? <img src={post.imageUrl} alt="" className="lh-timeline-post__img" /> : null}
              {post.tags?.length ? (
                <div className="lh-timeline-post__tags">
                  {post.tags.map((t) => (
                    <span key={t} className="lh-timeline-post__pill">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="lh-timeline-post__actions">
                <button type="button" onClick={() => setReplyOpen((o) => ({ ...o, [post.id]: !o[post.id] }))}>
                  <IconReply /> {(post.replies ?? []).length}
                </button>
                <button
                  type="button"
                  className={myReaction === 'like' ? 'is-on' : ''}
                  onClick={() => void react(post.id, 'like')}
                >
                  <IconThumb /> {counts.like || null}
                </button>
                <button
                  type="button"
                  className={myReaction === 'heart' ? 'is-on' : ''}
                  onClick={() => void react(post.id, 'heart')}
                >
                  <IconHeart /> {counts.heart || null}
                </button>
              </div>
              {replyOpen[post.id] ? (
                <div className="lh-timeline-post__replies">
                  {(post.replies ?? []).map((r) => (
                    <div key={r.id} className="lh-timeline-post__reply">
                      <strong>{r.authorName}</strong>
                      <span>{r.body}</span>
                    </div>
                  ))}
                  <div className="lh-timeline-post__reply-form">
                    <input
                      placeholder="답글…"
                      value={replyDraft[post.id] || ''}
                      onChange={(e) => setReplyDraft((d) => ({ ...d, [post.id]: e.target.value }))}
                    />
                    <button type="button" onClick={() => void addReply(post.id)}>
                      답글
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
