'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import type { GuestEntry } from '@/lib/types/site-content';
import { newId } from '@/lib/types/site-content';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';

type Props = {
  guests: GuestEntry[];
  user: User | null;
  isAdmin: boolean;
  onSaveGuests: (next: GuestEntry[]) => Promise<void>;
  onOpenAuth: () => void;
};

function GuestBubble({
  guest,
  guests,
  isAdmin,
  onSaveGuests,
}: {
  guest: GuestEntry;
  guests: GuestEntry[];
  isAdmin: boolean;
  onSaveGuests: (next: GuestEntry[]) => Promise<void>;
}) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [replyText, setReplyText] = useState(guest.reply || '');

  async function saveReply() {
    const trimmed = replyText.trim();
    const next = guests.map((g) =>
      g.id === guest.id ? { ...g, reply: trimmed || undefined } : g,
    );
    await onSaveGuests(next);
    setEditorOpen(false);
    showSaveToast();
  }

  async function deleteReply() {
    if (!(await confirm('답변을 삭제할까요?'))) return;
    const next = guests.map((g) => (g.id === guest.id ? { ...g, reply: undefined } : g));
    await onSaveGuests(next);
    showDeleteToast();
  }

  async function deleteGuest() {
    if (!(await confirm('이 방명록을 삭제할까요?'))) return;
    await onSaveGuests(guests.filter((g) => g.id !== guest.id));
    showDeleteToast();
  }

  function openEditor() {
    setReplyText(guest.reply || '');
    setEditorOpen(true);
  }

  return (
    <div className="guest-bubble" data-guest-id={guest.id}>
      <div className="guest-bubble-head">
        <span>{guest.name}</span>
        <span className="guest-bubble-date">{guest.date}</span>
        {isAdmin ? (
          <span className="guest-actions">
            <button type="button" onClick={openEditor}>
              {guest.reply ? '답변 수정' : '답변'}
            </button>
            {guest.reply ? (
              <button type="button" onClick={() => void deleteReply()}>
                답변 삭제
              </button>
            ) : null}
            <button type="button" onClick={() => void deleteGuest()}>
              삭제
            </button>
          </span>
        ) : null}
      </div>
      <div className="guest-bubble-msg">{guest.message}</div>
      {guest.reply ? <div className="guest-reply">{guest.reply}</div> : null}
      {isAdmin && editorOpen ? (
        <div className="guest-reply-editor">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="관리자 답변을 입력하세요"
          />
          <div className="guest-reply-editor-actions">
            <button type="button" onClick={() => setEditorOpen(false)}>
              취소
            </button>
            <button type="button" onClick={() => void saveReply()}>
              저장
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GuestBookPanel({ guests, user, isAdmin, onSaveGuests, onOpenAuth }: Props) {
  const { alert } = useLakeDialog();
  const { showSaveToast } = useSaveToast();
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sorted = [...guests].reverse();

  async function handleSubmit() {
    if (!user) {
      await alert('로그인 후 방명록을 작성할 수 있습니다.', '알림');
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
      };
      await onSaveGuests([...guests, entry]);
      setNickname('');
      setMessage('');
      showSaveToast('방명록이 등록되었습니다');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="guest-container">
      <div id="guest-list">
        {!sorted.length ? (
          <div className="page-coming">— 아직 방명록이 없습니다 —</div>
        ) : (
          sorted.map((g) => (
            <GuestBubble
              key={g.id}
              guest={g}
              guests={guests}
              isAdmin={isAdmin}
              onSaveGuests={onSaveGuests}
            />
          ))
        )}
      </div>

      {!user ? (
        <div id="guest-login-notice">방명록 작성은 로그인 후 가능합니다.</div>
      ) : null}

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
        <button
          type="button"
          className="btn-save"
          onClick={handleSubmit}
          disabled={submitting}
        >
          남기기
        </button>
      </div>
    </div>
  );
}
