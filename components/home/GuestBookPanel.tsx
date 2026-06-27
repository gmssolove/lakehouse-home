'use client';

import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { GuestEntry, GuestReply } from '@/lib/types/site-content';
import { newId } from '@/lib/types/site-content';
import { normalizeGuestEntry } from '@/lib/guest/normalize';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import {
  LakeCancelIcon,
  LakeDeleteIcon,
  LakeEditIcon,
  LakeIconToolButton,
  LakeReplyArrowIcon,
  LakeReplyBackIcon,
  LakeSaveIcon,
} from '@/components/ui/LakeActionIcons';

const ADMIN_REPLY_NAME = 'lakehouse';

type Props = {
  guests: GuestEntry[];
  user: User | null;
  isAdmin: boolean;
  onSaveGuests: (next: GuestEntry[]) => Promise<void>;
  onOpenAuth: () => void;
};

function canReply(entry: GuestEntry, user: User | null, isAdmin: boolean) {
  if (!user) return false;
  if (isAdmin) return true;
  return !!entry.authorUid && entry.authorUid === user.uid;
}

function canEditReply(reply: GuestReply, user: User | null, isAdmin: boolean) {
  if (!user) return false;
  if (isAdmin) return true;
  return !!reply.authorUid && reply.authorUid === user.uid;
}

function canDeleteEntry(entry: GuestEntry, user: User | null, isAdmin: boolean) {
  if (!user) return false;
  if (isAdmin) return true;
  return !!entry.authorUid && entry.authorUid === user.uid;
}

