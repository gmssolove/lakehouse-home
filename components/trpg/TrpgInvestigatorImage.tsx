'use client';

import { ImageFrameView } from '@/components/ui/ImageFrameView';
import type { TrpgPlayerProfile } from '@/lib/types/site-content';

export function InvestigatorCardImage({ player }: { player: TrpgPlayerProfile }) {
  if (!player.img) {
    return <div className="card-img-placeholder">{player.name[0] || '?'}</div>;
  }

  return (
    <ImageFrameView
      src={player.img}
      frame={player.imgFrame}
      fit={player.imgFit || 'contain'}
      pos={player.imgPos || 'center top'}
      className="inv-card__frame"
      imgClassName="inv-card__img"
    />
  );
}

export function InvestigatorPortraitImage({ player }: { player: TrpgPlayerProfile }) {
  if (!player.img) {
    return <div className="ph-img">{player.name[0] || '?'}</div>;
  }

  return (
    <ImageFrameView
      src={player.img}
      frame={player.imgFrame}
      fit={player.imgFit || 'contain'}
      pos={player.imgPos || 'center top'}
      className="ph-img ph-img--framed"
      imgClassName="ph-img__photo"
    />
  );
}
