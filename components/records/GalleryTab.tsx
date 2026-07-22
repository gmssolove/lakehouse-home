'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { RecordsWriteShell, useRecordsComposer } from '@/components/records/RecordsWriteShell';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { newId, type GalleryComment, type GalleryCommentReply, type GalleryItem } from '@/lib/types/site-content';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  active?: boolean;
};

function formatGalleryDate(date?: string) {
  if (!date) return '';
  const raw = date.slice(0, 10);
  return raw.replace(/-/g, '.');
}

function authorLabel(user: User) {
  return user.displayName || user.email?.split('@')[0] || 'Guest';
}

function IconComment() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h10M7 11h7M7 15h5M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-4 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
      />
    </svg>
  );
}

function IconHeart({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20s-7-4.35-7-9.2A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 3.2C19 15.65 12 20 12 20z"
      />
    </svg>
  );
}

function GalleryHeartButton({
  liked,
  count,
  onToggle,
  compact,
}: {
  liked: boolean;
  count: number;
  onToggle: () => boolean | Promise<boolean>;
  compact?: boolean;
}) {
  const [pop, setPop] = useState(false);

  return (
    <button
      type="button"
      className={`lh-diary__action lh-diary__action--like${compact ? ' lh-gallery__c-like' : ''}${liked ? ' is-liked' : ''}${pop ? ' is-pop' : ''}`}
      aria-label="좋아요"
      aria-pressed={liked}
      onClick={() => {
        void (async () => {
          const ok = await onToggle();
          if (ok && !liked) setPop(true);
        })();
      }}
    >
      <span className="lh-diary__heart" onAnimationEnd={() => setPop(false)}>
        <IconHeart filled={liked} size={compact ? 14 : 18} />
      </span>
      <em>{count}</em>
    </button>
  );
}

