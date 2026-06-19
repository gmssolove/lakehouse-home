'use client';

import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { HomePageId } from '@/components/layout/LeftNav';
import { GuestBookPanel } from '@/components/home/GuestBookPanel';
import { BannerTile } from '@/components/home/BannerTile';
import { TrpgScenarioList } from '@/components/home/TrpgScenarioList';
import { RecordsDiaryPanel } from '@/components/records/RecordsDiaryPanel';
import { ScrapTab } from '@/components/records/ScrapTab';
import { ReviewTab } from '@/components/records/ReviewTab';
import { MusicArchiveTab } from '@/components/records/MusicArchiveTab';
import { CharArchivePanel } from '@/components/character/CharArchivePanel';
import { MainGameStage } from '@/components/home/MainGameStage';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import type { SitePost } from '@/lib/types/site-content';
import type { LakeAccessScope } from '@/lib/types/secret-content';
import type { User } from 'firebase/auth';

type Props = {
  page: HomePageId;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

function PostList({
  items,
  empty,
  scope,
  user,
  isAdmin,
  onOpenAuth,
}: {
  items: SitePost[];
  empty: string;
  scope: LakeAccessScope;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
}) {
  if (!items.length) return <div className="page-coming">{empty}</div>;
  return (
    <>
      {items.map((item) => (
        <SecretItemGate
          key={item.id}
          scope={scope}
          item={item}
          isAdmin={isAdmin}
          loggedIn={!!user}
          onRequestLogin={onOpenAuth}
        >
          <div style={{ marginBottom: '1.25rem' }}>
            <div className="page-heading" style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>
              {item.title}
              {item.secret ? <SecretLockBadge compact /> : null}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{item.date}</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.body}</div>
          </div>
        </SecretItemGate>
      ))}
    </>
  );
}

export function HomeContent({ page, user, isAdmin, onOpenAuth }: Props) {
  const site = useSiteContent();

  return (
    <div className="content-area">
      <div className={`content-block${page === 'main' ? ' active' : ''}`} id="page-main">
        <MainGameStage />
      </div>

      <div className={`content-block${page === 'notice' ? ' active' : ''}`} id="page-notice">
        <div className="page-heading">Notice</div>
        <div className="page-sub">공지사항</div>
        <div id="notice-list">
          <PostList
            items={site.notices}
            empty="— 공지사항이 없습니다 —"
            scope="notice"
            user={user}
            isAdmin={isAdmin}
            onOpenAuth={onOpenAuth}
          />
        </div>
      </div>

      <div className={`content-block${page === 'diary' ? ' active' : ''}`} id="page-diary">
        <div className="page-heading">Records</div>
        <div className="page-sub">Diary · 일기</div>
        <RecordsDiaryPanel
          items={site.diary}
          user={user}
          isAdmin={isAdmin}
          onOpenAuth={onOpenAuth}
          empty="— 준비 중입니다 —"
        />
      </div>

      <div className={`content-block${page === 'scrap' ? ' active' : ''}`} id="page-scrap">
        <div className="page-heading">Records</div>
        <div className="page-sub">Scrap · 스크랩</div>
        <ScrapTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />
      </div>

      <div className={`content-block${page === 'review' ? ' active' : ''}`} id="page-review">
        <div className="page-heading">Records</div>
        <div className="page-sub">Review · 리뷰</div>
        <ReviewTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />
      </div>

      <div className={`content-block${page === 'music' ? ' active' : ''}`} id="page-music">
        <div className="page-heading">Records</div>
        <div className="page-sub">Music · 플레이리스트</div>
        {page === 'music' ? (
          <MusicArchiveTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />
        ) : null}
      </div>

      <div className={`content-block${page === 'charArchive' ? ' active' : ''}`} id="page-char-archive">
        <div className="page-heading">Character</div>
        <div className="page-sub">Archive · 캐릭터 글 아카이브</div>
        <CharArchivePanel user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />
      </div>

      <div className={`content-block${page === 'gallery' ? ' active' : ''}`} id="page-gallery">
        <div className="page-heading">Gallery</div>
        <div className="page-sub">갤러리</div>
        {!site.gallery.length ? (
          <div className="page-coming">— 준비 중입니다 —</div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {site.gallery.map((item) => (
              <SecretItemGate
                key={item.id}
                scope="gallery"
                item={item}
                isAdmin={isAdmin}
                loggedIn={!!user}
                onRequestLogin={onOpenAuth}
              >
                <div>
                  {item.img ? (
                    <img src={item.img} alt={item.title} style={{ maxWidth: '100%', borderRadius: 4 }} />
                  ) : null}
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {item.title}
                    {item.secret ? <SecretLockBadge compact /> : null}
                  </div>
                  {item.caption ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{item.caption}</div>
                  ) : null}
                </div>
              </SecretItemGate>
            ))}
          </div>
        )}
      </div>

      <div className={`content-block${page === 'universe' ? ' active' : ''}`} id="page-universe">
        <div className="page-heading">Universe</div>
        <div className="page-sub">자작 세계관</div>
        <div className="world-cards">
          {site.universe.map((card) =>
            card.comingSoon || !card.href ? (
              <div key={card.id} className="world-card-item page-coming" style={{ cursor: 'default' }}>
                <div className="world-card-icon">{card.icon}</div>
                <div className="world-card-info">
                  <div className="world-card-name">{card.name}</div>
                  <div className="world-card-sub">{card.sub}</div>
                </div>
              </div>
            ) : (
              <a key={card.id} href={card.href} className="world-card-item">
                <div className="world-card-icon">{card.icon}</div>
                <div className="world-card-info">
                  <div className="world-card-name">{card.name}</div>
                  <div className="world-card-sub">{card.sub}</div>
                </div>
                <div className="world-card-arrow">→</div>
              </a>
            ),
          )}
        </div>
      </div>

      <div className={`content-block${page === 'trpg' ? ' active' : ''}`} id="page-trpg">
        <div className="page-heading">TRPG</div>
        <div className="page-sub">시나리오</div>
        <TrpgScenarioList items={site.trpg} empty="— 준비 중입니다 —" />
      </div>

      <div className={`content-block${page === 'guest' ? ' active' : ''}`} id="page-guest">
        <div className="page-heading">Guest</div>
        <div className="page-sub">방명록</div>
        <GuestBookPanel
          guests={site.guests}
          user={user}
          isAdmin={isAdmin}
          onSaveGuests={site.saveGuests}
          onOpenAuth={onOpenAuth}
        />
      </div>

      <div className={`content-block${page === 'banner' ? ' active' : ''}`} id="page-banner">
        <div className="page-heading">Banner</div>
        <div className="page-sub">배너</div>
        <div id="public-banner-list">
          {!site.banners.length ? (
            <div className="page-coming">— 등록된 배너가 없습니다 —</div>
          ) : (
            site.banners.map((b) => <BannerTile key={b.id} banner={b} />)
          )}
        </div>
      </div>
    </div>
  );
}
