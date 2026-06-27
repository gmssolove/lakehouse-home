'use client';

import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { normalizeImageFrame, type ImageFrame } from '@/lib/shared/imageFrame';
import { formatTrpgDateRange, normalizeTrpgScenario } from '@/lib/trpg/normalize';
import { TRPG_THUMB_ASPECT } from '@/lib/trpg/constants';
import type { TrpgScenario } from '@/lib/types/site-content';

type PreviewData = Partial<
  Pick<
    TrpgScenario,
    'title' | 'author' | 'kp' | 'system' | 'dateStart' | 'dateEnd' | 'players' | 'cleared' | 'id'
  >
>;

type Props = {
  src: string;
  frame?: ImageFrame;
  onChange: (frame: ImageFrame) => void;
  preview?: PreviewData;
};

function systemClass(system: string) {
  const s = system.toLowerCase();
  if (s.includes('coc') || s.includes('call of cthulhu') || s.includes('크툴루')) {
    return 'trpg-ticket__system--coc';
  }
  if (s.includes('insane')) {
    return 'trpg-ticket__system--insane';
  }
  return 'trpg-ticket__system--default';
}

export function TrpgThumbnailEditor({ src, frame, onChange, preview }: Props) {
  const f = normalizeImageFrame(frame);
  const ticket = normalizeTrpgScenario({
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
  });
  const dates = formatTrpgDateRange(ticket);
  const serial = ticket.id.replace(/\D/g, '').slice(-12).padStart(12, '0') || '000000000000';

  if (!src) {
    return <div className="trpg-thumb-editor trpg-thumb-editor--empty">썸네일 URL을 입력하거나 업로드하세요.</div>;
  }

  return (
    <div className="trpg-thumb-editor">
      <div className="trpg-thumb-editor__layout">
        <div className="trpg-thumb-editor__work">
          <p className="trpg-thumb-editor__label">노출 영역 조정</p>
          <div className="trpg-thumb-editor__viewport-host">
            <ImageFrameEditor
              src={src}
              value={f}
              onChange={onChange}
              fit="cover"
              pos="center center"
              aspectRatio={TRPG_THUMB_ASPECT}
              allowWheelZoom={false}
              className="trpg-thumb-editor__frame-editor"
            />
          </div>
        </div>

        <div className="trpg-thumb-editor__ticket-preview">
          <p className="trpg-thumb-editor__label">사이트 미리보기</p>
          <div className="trpg-thumb-editor__ticket-scale">
            <article className="trpg-ticket trpg-ticket--editor-preview">
              <div className="trpg-ticket__hit">
                <div className="trpg-ticket__visual">
                  <ImageFrameView
                    src={src}
                    frame={f}
                    fit="cover"
                    pos="center center"
                    className="trpg-ticket__visual-frame"
                    imgClassName="trpg-ticket__visual-img"
                  />
                </div>
                <div className="trpg-ticket__perforation" aria-hidden="true" />
                <div className="trpg-ticket__info">
                  <div className="trpg-ticket__info-main">
                    {ticket.author ? <p className="trpg-ticket__author">w. {ticket.author}</p> : null}
                    <h3 className="trpg-ticket__title">{ticket.title}</h3>
                    <div className="trpg-ticket__meta-block">
                      {ticket.kp ? <p className="trpg-ticket__kp">KP {ticket.kp}</p> : null}
                      {ticket.system ? (
                        <span className={`trpg-ticket__system ${systemClass(ticket.system)}`}>
                          {ticket.system}
                        </span>
                      ) : null}
                      {dates ? <p className="trpg-ticket__dates">{dates}</p> : null}
                      {ticket.players ? <p className="trpg-ticket__players">{ticket.players}</p> : null}
                    </div>
                  </div>
                  <div className="trpg-ticket__footer">
                    <div className="trpg-ticket__barcode" aria-hidden="true">
                      {Array.from({ length: 30 }, (_, i) => (
                        <span key={i} />
                      ))}
                    </div>
                    <span className="trpg-ticket__serial">{serial}</span>
                  </div>
                  {ticket.cleared ? <span className="trpg-ticket__stamp">Cleared</span> : null}
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
