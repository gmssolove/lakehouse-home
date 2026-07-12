import { parseNoticeBody, type NoticeSegment } from '@/lib/notice/parseNoticeBody';

type Props = {
  body: string;
  className?: string;
};

function SegmentView({ segment }: { segment: NoticeSegment }) {
  switch (segment.type) {
    case 'label':
      return <div className="lh-notice-body__label">{segment.text}</div>;
    case 'paragraph':
      return (
        <p className="lh-notice-body__p">
          {segment.lines.map((line, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      );
    case 'list':
      return (
        <ul className="lh-notice-body__list">
          {segment.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'warning':
      return (
        <div className="lh-notice-body__warn">
          {segment.lines.map((line, i) => (
            <p key={i} className="lh-notice-body__warn-line">
              {line}
            </p>
          ))}
        </div>
      );
    default:
      return null;
  }
}

/** Notice 본문 — raw plain text를 화면에서만 규칙에 맞게 스타일링 */
export function NoticeBody({ body, className }: Props) {
  const blocks = parseNoticeBody(body);
  if (!blocks.length) return null;

  return (
    <div className={`lh-notice-body${className ? ` ${className}` : ''}`}>
      {blocks.map((block, bi) => (
        <div key={bi} className="lh-notice-body__block">
          {block.segments.map((seg, si) => (
            <SegmentView key={si} segment={seg} />
          ))}
        </div>
      ))}
    </div>
  );
}
