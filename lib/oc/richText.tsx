import { Fragment, type ReactNode } from 'react';

/** **굵게** · %%옅게%% — 겹치지 않는 인라인 마커만 분할 */
const INLINE_MARK = /(\*\*[^*]+?\*\*|%%[^%]+?%%)/g;

function parseInlineMarks(line: string, keyPrefix: string): ReactNode[] {
  const parts = line.split(INLINE_MARK);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={`${keyPrefix}-b${i}`} className="oc-rich-strong">
          {bold[1]}
        </strong>
      );
    }
    const soft = part.match(/^%%([^%]+)%%$/);
    if (soft) {
      return (
        <span key={`${keyPrefix}-s${i}`} className="oc-rich-soft">
          {soft[1]}
        </span>
      );
    }
    return <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>;
  });
}

/** 엔터 = 문단, **텍스트** = 굵게, %%텍스트%% = 옅게 */
export function OcRichText({
  text,
  className,
  as: Tag = 'div',
}: {
  text: string;
  className?: string;
  as?: 'div' | 'p' | 'span';
}) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  if (!normalized) return null;

  if (Tag === 'span') {
    return <span className={className}>{parseInlineMarks(normalized.replace(/\n/g, ' '), 's')}</span>;
  }

  const lines = normalized.split('\n');

  return (
    <Tag className={['oc-rich-text', className].filter(Boolean).join(' ')}>
      {lines.map((line, i) => (
        <p key={i} className={line.trim() ? 'oc-rich-p' : 'oc-rich-p oc-rich-p--blank'}>
          {line.trim() ? parseInlineMarks(line, `p${i}`) : '\u00A0'}
        </p>
      ))}
    </Tag>
  );
}
