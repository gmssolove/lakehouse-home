'use client';

import { useState } from 'react';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import {
  clampFrameScale,
  DEFAULT_IMAGE_FRAME,
  normalizeImageFrame,
  type ImageFrame,
} from '@/lib/shared/imageFrame';
import { TRPG_CARD_ASPECT_DEFAULT } from '@/lib/trpg/constants';
import {
  formatTrpgDateRange,
  normalizeTrpgScenario,
  trpgCardHoverPortrait,
  trpgCardHoverTitle,
  trpgCardPrimaryPcName,
  trpgSystemBadgeClass,
} from '@/lib/trpg/normalize';
import type { TrpgScenario } from '@/lib/types/site-content';

type PreviewData = Partial<
  Pick<
    TrpgScenario,
    | 'title'
    | 'author'
    | 'kp'
    | 'system'
    | 'dateStart'
    | 'dateEnd'
    | 'players'
    | 'cleared'
    | 'id'
    | 'playerProfiles'
    | 'characterIds'
    | 'cardHoverTitle'
    | 'cardHoverPcName'
    | 'cardHoverImg'
    | 'cardHoverImgFrame'
    | 'cardHoverImgFit'
    | 'cardHoverImgPos'
  >
>;

type EditMode = 'thumb' | 'hover';

type Props = {
  src: string;
  frame?: ImageFrame;
  onChange: (frame: ImageFrame) => void;
  preview?: PreviewData;
  aspectRatio?: string;
  hoverImg?: string;
  hoverFrame?: ImageFrame;
  onHoverFrameChange?: (frame: ImageFrame) => void;
};