function GuestCard({
  guest,
  guests,
  user,
  isAdmin,
  onSaveGuests,
}: {
  guest: GuestEntry;
  guests: GuestEntry[];
  user: User | null;
  isAdmin: boolean;
  onSaveGuests: (next: GuestEntry[]) => Promise<void>;
}) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const entry = useMemo(() => normalizeGuestEntry(guest), [guest]);
  const replies = entry.replies ?? [];
  const hidden = !!entry.secret && !isAdmin;

  const [repliesOpen, setRepliesOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const allowReply = canReply(entry, user, isAdmin);

  async function persistEntry(nextEntry: GuestEntry) {
    await onSaveGuests(guests.map((g) => (g.id === entry.id ? nextEntry : g)));
  }

  async function addReply() {
    const trimmed = composerText.trim();
    if (!trimmed || !user) return;
    const reply: GuestReply = {
      id: newId(),
      authorName: isAdmin ? ADMIN_REPLY_NAME : entry.name.split(' ').slice(2).join(' ') || entry.name,
      authorUid: user.uid,
      isAdmin,
      message: trimmed,
      date: new Date().toLocaleDateString('ko-KR'),
    };
    await persistEntry({ ...entry, replies: [...replies, reply] });
    setComposerText('');
    setComposerOpen(false);
    setRepliesOpen(true);
    showSaveToast();
  }

  async function saveReplyEdit(replyId: string) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    await persistEntry({
      ...entry,
      replies: replies.map((r) => (r.id === replyId ? { ...r, message: trimmed } : r)),
    });
    setEditingReplyId(null);
    setEditText('');
    showSaveToast();
  }

  async function deleteReply(replyId: string) {
    if (!(await confirm('답변을 삭제할까요?'))) return;
    await persistEntry({ ...entry, replies: replies.filter((r) => r.id !== replyId) });
    showDeleteToast();
  }

  async function deleteGuest() {
    if (!(await confirm('이 방명록을 삭제할까요?'))) return;
    await onSaveGuests(guests.filter((g) => g.id !== entry.id));
    showDeleteToast();
  }

  function openComposer() {
    setComposerText('');
    setComposerOpen(true);
  }

  function startEditReply(reply: GuestReply) {
    setEditingReplyId(reply.id);
    setEditText(reply.message);
    setComposerOpen(false);
  }

  return (
    <article className="guest-card" data-guest-id={entry.id}>
      <header className="guest-card__meta">
        <span className="guest-card__name">
          {entry.name}
          {entry.secret ? <SecretLockBadge compact /> : null}
        </span>
        <time className="guest-card__date">{entry.date}</time>
      </header>

      {hidden ? (
        <p className="guest-card__secret">🔒 비밀글입니다.</p>
      ) : (
        <>
          <p className="guest-card__body">{entry.message}</p>
          {entry.imageUrl ? <img src={entry.imageUrl} alt="" className="guest-card__media" /> : null}
          {entry.videoUrl ? (
            <video src={entry.videoUrl} controls className="guest-card__media guest-card__media--video" />
          ) : null}
        </>
      )}

      {replies.length > 0 ? (
        <button
          type="button"
          className="guest-card__reply-toggle"
          onClick={() => setRepliesOpen((v) => !v)}
          aria-expanded={repliesOpen}
        >
          <span className={`guest-card__reply-chevron${repliesOpen ? ' is-open' : ''}`}>∨</span>
          댓글 {replies.length}
        </button>
      ) : null}

      {repliesOpen
        ? replies.map((reply) => {
            const editable = canEditReply(reply, user, isAdmin);
            const editing = editingReplyId === reply.id;
            return (
              <div key={reply.id} className="guest-card__reply">
                <div className="guest-card__reply-head">
                  <LakeReplyArrowIcon className="guest-card__reply-arrow" />
                  <span className="guest-card__reply-name">
                    {reply.isAdmin ? ADMIN_REPLY_NAME : reply.authorName}
                  </span>
                  <time className="guest-card__reply-date">{reply.date}</time>
                </div>
                {editing ? (
                  <div className="guest-card__editor guest-card__editor--inline">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                    <div className="lake-icon-tools guest-card__icon-tools">
                      <LakeIconToolButton label="저장" onClick={() => void saveReplyEdit(reply.id)}>
                        <LakeSaveIcon />
                      </LakeIconToolButton>
                      <LakeIconToolButton
                        label="취소"
                        onClick={() => {
                          setEditingReplyId(null);
                          setEditText('');
                        }}
                      >
                        <LakeCancelIcon />
                      </LakeIconToolButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="guest-card__reply-body">{reply.message}</p>
                    {reply.imageUrl ? <img src={reply.imageUrl} alt="" className="guest-card__media" /> : null}
                    {editable ? (
                      <div className="lake-icon-tools guest-card__icon-tools">
                        <LakeIconToolButton label="답변 수정" onClick={() => startEditReply(reply)}>
                          <LakeEditIcon />
                        </LakeIconToolButton>
                        <LakeIconToolButton label="답변 삭제" onClick={() => void deleteReply(reply.id)}>
                          <LakeDeleteIcon />
                        </LakeIconToolButton>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );
          })
        : null}

      {allowReply && !composerOpen && !editingReplyId ? (
        <div className="lake-icon-tools guest-card__icon-tools guest-card__icon-tools--post">
          <LakeIconToolButton label="답변 작성" onClick={openComposer}>
            <LakeReplyBackIcon />
          </LakeIconToolButton>
          {canDeleteEntry(entry, user, isAdmin) ? (
            <LakeIconToolButton label="방명록 삭제" onClick={() => void deleteGuest()}>
              <LakeDeleteIcon />
            </LakeIconToolButton>
          ) : null}
        </div>
      ) : null}

      {allowReply && composerOpen ? (
        <div className="guest-card__editor">
          <textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            placeholder={isAdmin ? '관리자 답변을 입력하세요' : '답글을 입력하세요'}
          />
          <div className="lake-icon-tools guest-card__icon-tools">
            <LakeIconToolButton label="저장" onClick={() => void addReply()}>
              <LakeSaveIcon />
            </LakeIconToolButton>
            <LakeIconToolButton
              label="취소"
              onClick={() => {
                setComposerOpen(false);
                setComposerText('');
              }}
            >
              <LakeCancelIcon />
            </LakeIconToolButton>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function GuestBookPanel({ guests, user, isAdmin, onSaveGuests, onOpenAuth }: Props) {
  const { guestSettings } = useSiteContent();
  const { showSaveToast } = useSaveToast();
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');
  const [secret, setSecret] = useState(false);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const guideText = guestSettings.guideText?.trim();

  const sorted = useMemo(() => {
    const list = [...guests].reverse().map(normalizeGuestEntry);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((g) => {
      if (g.secret && !isAdmin) return false;
      return [g.name, g.message].join(' ').toLowerCase().includes(q);
    });
  }, [guests, search, isAdmin]);

  async function handleSubmit() {
    if (!user) {
      showSaveToast('로그인 후 방명록을 작성할 수 있습니다');
      onOpenAuth();
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const count = guests.length + 1;
      const rawName = nickname.trim();
      const name = rawName ? `No. ${count} ${rawName}` : `No. ${count} 익명`;
      const entry: GuestEntry = {
        id: newId(),
        name,
        message: trimmed,
        date: new Date().toLocaleDateString('ko-KR'),
        authorUid: user.uid,
        secret: secret || undefined,
        replies: [],
      };
      await onSaveGuests([...guests, entry]);
      setNickname('');
      setMessage('');
      setSecret(false);
      showSaveToast('방명록이 등록되었습니다');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="guest-container">
      {guideText ? (
        <div className="guest-guide">
          <div className="guest-guide__inner">{guideText}</div>
        </div>
      ) : null}

      <div className="guest-toolbar">
        <input
          className="guest-toolbar__search"
          placeholder="검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div id="guest-list">
        {!sorted.length ? (
          <div className="page-coming">— 아직 방명록이 없습니다 —</div>
        ) : (
          sorted.map((g) => (
            <GuestCard
              key={g.id}
              guest={g}
              guests={guests}
              user={user}
              isAdmin={isAdmin}
              onSaveGuests={onSaveGuests}
            />
          ))
        )}
      </div>

      <div id="guest-form-inner">
        <div className="form-group">
          <label className="form-label">
            닉네임{' '}
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>(비우면 익명)</span>
          </label>
          <input
            className="form-input auth-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 (비우면 익명)"
            disabled={submitting}
          />
        </div>
        <div className="form-group">
          <label className="form-label">메시지</label>
          <textarea
            className="form-input auth-input"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="남기고 싶은 말을 적어주세요"
            disabled={submitting}
          />
        </div>
        <label className="guest-form-secret">
          <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} disabled={submitting} />
          비밀글
        </label>
        <button type="button" className="btn-save" onClick={handleSubmit} disabled={submitting}>
          남기기
        </button>
      </div>
    </div>
  );
}
