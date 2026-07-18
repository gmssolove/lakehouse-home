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
import { LakeScopeGate } from '@/components/lake/LakeScopeGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { UniverseAccordionCards, type SkewAccordionCard } from '@/components/home/UniverseAccordionCards';
import type { SitePost, TrpgScenario } from '@/lib/types/site-content';
import type { LakeAccessScope } from '@/lib/types/secret-content';
import type { User } from 'firebase/auth';

type Props = {
  page: HomePageId;
  leavingPage?: HomePageId | null;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onTicketClick: (item: TrpgScenario) => void;
};

export function resolveUniverseHref(card: SkewAccordionCard & { href?: string }): string {
  if (card.comingSoon) return '';

  const href = (card.href || '').trim();
  if (href) return href;

  const isKisaragi =
    card.id === 'kisaragi' ||
    card.name === '키사라기고교' ||
    (/如月|Kisaragi/i.test(card.sub || '') && card.icon === '如');
  if (isKisaragi) return '/verse/gate';

  return '';
}

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

export function HomeContent({ page, leavingPage, user, isAdmin, onOpenAuth, onTicketClick }: Props) {
  const site = useSiteContent();

  const blockClass = (id: HomePageId) =>
    `content-block${page === id ? ' active' : ''}${leavingPage === id && page !== id ? ' is-leaving' : ''}`;

  return (
    <div className="content-area">
      <div className={blockClass('main')} id="page-main">
        <MainGameStage />
      </div>

      <div className={blockClass('notice')} id="page-notice">
        <div className="page-heading">Notice</div>
        <div className="page-sub">공지사항</div>
        <LakeScopeGate scope="notice" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'notice'}>
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
        </LakeScopeGate>
      </div>

      <div className={blockClass('charArchive')} id="page-char-archive">
        <div className="page-heading">Character Archive</div>
        <div className="page-sub">캐릭터 글 아카이브</div>
        <LakeScopeGate scope="charArchive" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'charArchive'}>
          <CharArchivePanel user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />
        </LakeScopeGate>
      </div>

      <div className={blockClass('diary')} id="page-diary">
        <LakeScopeGate scope="diary" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'diary'}>
          <RecordsDiaryPanel
            items={site.diary}
            user={user}
            isAdmin={isAdmin}
            onOpenAuth={onOpenAuth}
            onSave={site.saveDiary}
            active={page === 'diary'}
          />
        </LakeScopeGate>
      </div>

      <div className={blockClass('scrap')} id="page-scrap">
        <LakeScopeGate scope="scrap" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'scrap'}>
          <ScrapTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'scrap'} />
        </LakeScopeGate>
      </div>

      <div className={blockClass('review')} id="page-review">
        <LakeScopeGate scope="review" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'review'}>
          <ReviewTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'review'} />
        </LakeScopeGate>
      </div>

      <div className={blockClass('gallery')} id="page-gallery">
        <LakeScopeGate scope="gallery" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'gallery'}>
          <GalleryTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'gallery'} />
        </LakeScopeGate>
      </div>

      <div className={blockClass('quote')} id="page-quote">
        <LakeScopeGate scope="quote" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'quote'}>
          <QuoteTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active={page === 'quote'} />
        </LakeScopeGate>
      </div>

      <div className={blockClass('universe')} id="page-universe">
        <div className="page-heading">Universe</div>
        <div className="page-sub">자작 세계관</div>
        <UniverseAccordionCards cards={site.universe} resolveHref={resolveUniverseHref} />
      </div>

      <div className={blockClass('trpg')} id="page-trpg">
        <div className="page-heading">TRPG</div>
        <div className="page-sub">시나리오</div>
        <TrpgScenarioList
          items={site.trpg}
          empty="— 준비 중입니다 —"
          onTicketClick={onTicketClick}
          isAdmin={isAdmin}
          loggedIn={!!user}
          onOpenAuth={onOpenAuth}
        />
      </div>

      <div className={blockClass('guest')} id="page-guest">
        <LakeScopeGate scope="guest" isAdmin={isAdmin} loggedIn={!!user} onRequestLogin={onOpenAuth} active={page === 'guest'}>
          <GuestBookPanel
            guests={site.guests}
            user={user}
            isAdmin={isAdmin}
            onSaveGuests={site.saveGuests}
            onOpenAuth={onOpenAuth}
          />
        </LakeScopeGate>
      </div>

      <div className={blockClass('banner')} id="page-banner">
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