export function GalleryTab({ user, isAdmin, onOpenAuth, active = true }: Props) {
  const { gallery, saveGallery } = useSiteContent();
  const { showSaveToast } = useSaveToast();
  const { confirm } = useLakeDialog();
  const { open, leaving, openComposer, closeComposer, finishClose } = useRecordsComposer();
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [img, setImg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLeaving, setDetailLeaving] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLeaving, setCommentsLeaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const items = useMemo(
    () => [...gallery].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id)),
    [gallery],
  );
  const detail = detailId ? items.find((i) => i.id === detailId) || null : null;

  // 갤러리 상세가 열려 있으면 뒤로가기 시 메뉴 전체가 아니라 상세만 닫는다
  useLakeBackNavigation(active && !!detailId && !detailLeaving, () => closeDetail(), 'gallery-detail');

  useEffect(() => {
    if (active) return;
    setDetailId(null);
    setDetailLeaving(false);
    setCommentsOpen(false);
    setCommentsLeaving(false);
    setCommentDraft('');
    setReplyToId(null);
    setReplyDraft('');
    if (open) closeComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leave Gallery menu
  }, [active]);

  useEffect(() => {
    if (!detailId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, [contenteditable="true"]')) return;
      const idx = items.findIndex((i) => i.id === detailId);
      if (idx < 0) return;
      const next = items[idx + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (!next) return;
      setCommentsOpen(false);
      setCommentsLeaving(false);
      setCommentDraft('');
      setReplyToId(null);
      setReplyDraft('');
      setDetailId(next.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId, items]);

  function resetComposer() {
    setEditingId(null);
    setTitle('');
    setCaption('');
    setImg('');
  }

  function fillComposer(item: GalleryItem) {
    setEditingId(item.id);
    setTitle(item.title || '');
    setCaption(item.caption || '');
    setImg(item.img);
  }

  function handleOpen() {
    resetComposer();
    openComposer();
  }

  function handleCloseFinished() {
    finishClose();
    resetComposer();
  }

  function startEdit(item: GalleryItem) {
    fillComposer(item);
    openComposer();
  }

  function openDetail(id: string) {
    setDetailLeaving(false);
    setCommentsOpen(false);
    setCommentsLeaving(false);
    setCommentDraft('');
    setReplyToId(null);
    setReplyDraft('');
    setDetailId(id);
  }

  /** 상세에서 이전/다음 글로 이동 (#3) */
  function goAdjacent(dir: -1 | 1) {
    if (!detailId) return;
    const idx = items.findIndex((i) => i.id === detailId);
    if (idx < 0) return;
    const next = items[idx + dir];
    if (!next) return;
    setCommentsOpen(false);
    setCommentsLeaving(false);
    setCommentDraft('');
    setReplyToId(null);
    setReplyDraft('');
    setDetailId(next.id);
  }

  function closeDetail() {
    if (!detailId || detailLeaving) return;
    setDetailLeaving(true);
    window.setTimeout(() => {
      setDetailId(null);
      setDetailLeaving(false);
      setCommentsOpen(false);
      setCommentsLeaving(false);
      setCommentDraft('');
      setReplyToId(null);
      setReplyDraft('');
    }, 240);
  }

  function toggleComments() {
    if (commentsLeaving) return;
    if (commentsOpen) {
      setCommentsLeaving(true);
      window.setTimeout(() => {
        setCommentsOpen(false);
        setCommentsLeaving(false);
      }, 220);
      return;
    }
    setCommentsOpen(true);
  }

  async function submit() {
    if (!isAdmin || !img.trim()) return;
    const existing = editingId ? gallery.find((g) => g.id === editingId) : undefined;
    const payload: GalleryItem = {
      id: editingId || newId(),
      title: title.trim(),
      img: img.trim(),
      caption: caption.trim() || undefined,
      date: existing?.date || new Date().toISOString().slice(0, 10),
      likedBy: existing?.likedBy,
      comments: existing?.comments,
    };

    if (editingId) {
      await saveGallery(gallery.map((g) => (g.id === editingId ? { ...g, ...payload, id: editingId } : g)));
    } else {
      await saveGallery([payload, ...gallery]);
    }
    closeComposer();
    showSaveToast();
  }

  async function removeItem(item: GalleryItem) {
    if (!isAdmin) return;
    if (!(await confirm('이 사진을 삭제할까요?'))) return;
    await saveGallery(gallery.filter((g) => g.id !== item.id));
    if (detailId === item.id) {
      setDetailId(null);
      setDetailLeaving(false);
      setCommentsOpen(false);
      setCommentsLeaving(false);
      setCommentDraft('');
      setReplyToId(null);
      setReplyDraft('');
    }
    if (editingId === item.id) closeComposer();
    showSaveToast();
  }

  async function toggleLike(item: GalleryItem) {
    if (!user) {
      onOpenAuth();
      return false;
    }
    const likedBy = item.likedBy || [];
    const next = likedBy.includes(user.uid)
      ? likedBy.filter((uid) => uid !== user.uid)
      : [...likedBy, user.uid];
    await saveGallery(gallery.map((g) => (g.id === item.id ? { ...g, likedBy: next } : g)));
    return true;
  }

  async function addComment(item: GalleryItem) {
    if (!user || !commentDraft.trim()) return;
    const comment: GalleryComment = {
      id: newId(),
      author: authorLabel(user),
      authorUid: user.uid,
      body: commentDraft.trim(),
      date: new Date().toISOString().slice(0, 10),
      likedBy: [],
      replies: [],
    };
    await saveGallery(
      gallery.map((g) => (g.id === item.id ? { ...g, comments: [...(g.comments ?? []), comment] } : g)),
    );
    setCommentDraft('');
    setCommentsOpen(true);
  }

  function patchComments(itemId: string, mapFn: (comments: GalleryComment[]) => GalleryComment[]) {
    return saveGallery(
      gallery.map((g) => (g.id === itemId ? { ...g, comments: mapFn(g.comments ?? []) } : g)),
    );
  }

  async function removeComment(item: GalleryItem, commentId: string) {
    const target = (item.comments ?? []).find((c) => c.id === commentId);
    if (!target) return;
    if (!isAdmin && !(user && target.authorUid === user.uid)) return;
    if (!(await confirm('이 댓글을 삭제할까요?'))) return;
    await patchComments(item.id, (list) => list.filter((c) => c.id !== commentId));
    if (replyToId === commentId) {
      setReplyToId(null);
      setReplyDraft('');
    }
  }

  async function toggleCommentLike(item: GalleryItem, commentId: string) {
    if (!user) {
      onOpenAuth();
      return false;
    }
    await patchComments(item.id, (list) =>
      list.map((c) => {
        if (c.id !== commentId) return c;
        const likedBy = c.likedBy || [];
        const next = likedBy.includes(user.uid)
          ? likedBy.filter((uid) => uid !== user.uid)
          : [...likedBy, user.uid];
        return { ...c, likedBy: next };
      }),
    );
    return true;
  }

  async function addReply(item: GalleryItem, commentId: string) {
    if (!user || !replyDraft.trim()) return;
    const reply: GalleryCommentReply = {
      id: newId(),
      author: authorLabel(user),
      authorUid: user.uid,
      body: replyDraft.trim(),
      date: new Date().toISOString().slice(0, 10),
      likedBy: [],
    };
    await patchComments(item.id, (list) =>
      list.map((c) =>
        c.id === commentId ? { ...c, replies: [...(c.replies ?? []), reply] } : c,
      ),
    );
    setReplyDraft('');
    setReplyToId(null);
  }

  async function removeReply(item: GalleryItem, commentId: string, replyId: string) {
    const parent = (item.comments ?? []).find((c) => c.id === commentId);
    const reply = parent?.replies?.find((r) => r.id === replyId);
    if (!reply) return;
    if (!isAdmin && !(user && reply.authorUid === user.uid)) return;
    if (!(await confirm('이 답글을 삭제할까요?'))) return;
    await patchComments(item.id, (list) =>
      list.map((c) =>
        c.id === commentId
          ? { ...c, replies: (c.replies ?? []).filter((r) => r.id !== replyId) }
          : c,
      ),
    );
  }

  async function toggleReplyLike(item: GalleryItem, commentId: string, replyId: string) {
    if (!user) {
      onOpenAuth();
      return false;
    }
    await patchComments(item.id, (list) =>
      list.map((c) => {
        if (c.id !== commentId) return c;
        return {
          ...c,
          replies: (c.replies ?? []).map((r) => {
            if (r.id !== replyId) return r;
            const likedBy = r.likedBy || [];
            const next = likedBy.includes(user.uid)
              ? likedBy.filter((uid) => uid !== user.uid)
              : [...likedBy, user.uid];
            return { ...r, likedBy: next };
          }),
        };
      }),
    );
    return true;
  }

  const composer = (
    <RecordsWriteShell
      heading="Gallery"
      sub="갤러리"
      isAdmin={isAdmin}
      headless={!!detail}
      writeLabel="+ 새 사진"
      modalLabel="갤러리 등록"
      modalTitle={editingId ? '사진 수정' : '새 사진'}
      open={open}
      leaving={leaving}
      onOpen={handleOpen}
      onClose={closeComposer}
      onCloseFinished={handleCloseFinished}
      footer={
        <>
          <button type="button" className="lh-diary__pill lh-diary__pill--ghost" onClick={closeComposer}>
            취소
          </button>
          <button
            type="button"
            className="lh-diary__pill"
            onClick={() => void submit()}
            disabled={uploading || !img.trim()}
          >
            {editingId ? '저장' : '등록'}
          </button>
        </>
      }
    >
      <ImageFileField
        label="사진"
        value={img}
        folder="site/gallery"
        uploading={uploading}
        onUploadStart={() => setUploading(true)}
        onUploadEnd={() => setUploading(false)}
        onChange={setImg}
      />
      <input placeholder="제목 (선택)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        rows={3}
        placeholder="코멘트 (선택)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
    </RecordsWriteShell>
  );

  if (detail) {
    const titleText = detail.title?.trim() || '';
    const likedBy = detail.likedBy || [];
    const liked = !!user && likedBy.includes(user.uid);
    const comments = detail.comments ?? [];
    const detailIndex = items.findIndex((i) => i.id === detail.id);
    const hasPrev = detailIndex > 0;
    const hasNext = detailIndex >= 0 && detailIndex < items.length - 1;

    return (
      <div
        key="gallery-detail-view"
        className={`lh-gallery lh-gallery--detail${detailLeaving ? ' is-out' : ' is-in'}`}
      >
        <div className="lh-gallery__detail-top">
          <button type="button" className="lh-gallery__back" onClick={closeDetail}>
            ← 목록으로
          </button>
          <div className="lh-gallery__detail-nav">
            <button
              type="button"
              className="lh-gallery__nav-btn"
              onClick={() => goAdjacent(-1)}
              disabled={!hasPrev}
              aria-label="이전 글"
            >
              ‹ 이전
            </button>
            <button
              type="button"
              className="lh-gallery__nav-btn"
              onClick={() => goAdjacent(1)}
              disabled={!hasNext}
              aria-label="다음 글"
            >
              다음 ›
            </button>
          </div>
          {isAdmin ? (
            <div className="lh-gallery__detail-tools">
              <button type="button" className="lh-diary__pill lh-diary__pill--ghost" onClick={() => startEdit(detail)}>
                수정
              </button>
              <button
                type="button"
                className="lh-diary__pill lh-diary__pill--ghost"
                onClick={() => void removeItem(detail)}
              >
                삭제
              </button>
            </div>
          ) : null}
        </div>

        <article className="lh-gallery__detail">
          <div className="lh-gallery__detail-media">
            {detail.img?.trim() ? <img src={detail.img} alt={titleText || ''} /> : null}
          </div>
          {titleText ? <h2 className="lh-gallery__detail-title">{titleText}</h2> : null}
          {detail.date ? <p className="lh-gallery__detail-date">{formatGalleryDate(detail.date)}</p> : null}
          {detail.caption ? <p className="lh-gallery__detail-comment">{detail.caption}</p> : null}

          <footer className="lh-gallery__detail-foot">
            <button
              type="button"
              className={`lh-diary__action${commentsOpen && !commentsLeaving ? ' is-on' : ''}`}
              aria-label="댓글"
              aria-pressed={commentsOpen && !commentsLeaving}
              onClick={toggleComments}
            >
              <IconComment />
              <em>{comments.length}</em>
            </button>
            <GalleryHeartButton
              liked={liked}
              count={likedBy.length}
              onToggle={() => toggleLike(detail)}
            />
          </footer>

          {commentsOpen ? (
            <div className={`lh-gallery__comments${commentsLeaving ? ' is-out' : ' is-in'}`}>
              <div className="lh-gallery__comments-title">COMMENT</div>

              {comments.length ? (
                <div className="lh-gallery__comments-list">
                  {comments.map((c) => {
                    const canDelete =
                      isAdmin || (!!user && c.authorUid === user.uid);
                    const cLikedBy = c.likedBy || [];
                    const cLiked = !!user && cLikedBy.includes(user.uid);
                    const replies = c.replies ?? [];
                    const replyOpen = replyToId === c.id;

                    return (
                      <article key={c.id} className="lh-gallery__comment">
                        <header className="lh-gallery__comment-head">
                          <strong>{c.author}</strong>
                          <time>{formatGalleryDate(c.date)}</time>
                          {canDelete ? (
                            <button
                              type="button"
                              className="lh-gallery__comment-del"
                              onClick={() => void removeComment(detail, c.id)}
                            >
                              삭제
                            </button>
                          ) : null}
                        </header>
                        <p>{c.body}</p>
                        <div className="lh-gallery__comment-actions">
                          <button
                            type="button"
                            className={`lh-gallery__c-reply-btn${replyOpen ? ' is-on' : ''}`}
                            onClick={() => {
                              if (!user) {
                                onOpenAuth();
                                return;
                              }
                              setReplyToId((cur) => (cur === c.id ? null : c.id));
                              setReplyDraft('');
                            }}
                          >
                            답글
                          </button>
                          <GalleryHeartButton
                            compact
                            liked={cLiked}
                            count={cLikedBy.length}
                            onToggle={() => toggleCommentLike(detail, c.id)}
                          />
                        </div>

                        {replies.length ? (
                          <div className="lh-gallery__replies">
                            {replies.map((r) => {
                              const canDelReply =
                                isAdmin || (!!user && r.authorUid === user.uid);
                              const rLikedBy = r.likedBy || [];
                              const rLiked = !!user && rLikedBy.includes(user.uid);
                              return (
                                <article key={r.id} className="lh-gallery__reply is-in">
                                  <header className="lh-gallery__comment-head">
                                    <strong>{r.author}</strong>
                                    <time>{formatGalleryDate(r.date)}</time>
                                    {canDelReply ? (
                                      <button
                                        type="button"
                                        className="lh-gallery__comment-del"
                                        onClick={() => void removeReply(detail, c.id, r.id)}
                                      >
                                        삭제
                                      </button>
                                    ) : null}
                                  </header>
                                  <p>{r.body}</p>
                                  <div className="lh-gallery__comment-actions">
                                    <GalleryHeartButton
                                      compact
                                      liked={rLiked}
                                      count={rLikedBy.length}
                                      onToggle={() => toggleReplyLike(detail, c.id, r.id)}
                                    />
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : null}

                        {replyOpen ? (
                          <div className="lh-gallery__reply-form is-in">
                            <input
                              type="text"
                              placeholder={`${c.author}님에게 답글...`}
                              value={replyDraft}
                              onChange={(e) => setReplyDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && replyDraft.trim()) {
                                  e.preventDefault();
                                  void addReply(detail, c.id);
                                }
                              }}
                              autoFocus
                            />
                            <div className="lh-gallery__reply-form-actions">
                              <button
                                type="button"
                                className="lh-gallery__comment-cancel"
                                onClick={() => {
                                  setReplyToId(null);
                                  setReplyDraft('');
                                }}
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                className="lh-gallery__comment-submit"
                                disabled={!replyDraft.trim()}
                                onClick={() => void addReply(detail, c.id)}
                              >
                                등록
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="lh-gallery__comments-empty">아직 댓글이 없습니다</p>
              )}

              {user ? (
                <div className="lh-gallery__comment-form">
                  <input
                    type="text"
                    placeholder="댓글 작성..."
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && commentDraft.trim()) {
                        e.preventDefault();
                        void addComment(detail);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="lh-gallery__comment-submit"
                    disabled={!commentDraft.trim()}
                    onClick={() => void addComment(detail)}
                  >
                    등록
                  </button>
                </div>
              ) : (
                <button type="button" className="lh-gallery__comment-login" onClick={onOpenAuth}>
                  로그인 후 댓글
                </button>
              )}
            </div>
          ) : null}
        </article>

        {isAdmin && open ? composer : null}
      </div>
    );
  }

  return (
    <div key="gallery-list-view" className="lh-gallery">
      {composer}

      {!items.length ? <div className="page-coming">— 사진이 없습니다 —</div> : null}

      <div className="lh-gallery__grid">
        {items.map((item) => {
          const hasTitle = Boolean(item.title?.trim());
          return (
            <SecretItemGate
              key={item.id}
              scope="gallery"
              item={item}
              isAdmin={isAdmin}
              loggedIn={!!user}
              onRequestLogin={onOpenAuth}
            >
              <button
                type="button"
                className={`lh-gallery__thumb${hasTitle ? '' : ' is-notitle'}`}
                onClick={() => openDetail(item.id)}
              >
                {item.img?.trim() ? (
                  <img src={item.img} alt={item.title?.trim() || ''} loading="lazy" decoding="async" />
                ) : (
                  <span className="lh-gallery__thumb-empty" aria-hidden="true" />
                )}
                <span className="lh-gallery__scrim">
                  {hasTitle ? <span className="lh-gallery__cap">{item.title!.trim()}</span> : null}
                </span>
              </button>
            </SecretItemGate>
          );
        })}
      </div>
    </div>
  );
}
