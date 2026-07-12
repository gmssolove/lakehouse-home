import { Fragment, type ReactNode } from 'react';

function parseInlineBold(line: string, keyPrefix: string): ReactNode[] {
  const parts = line.split(/(\*\*[^*]+?\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={`${keyPrefix}-b${i}`} className="oc-rich-strong">
          {bold[1]}
        </strong>
      );
    }
    return <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>;
  });
}

/** 엔터 = 문단, **텍스트** = 굵게 */
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
    return <span className={className}>{parseInlineBold(normalized.replace(/\n/g, ' '), 's')}</span>;
  }

  const lines = normalized.split('\n');

  return (
    <Tag className={['oc-rich-text', className].filter(Boolean).join(' ')}>
      {lines.map((line, i) => (
        <p key={i} className={line.trim() ? 'oc-rich-p' : 'oc-rich-p oc-rich-p--blank'}>
          {line.trim() ? parseInlineBold(line, `p${i}`) : '\u00A0'}
        </p>
      ))}
    </Tag>
  );
}
