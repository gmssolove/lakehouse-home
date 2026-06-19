'use client';

import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import type { SitePost } from '@/lib/types/site-content';
import type { User } from 'firebase/auth';

type Props = {
  items: SitePost[];
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  empty: string;
};

export function RecordsDiaryPanel({ items, user, isAdmin, onOpenAuth, empty }: Props) {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) return <div className="page-coming">{empty}</div>;

  return (
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
  );
}
