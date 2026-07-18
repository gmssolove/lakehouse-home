import type { ReactNode } from 'react';
import { parseNoticeBody, type NoticeSegment } from '@/lib/notice/parseNoticeBody';

type Props = {
  body: string;
  className?: string;
};

/** 인라인 마크업: **굵게**, *기울임*, __밑줄__ */
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g;

function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return <u key={i}>{part.slice(2, -2)}</u>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

function SegmentView({ segment }: { segment: NoticeSegment }) {
  switch (segment.type) {
    case 'label':
      return <div className="lh-notice-body__label">{renderInline(segment.text)}</div>;
    case 'paragraph':
      return (
        <p className="lh-notice-body__p">
          {segment.lines.map((line, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {renderInline(line)}
            </span>
          ))}
        </p>
      );
    case 'list':
      return (
        <ul className="lh-notice-body__list">
          {segment.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'warning':
      return (
        <div className="lh-notice-body__warn">
          {segment.lines.map((line, i) => (
            <p key={i} className="lh-notice-body__warn-line">
              {renderInline(line)}
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
