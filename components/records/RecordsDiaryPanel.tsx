'use client';

import { useState } from 'react';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useSaveToast } from '@/components/ui/SaveToast';
import { newId, type SitePost } from '@/lib/types/site-content';
import type { User } from 'firebase/auth';

type Props = {
  items: SitePost[];
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onSave: (next: SitePost[]) => Promise<void>;
  empty: string;
};

export function RecordsDiaryPanel({ items, user, isAdmin, onOpenAuth, onSave, empty }: Props) {
  const { showSaveToast } = useSaveToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));

  async function submit() {
    if (!isAdmin) return;
    const t = title.trim();
    const b = body.trim();
    if (!t && !b) return;
    const post: SitePost = {
      id: newId(),
      title: t || '무제',
      body: b,
      date: date || new Date().toISOString().slice(0, 10),
    };
    await onSave([post, ...items]);
    setTitle('');
    setBody('');
    showSaveToast();
  }

  return (
    <>
      {isAdmin ? (
        <section className="lh-records-composer">
          <h3 className="lh-records-composer__title">새 일기</h3>
          <input
            className="form-input"
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="form-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <textarea
            className="form-input"
            rows={5}
            placeholder="내용"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="lh-records-composer__actions">
            <button type="button" className="btn-save" onClick={() => void submit()}>
              등록
            </button>
          </div>
        </section>
      ) : null}

      {!sorted.length ? <div className="page-coming">{empty}</div> : null}

      <div className="lh-diary-list">
        {sorted.map((item) => (
          <SecretItemGate
            key={item.id}
            scope="diary"
            item={item}
            isAdmin={isAdmin}
            loggedIn={!!user}
            onRequestLogin={onOpenAuth}
          >
            <article className="lh-diary-card">
              <header className="lh-diary-card__head">
                <h3>
                  {item.title}
                  {item.secret ? <SecretLockBadge compact /> : null}
                </h3>
                <time>{item.date}</time>
              </header>
              <div className="lh-diary-card__body">{item.body}</div>
            </article>
          </SecretItemGate>
        ))}
      </div>
    </>
  );
}