export function TrpgThumbnailEditor({
  src,
  frame,
  onChange,
  preview,
  aspectRatio = TRPG_CARD_ASPECT_DEFAULT,
  hoverImg,
  hoverFrame,
  onHoverFrameChange,
}: Props) {
  const [mode, setMode] = useState<EditMode>('thumb');
  const f = normalizeImageFrame(frame);
  const hf = normalizeImageFrame(hoverFrame);
  const activeHoverImg = (hoverImg || preview?.cardHoverImg || '').trim();
  const canEditHover = Boolean(activeHoverImg && onHoverFrameChange);

  const card = normalizeTrpgScenario({
    id: preview?.id || 'preview',
    title: preview?.title || '미리보기',
    author: preview?.author || '',
    kp: preview?.kp || '',
    system: preview?.system || 'TRPG',
    dateStart: preview?.dateStart || '',
    dateEnd: preview?.dateEnd || '',
    players: preview?.players || '',
    cleared: preview?.cleared ?? false,
    thumbnail: src,
    thumbnailFrame: f,
    playerProfiles: preview?.playerProfiles,
    characterIds: preview?.characterIds,
    cardHoverTitle: preview?.cardHoverTitle,
    cardHoverPcName: preview?.cardHoverPcName,
    cardHoverImg: activeHoverImg || preview?.cardHoverImg,
    cardHoverImgFrame: hoverFrame ?? preview?.cardHoverImgFrame,
    cardHoverImgFit: 'contain',
    cardHoverImgPos: preview?.cardHoverImgPos || 'right bottom',
  });
  const dates = formatTrpgDateRange(card);
  const hoverTitle = trpgCardHoverTitle(card);
  const pcName = trpgCardPrimaryPcName(card);
  const portrait = trpgCardHoverPortrait(card);
  const badge = card.system?.trim();
  const editingHover = mode === 'hover' && canEditHover;
  const editingThumb = mode === 'thumb';

  if (!src) {
    return <div className="trpg-thumb-editor trpg-thumb-editor--empty">썸네일 URL을 입력하거나 업로드하세요.</div>;
  }

  return (
    <div className="trpg-thumb-editor">
      <div className="trpg-thumb-editor__tabs" role="tablist" aria-label="카드 편집 대상">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'thumb'}
          className={`trpg-thumb-editor__tab${mode === 'thumb' ? ' is-active' : ''}`}
          onClick={() => setMode('thumb')}
        >
          썸네일
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'hover'}
          className={`trpg-thumb-editor__tab${mode === 'hover' ? ' is-active' : ''}`}
          onClick={() => setMode('hover')}
          disabled={!canEditHover}
          title={canEditHover ? undefined : '호버 초상 이미지를 먼저 업로드하세요'}
        >
          호버 초상
        </button>
      </div>

      <div className="trpg-thumb-editor__layout trpg-thumb-editor__layout--split">
        <div className="trpg-thumb-editor__ticket-preview">
          <p className="trpg-thumb-editor__label">
            {editingThumb
              ? '카드에서 썸네일 드래그 · 아래 슬라이더로 확대/축소'
              : editingHover
                ? '카드에서 초상 드래그 · 아래 슬라이더로 확대'
                : '카드 호버 미리보기'}
          </p>
          <div className="trpg-thumb-editor__ticket-scale">
            <article
              className={`trpg-card trpg-card--editor-preview${editingHover ? ' is-portrait-edit' : ''}${editingThumb ? ' is-thumb-edit' : ''}`}
              style={{ aspectRatio }}
            >
              <div className="trpg-card__hit">
                <div className="trpg-card__media">
                  {editingThumb ? (
                    <ImageFrameEditor
                      src={src}
                      value={f}
                      onChange={onChange}
                      fit="cover"
                      pos="center center"
                      allowWheelZoom
                      stageMode
                      className="trpg-thumb-editor__stage-thumb"
                      viewportClassName="trpg-card__media-frame"
                      imgClassName="trpg-card__media-img"
                    />
                  ) : (
                    <ImageFrameView
                      src={src}
                      frame={f}
                      fit="cover"
                      pos="center center"
                      className="trpg-card__media-frame"
                      imgClassName="trpg-card__media-img"
                    />
                  )}
                </div>
                {(badge || card.cleared) ? (
                  <div className="trpg-card__meta">
                    {badge ? (
                      <span className={`trpg-card__badge ${trpgSystemBadgeClass(badge)}`}>{badge}</span>
                    ) : null}
                    {card.cleared ? <span className="trpg-card__stamp">CLEARED</span> : null}
                  </div>
                ) : null}
                {!editingThumb ? (
                  <div className="trpg-card__hover">
                    <div className={`trpg-card__hover-body${portrait || editingHover ? ' has-portrait' : ''}`}>
                      <div className="trpg-card__hover-copy">
                        <h3 className="trpg-card__hover-title">{hoverTitle}</h3>
                        {pcName ? (
                          <span className="trpg-card__hover-pc">
                            <em>PC</em>
                            <span>{pcName}</span>
                          </span>
                        ) : null}
                        {dates ? <p className="trpg-card__hover-date">{dates}</p> : null}
                      </div>
                      {editingHover ? (
                        <div className="trpg-card__hover-portrait trpg-card__hover-portrait--editable">
                          <ImageFrameEditor
                            src={activeHoverImg}
                            value={hf}
                            onChange={onHoverFrameChange!}
                            fit="contain"
                            pos="right bottom"
                            allowWheelZoom
                            stageMode
                            className="trpg-thumb-editor__stage-portrait"
                            imgClassName="trpg-card__hover-portrait-img"
                            viewportClassName="trpg-card__hover-portrait-frame"
                          />
                        </div>
                      ) : portrait ? (
                        <div className="trpg-card__hover-portrait">
                          <ImageFrameView
                            src={portrait.src}
                            frame={portrait.frame}
                            fit={portrait.fit}
                            pos={portrait.pos}
                            className="trpg-card__hover-portrait-frame"
                            imgClassName="trpg-card__hover-portrait-img"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          </div>

          {mode === 'thumb' ? (
            <div className="trpg-thumb-editor__inline-controls">
              <label className="trpg-thumb-editor__slider">
                <span>확대</span>
                <input
                  type="range"
                  min={55}
                  max={300}
                  step={1}
                  value={Math.round(f.scale * 100)}
                  onChange={(e) =>
                    onChange({ ...f, scale: clampFrameScale(Number(e.target.value) / 100) })
                  }
                />
                <span>{Math.round(f.scale * 100)}%</span>
              </label>
              <button type="button" className="trpg-thumb-editor__reset" onClick={() => onChange({ ...DEFAULT_IMAGE_FRAME })}>
                위치 초기화
              </button>
            </div>
          ) : null}

          {editingHover ? (
            <div className="trpg-thumb-editor__inline-controls">
              <label className="trpg-thumb-editor__slider">
                <span>확대</span>
                <input
                  type="range"
                  min={55}
                  max={300}
                  step={1}
                  value={Math.round(hf.scale * 100)}
                  onChange={(e) =>
                    onHoverFrameChange!({ ...hf, scale: clampFrameScale(Number(e.target.value) / 100) })
                  }
                />
                <span>{Math.round(hf.scale * 100)}%</span>
              </label>
              <button
                type="button"
                className="trpg-thumb-editor__reset"
                onClick={() => onHoverFrameChange!({ ...DEFAULT_IMAGE_FRAME })}
              >
                위치 초기화
              </button>
            </div>
          ) : null}

          {mode === 'hover' && !canEditHover ? (
            <p className="trpg-thumb-editor__hint">아래에서 호버 초상 이미지를 올리면 이 미리보기에서 바로 조절할 수 있습니다.</p>
          ) : (
            <p className="trpg-thumb-editor__hint">
              {editingHover
                ? '오른쪽 초상 영역을 드래그해 위치를 맞추세요 · 휠로도 확대 가능'
                : '카드 위를 드래그해 썸네일 노출 영역을 맞추세요'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
