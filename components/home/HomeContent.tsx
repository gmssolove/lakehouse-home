'use client';

import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { HomePageId } from '@/components/layout/LeftNav';
import { GuestBookPanel } from '@/components/home/GuestBookPanel';
import { BannerTile } from '@/components/home/BannerTile';
import type { User } from 'firebase/auth';

type Props = {
  page: HomePageId;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

function PostList({ items, empty }: { items: { id: string; title: string; body: string; date: string }[]; empty: string }) {
  if (!items.length) return <div className="page-coming">{empty}</div>;
  return (
    <>
      {items.map((item) => (
        <div key={item.id} style={{ marginBottom: '1.25rem' }}>
          <div className="page-heading" style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>
            {item.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{item.date}</div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.body}</div>
        </div>
      ))}
    </>
  );
}

export function HomeContent({ page, user, isAdmin, onOpenAuth }: Props) {
  const site = useSiteContent();

  return (
    <div className="content-area">
      <div className={`content-block${page === 'main' ? ' active' : ''}`} id="page-main">
        <div className="main-top-label" id="main-eyebrow-text">
          {site.main.eyebrow}
        </div>
        <div className="main-latin" id="main-latin-text">
          {site.main.latin}
        </div>
        <div className="main-typo" id="main-heading-text">
          {site.main.heading}
          <span>{site.main.headingAccent}</span>
        </div>
        {site.main.desc ? (
          <div className="main-desc" id="main-desc-text">
            {site.main.desc}
          </div>
        ) : (
          <div className="main-desc" id="main-desc-text" />
        )}
      </div>

      <div className={`content-block${page === 'notice' ? ' active' : ''}`} id="page-notice">
        <div className="page-heading">Notice</div>
        <div className="page-sub">공지사항</div>
        <div id="notice-list">
          <PostList items={site.notices} empty="— 공지사항이 없습니다 —" />
        </div>
      </div>

      <div className={`content-block${page === 'diary' ? ' active' : ''}`} id="page-diary">
        <div className="page-heading">Diary</div>
        <div className="page-sub">일기</div>
        <PostList items={site.diary} empty="— 준비 중입니다 —" />
      </div>

      <div className={`content-block${page === 'gallery' ? ' active' : ''}`} id="page-gallery">
        <div className="page-heading">Gallery</div>
        <div className="page-sub">갤러리</div>
        {!site.gallery.length ? (
          <div className="page-coming">— 준비 중입니다 —</div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {site.gallery.map((item) => (
              <div key={item.id}>
                {item.img ? (
                  <img src={item.img} alt={item.title} style={{ maxWidth: '100%', borderRadius: 4 }} />
                ) : null}
                <div style={{ marginTop: 6, fontSize: 13 }}>{item.title}</div>
                {item.caption ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{item.caption}</div>
                ) : null}
              </div>
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
        <PostList items={site.trpg} empty="— 준비 중입니다 —" />
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
