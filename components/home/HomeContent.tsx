'use client';

import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { HomePageId } from '@/components/layout/LeftNav';
import { GuestBookPanel } from '@/components/home/GuestBookPanel';
import { BannerTile } from '@/components/home/BannerTile';
import { NoticeBody } from '@/components/home/NoticeBody';
import { TrpgScenarioList } from '@/components/home/TrpgScenarioList';
import { CharArchivePanel } from '@/components/character/CharArchivePanel';
import { MainGameStage } from '@/components/home/MainGameStage';
import { RecordsDiaryPanel } from '@/components/records/RecordsDiaryPanel';
import { ScrapTab } from '@/components/records/ScrapTab';
import { ReviewTab } from '@/components/records/ReviewTab';
import { GalleryTab } from '@/components/records/GalleryTab';
import { QuoteTab } from '@/components/records/QuoteTab';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import type { SitePost, TrpgScenario } from '@/lib/types/site-content';
import type { LakeAccessScope } from '@/lib/types/secret-content';
import type { User } from 'firebase/auth';

type Props = {
  page: HomePageId;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onTicketClick: (item: TrpgScenario) => void;
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
          <div className="lh-site-post" style={{ marginBottom: '1.25rem' }}>
            <div className="lh-site-post__title">
              {item.title}
              {item.secret ? <SecretLockBadge compact /> : null}
            </div>
            <div className="lh-site-post__date">{item.date}</div>
            <NoticeBody body={item.body} className="lh-site-post__body" />
          </div>
        </SecretItemGate>
      ))}
    </>
  );
}

export function HomeContent({ page, user, isAdmin, onOpenAuth, onTicketClick }: Props) {
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

      <div className={`content-block${page === 'charArchive' ? ' active' : ''}`} id="page-char-archive">
        <div className="page-heading">Character Archive</div>
        <div className="page-sub">캐릭터 글 아카이브</div>
        <CharArchivePanel user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />
      </div>

      <div className={`content-block${page === 'diary' ? ' active' : ''}`} id="page-diary">
        <RecordsDiaryPanel
          items={site.diary}
          user={user}
          isAdmin={isAdmin}
          onOpenAuth={onOpenAuth}
          onSave={site.saveDiary}
          active={page === 'diary'}
        />
      </div>

      <div className={`content-block${page === 'scrap' ? ' active' : ''}`} id="page-scrap">
        <ScrapTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'scrap'} />
      </div>

      <div className={`content-block${page === 'review' ? ' active' : ''}`} id="page-review">
        <ReviewTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'review'} />
      </div>

      <div className={`content-block${page === 'gallery' ? ' active' : ''}`} id="page-gallery">
        <GalleryTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'gallery'} />
      </div>

      <div className={`content-block${page === 'quote' ? ' active' : ''}`} id="page-quote">
        <QuoteTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'quote'} />
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
        <TrpgScenarioList items={site.trpg} empty="— 준비 중입니다 —" onTicketClick={onTicketClick} />
      </div>

      <div className={`content-block${page === 'guest' ? ' active' : ''}`} id="page-guest">
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
