import type { BannerItem } from '@/lib/types/site-content';
import { BannerDividerIcon } from '@/lib/banner/dividerIcons';

type BannerLegacy = BannerItem & { name?: string; url?: string };

function bannerOwner(b: BannerLegacy) {
  return b.ownerName?.trim() || b.name?.trim() || b.title?.trim() || '';
}

function bannerHref(b: BannerLegacy) {
  return b.href?.trim() || b.url?.trim() || '';
}

export function BannerTile({ banner }: { banner: BannerItem }) {
  if (banner.divider) {
    const iconId = banner.dividerIcon || 'diamond';
    return (
      <div className="lh-banner-divider" aria-hidden="true">
        <span className="lh-banner-divider__icon">
          <BannerDividerIcon id={iconId} />
        </span>
      </div>
    );
  }

  const b = banner as BannerLegacy;
  const owner = bannerOwner(b);
  const tip = owner;
  const href = bannerHref(b);

  const tile = (
    <div className="lh-banner-tile">
      {banner.img ? (
        <img src={banner.img} alt={banner.title || tip || 'banner'} />
      ) : (
        <span className="lh-banner-tile-fallback">{banner.title || 'Banner'}</span>
      )}
    </div>
  );

  const content = (
    <>
      {tip ? <span className="lh-banner-tooltip">{tip}</span> : null}
      {tile}
    </>
  );

  if (href) {
    return (
      <a
        className="lh-banner-item lh-banner-item--link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </a>
    );
  }

  return <div className="lh-banner-item">{content}</div>;
}
