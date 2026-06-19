'use client';

import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { User } from 'firebase/auth';

const KIND_LABEL: Record<string, string> = {
  story: '썰',
  rant: '주접',
  impression: '감상',
  novel: '소설',
  other: '기타',
};

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

export function CharArchivePanel({ user, isAdmin, onOpenAuth }: Props) {
  const { charArchive } = useSiteContent();
  const sorted = [...charArchive].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    return <div className="page-coming">— 캐릭터 아카이브가 비어 있습니다 —</div>;
  }

  return (
    <div className="lh-char-archive">
      {sorted.map((item) => (
        <SecretItemGate
          key={item.id}
          scope="charArchive"
          item={item}
          isAdmin={isAdmin}
          loggedIn={!!user}
          onRequestLogin={onOpenAuth}
        >
          <article className="lh-char-archive-card">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt="" className="lh-char-archive-card__cover" />
            ) : null}
            <div className="lh-char-archive-card__body">
              <span className="lh-char-archive-card__kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
              <h3>
                {item.title}
                {item.secret ? <SecretLockBadge compact /> : null}
              </h3>
              <time>{item.date}</time>
              <p>{item.body}</p>
            </div>
          </article>
        </SecretItemGate>
      ))}
    </div>
  );
}
