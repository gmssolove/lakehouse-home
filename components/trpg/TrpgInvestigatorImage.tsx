'use client';

import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { framedImageStyle } from '@/lib/shared/imageFrame';
import type {
  TrpgPlayerExpression,
  TrpgPlayerExpressionKind,
  TrpgPlayerProfile,
} from '@/lib/types/site-content';

export type InvestigatorPortraitSource = {
  img?: string;
  imgFrame?: TrpgPlayerProfile['imgFrame'];
  imgFit?: string;
  imgPos?: string;
  name: string;
};

export function normalizePortraitKind(kind?: string | null): TrpgPlayerExpressionKind {
  return kind === 'version' ? 'version' : 'expression';
}

/** 카드용 이미지 */
export function resolveInvestigatorCard(player: TrpgPlayerProfile): InvestigatorPortraitSource {
  return {
    name: player.name,
    img: player.img,
    imgFrame: player.imgFrame,
    imgFit: player.imgFit,
    imgPos: player.imgPos,
  };
}

/** 스테이지용 풀 일러스트 (표정·버전 포함) */
export function resolveInvestigatorPortrait(
  player: TrpgPlayerProfile,
  expressionId?: string | null,
): InvestigatorPortraitSource {
  if (expressionId && expressionId !== 'default') {
    const ex = player.expressions?.find((e) => e.id === expressionId);
    if (ex?.img) {
      return {
        name: player.name,
        img: ex.img,
        imgFrame: ex.imgFrame ?? player.stageImgFrame,
        imgFit: ex.imgFit || player.stageImgFit || player.imgFit,
        imgPos: ex.imgPos || player.stageImgPos || player.imgPos,
      };
    }
  }
  return {
    name: player.name,
    img: player.stageImg || player.img,
    imgFrame: player.stageImgFrame,
    imgFit: player.stageImgFit || player.imgFit,
    imgPos: player.stageImgPos || player.imgPos,
  };
}

export function InvestigatorCardImage({ player }: { player: TrpgPlayerProfile }) {
  const src = resolveInvestigatorCard(player);
  if (!src.img) {
    return <div className="card-img-placeholder">{player.name[0] || '?'}</div>;
  }

  return (
    <ImageFrameView
      src={src.img}
      frame={src.imgFrame}
      fit={src.imgFit || 'cover'}
      pos={src.imgPos || 'center top'}
      className="inv-card__frame"
      imgClassName="inv-card__img"
    />
  );
}

export function InvestigatorPortraitImage({
  player,
  expressionId,
  className,
  full = false,
}: {
  player: TrpgPlayerProfile;
  expressionId?: string | null;
  className?: string;
  /** 크롭 박스 없이 풀 일러스트 (위치·확대 변환은 유지) */
  full?: boolean;
}) {
  const src = resolveInvestigatorPortrait(player, expressionId);
  if (!src.img) {
    return <div className={`ph-img${className ? ` ${className}` : ''}`}>{player.name[0] || '?'}</div>;
  }

  if (full) {
    return (
      <div className={`ph-img ph-img--full${className ? ` ${className}` : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="ph-img__photo"
          src={src.img}
          alt={src.name}
          draggable={false}
          referrerPolicy="no-referrer"
          style={framedImageStyle(src.imgFrame, {
            fit: 'contain',
            pos: src.imgPos || 'center bottom',
          })}
        />
      </div>
    );
  }

  return (
    <ImageFrameView
      src={src.img}
      frame={src.imgFrame}
      fit={src.imgFit || 'contain'}
      pos={src.imgPos || 'center bottom'}
      className={`ph-img ph-img--framed${className ? ` ${className}` : ''}`}
      imgClassName="ph-img__photo"
    />
  );
}

export type PortraitOption = {
  id: string;
  label: string;
  img?: string;
  kind: TrpgPlayerExpressionKind;
};

export function portraitOptions(
  player: TrpgPlayerProfile,
  kind: TrpgPlayerExpressionKind,
): PortraitOption[] {
  const stageImg = player.stageImg || player.img;
  const list: PortraitOption[] = [];
  if (kind === 'expression') {
    list.push({ id: 'default', label: '기본', img: stageImg, kind: 'expression' });
  }
  for (const ex of player.expressions ?? []) {
    if (!ex.img) continue;
    if (normalizePortraitKind(ex.kind) !== kind) continue;
    list.push({
      id: ex.id,
      label: ex.label?.trim() || (kind === 'version' ? '버전' : '표정'),
      img: ex.img,
      kind,
    });
  }
  return list;
}

/** @deprecated use portraitOptions(player, 'expression') */
export function expressionOptions(player: TrpgPlayerProfile): PortraitOption[] {
  return portraitOptions(player, 'expression');
}

export type { TrpgPlayerExpression };
