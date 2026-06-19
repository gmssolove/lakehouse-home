'use client';

import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { User } from 'firebase/auth';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

export function ScrapTab({ user, isAdmin, onOpenAuth }: Props) {
  const { scrap } = useSiteContent();
  const sorted = [...scrap].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    return <div className="page-coming">— 스크랩이 없습니다 —</div>;
  }

  return (
    <div className="lh-scrap-feed">
      {sorted.map((item) => (
        <SecretItemGate
          key={item.id}
          scope="scrap"
          item={item}
          isAdmin={isAdmin}
          loggedIn={!!user}
          onRequestLogin={onOpenAuth}
        >
          <article className="lh-tweet-card">
            <header className="lh-tweet-card__head">
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt="" className="lh-tweet-card__avatar" />
              ) : (
                <span className="lh-tweet-card__avatar lh-tweet-card__avatar--ph">{item.author[0]}</span>
              )}
              <div>
                <strong>
                  {item.author}
                  {item.secret ? <SecretLockBadge compact /> : null}
                </strong>
                {item.handle ? <span className="lh-tweet-card__handle">@{item.handle}</span> : null}
                <time>{item.date}</time>
              </div>
            </header>
            <p className="lh-tweet-card__body">{item.body}</p>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="lh-tweet-card__media" />
            ) : null}
            {item.sourceUrl ? (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="lh-tweet-card__link">
                원문 보기
              </a>
            ) : null}
          </article>
        </SecretItemGate>
      ))}
    </div>
  );
}
