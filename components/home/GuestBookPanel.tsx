'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { GuestEntry, GuestReply } from '@/lib/types/site-content';
import { newId } from '@/lib/types/site-content';
import { normalizeGuestEntry } from '@/lib/guest/normalize';
import { useAuth } from '@/lib/hooks/useAuth';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import {
  LakeCancelIcon,
  LakeDeleteIcon,
  LakeEditIcon,
  LakeIconToolButton,
  LakeReplyBackIcon,
  LakeSaveIcon,
} from '@/components/ui/LakeActionIcons';
import { LakeSearchField } from '@/components/ui/LakeSearchField';

type Props = {
  guests: GuestEntry[];
  user: User | null;
  isAdmin: boolean;
  onSaveGuests: (next: GuestEntry[]) => Promise<void>;
  onOpenAuth: () => void;
};

const REPLY_COLLAPSE_CHARS = 110;
const REPLY_COLLAPSE_LINES = 3;

function canReply(entry: GuestEntry, user: User | null, isAdmin: boolean) {
  if (!user) return false;
  if (isAdmin) return true;
  return !!entry.authorUid && entry.authorUid === user.uid;
}

function canEditReply(reply: GuestReply, user: User | null, isAdmin: boolean) {
  if (!user) return false;
  if (isAdmin) return true;
  if (reply.isAdmin) return false;
  return !!reply.authorUid && reply.authorUid === user.uid;
}

function canDeleteEntry(entry: GuestEntry, user: User | null, isAdmin: boolean) {
  if (!user) return false;
  if (isAdmin) return true;
  return !!entry.authorUid && entry.authorUid === user.uid;
}

function parseGuestName(name: string): { num: string; nick: string } {
  const m = name.trim().match(/^No\.\s*(\d+)\s*(.*)$/i);
  if (m) {
    const nick = m[2].trim();
    return {
      num: `No. ${m[1]}`,
      nick: !nick || nick === '익명' ? '익명' : nick,
    };
  }
  const nick = name.trim();
  return { num: '', nick: nick || '익명' };
}

function isOwnerReply(reply: GuestReply) {
  return !!(reply.isAdmin || reply.authorName === 'lakehouse' || reply.authorName === '관리자');
}

function resolveOwnerReplyName(guestReplyName: string | undefined, siteNickname: string) {
  const custom = guestReplyName?.trim();
  if (custom) return custom;
  const site = siteNickname.trim();
  if (site) return site;
  return '관리자';
}

function replyDisplayName(
  reply: GuestReply,
  ownerLabel: string,
  user: User | null,
): string {
  if (isOwnerReply(reply)) return ownerLabel;
  if (user && reply.authorUid && reply.authorUid === user.uid) {
    return user.displayName?.trim() || reply.authorName?.trim() || '익명';
  }
  return reply.authorName?.trim() || '익명';
}

function formatGuestDate(date: string) {
  const m = date.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return date;
  return `${m[1]}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}`;
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${mo}.${day}`;
}

const URL_SPLIT_RE = /(https?:\/\/[^\s<]+)/gi;

function normalizeHref(raw: string) {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function linkifyNodes(text: string) {
  const parts = text.split(URL_SPLIT_RE);
  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return <LinkBadge key={`u-${i}`} href={part} />;
    }
    return part ? <span key={`t-${i}`}>{part}</span> : null;
  });
}

function isReplyLong(text: string) {
  return text.length > REPLY_COLLAPSE_CHARS || text.split(/\n/).length > REPLY_COLLAPSE_LINES;
}

function LinkBadge({ href }: { href: string }) {
  return (
    <a
      className="guest-card__link-badge"
      href={normalizeHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M10 14a3.5 3.5 0 0 0 5 .3l1.8-1.8a3.5 3.5 0 0 0-5-5L11 8.3M14 10a3.5 3.5 0 0 0-5-.3L7.2 11.5a3.5 3.5 0 0 0 5 5L13 15.7"
        />
      </svg>
      Link
    </a>
  );
}

function LinkifiedBody({ text, className }: { text: string; className: string }) {
  return <p className={className}>{linkifyNodes(text)}</p>;
}

function ReplyBody({ text }: { text: string }) {
  const long = isReplyLong(text);
  const [expanded, setExpanded] = useState(false);

  if (!long) {
    return <LinkifiedBody text={text} className="guest-card__reply-body" />;
  }

  return (
    <div className="guest-card__reply-clamp">
      <p className={`guest-card__reply-body${expanded ? '' : ' is-clamped'}`}>{linkifyNodes(text)}</p>
      <button type="button" className="guest-card__more" onClick={() => setExpanded((v) => !v)}>
        {expanded ? '접기' : '더 보기'}
      </button>
    </div>
  );
}

function GuestCard({
  guest,
  guests,
  user,
  isAdmin,
  ownerReplyLabel,
  onSaveGuests,
}: {
  guest: GuestEntry;
  guests: GuestEntry[];
  user: User | null;
  isAdmin: boolean;
  ownerReplyLabel: string;
  onSaveGuests: (next: GuestEntry[]) => Promise<void>;
}) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const entry = useMemo(() => normalizeGuestEntry(guest), [guest]);
  const replies = entry.replies ?? [];
  const hidden = !!entry.secret && !isAdmin;
  const { num, nick } = parseGuestName(entry.name);

  const [repliesOpen, setRepliesOpen] = useState(replies.length > 0);
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
      authorName: isAdmin ? ownerReplyLabel : nick === '익명' ? '익명' : nick,
      authorUid: user.uid,
      isAdmin,
      message: trimmed,
      date: todayStamp(),
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
    setRepliesOpen(true);
  }

  return (
    <article className="guest-card" data-guest-id={entry.id}>
      <header className="guest-card__meta">
        {num ? <span className="guest-card__num">{num}</span> : null}
        <span className="guest-card__name">
          {nick}
          {entry.secret ? <SecretLockBadge compact /> : null}
        </span>
        <time className="guest-card__date">{formatGuestDate(entry.date)}</time>
      </header>

      {hidden ? (
        <p className="guest-card__secret">비밀글입니다.</p>
      ) : (
        <>
          <LinkifiedBody text={entry.message} className="guest-card__body" />
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
                  <span className="guest-card__reply-name">
                    {replyDisplayName(reply, ownerReplyLabel, user)}
                  </span>
                  {editable && !editing ? (
                    <div className="guest-card__reply-actions">
                      <LakeIconToolButton label="답변 수정" onClick={() => startEditReply(reply)}>
                        <LakeEditIcon />
                      </LakeIconToolButton>
                      <LakeIconToolButton label="답변 삭제" onClick={() => void deleteReply(reply.id)}>
                        <LakeDeleteIcon />
                      </LakeIconToolButton>
                    </div>
                  ) : null}
                  <time className="guest-card__reply-date">{formatGuestDate(reply.date)}</time>
                </div>
                {editing ? (
                  <div className="guest-card__editor guest-card__editor--inline">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                    <div className="guest-card__reply-edit-tools">
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
                    <ReplyBody text={reply.message} />
                    {reply.imageUrl ? <img src={reply.imageUrl} alt="" className="guest-card__media" /> : null}
                  </>
                )}
              </div>
            );
          })
        : null}

      {allowReply && !composerOpen && !editingReplyId ? (
        <div className="guest-card__post-tools">
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
          <div className="guest-card__reply-edit-tools">
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

function GuestSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
      />
    </svg>
  );
}

export function GuestBookPanel({ guests, user, isAdmin, onSaveGuests, onOpenAuth }: Props) {
  const { guestSettings, saveGuestSettings } = useSiteContent();
  const { profile } = useAuth();
  const { showSaveToast } = useSaveToast();
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');
  const [secret, setSecret] = useState(false);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyNickDraft, setReplyNickDraft] = useState('');
  const [replyNickSaving, setReplyNickSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const guideText = guestSettings.guideText?.trim();
  const siteNickname =
    profile?.nickname?.trim() || user?.displayName?.trim() || user?.email?.split('@')[0] || '';
  const ownerReplyLabel = resolveOwnerReplyName(guestSettings.replyName, siteNickname);

  useEffect(() => {
    setReplyNickDraft(guestSettings.replyName ?? '');
  }, [guestSettings.replyName]);

  const sorted = useMemo(() => {
    const list = [...guests].reverse().map(normalizeGuestEntry);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((g) => {
      if (g.secret && !isAdmin) return false;
      const { nick } = parseGuestName(g.name);
      const replyText = (g.replies ?? []).map((r) => r.message).join(' ');
      return [nick, g.message, replyText].join(' ').toLowerCase().includes(q);
    });
  }, [guests, search, isAdmin]);

  async function saveGuestReplyName() {
    if (!isAdmin || replyNickSaving) return;
    setReplyNickSaving(true);
    try {
      await saveGuestSettings({
        ...guestSettings,
        replyName: replyNickDraft.trim(),
      });
      showSaveToast('방명록 닉네임을 저장했습니다');
    } finally {
      setReplyNickSaving(false);
    }
  }

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
      const name = `No. ${count} ${rawName || '익명'}`;
      const entry: GuestEntry = {
        id: newId(),
        name,
        message: trimmed,
        date: todayStamp(),
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
      <div className="guest-headbar">
        <h2 className="page-heading">Guest</h2>
        {isAdmin ? (
          <button
            type="button"
            className={`guest-settings-btn${settingsOpen ? ' is-open' : ''}`}
            aria-label="방명록 설정"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <GuestSettingsIcon />
          </button>
        ) : null}
      </div>
      <div className="page-sub">방명록</div>

      {isAdmin && settingsOpen ? (
        <div className="guest-reply-nick">
          <label className="guest-reply-nick__label" htmlFor="guest-reply-nick-input">
            방명록 닉네임
          </label>
          <div className="guest-reply-nick__row">
            <input
              id="guest-reply-nick-input"
              value={replyNickDraft}
              onChange={(e) => setReplyNickDraft(e.target.value)}
              placeholder={siteNickname || '닉네임'}
              disabled={replyNickSaving}
            />
            <button
              type="button"
              className="guest-composer__submit"
              onClick={() => void saveGuestReplyName()}
              disabled={replyNickSaving}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}

      <div className="guest-toolbar guest-toolbar--top">
        <LakeSearchField
          variant="line"
          wrapClassName="guest-toolbar__search-field"
          placeholder="검색"
          value={search}
          onChange={setSearch}
        />
      </div>

      {guideText ? (
        <div className="guest-guide">
          <div className="guest-guide__inner">{guideText}</div>
        </div>
      ) : null}

      <div id="guest-form-inner" className="guest-composer guest-composer--boxed">
        <div className="guest-composer__label">방명록 남기기</div>
        <div className="guest-composer__field">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 (비우면 익명)"
            disabled={submitting}
          />
        </div>
        <div className="guest-composer__field">
          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="남기고 싶은 말을 적어주세요"
            disabled={submitting}
          />
        </div>
        <div className="guest-composer__row">
          <label className="guest-composer__secret">
            <span className={`guest-composer__box${secret ? ' is-on' : ''}`} aria-hidden />
            <input
              type="checkbox"
              checked={secret}
              onChange={(e) => setSecret(e.target.checked)}
              disabled={submitting}
            />
            비밀글
          </label>
          <button
            type="button"
            className="guest-composer__submit"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            남기기
          </button>
        </div>
      </div>

      <div className="guest-section-label">방명록 ({guests.length})</div>

      <div id="guest-list">
        {!sorted.length ? (
          <div className="guest-empty">— 아직 방명록이 없습니다 —</div>
        ) : (
          sorted.map((g) => (
            <GuestCard
              key={g.id}
              guest={g}
              guests={guests}
              user={user}
              isAdmin={isAdmin}
              ownerReplyLabel={ownerReplyLabel}
              onSaveGuests={onSaveGuests}
            />
          ))
        )}
      </div>
    </div>
  );
}
