import { Fragment, type CSSProperties, type ReactNode } from 'react';
import {
  findEarliestOpen,
  findMarkClose,
  fontCss,
  marksToEditorHtml,
  normalizeFontId,
  normalizeHex,
  normalizeSizePx,
  plainOffsetsToMarkOffsets,
  projectPlainOffsets,
  wrapRichSelection,
  type OpenHit,
  type RichMarkKind,
} from '@/lib/oc/richTextMarks';
import { isSoftBreakBr } from '@/lib/oc/richEditorSelection';
import { matchRichIconAt, normalizeRichIconId, richIconMarker } from '@/lib/oc/richIcons';

export type { RichMarkKind };
export {
  marksToEditorHtml,
  plainOffsetsToMarkOffsets,
  projectPlainOffsets,
  wrapRichSelection,
  normalizeHex,
};

function wrapNode(open: OpenHit, children: ReactNode[], key: string): ReactNode {
  switch (open.kind) {
    case 'bold':
      return (
        <strong key={key} className="oc-rich-strong" data-rich="bold">
          {children}
        </strong>
      );
    case 'italic':
      return (
        <em key={key} className="oc-rich-italic" data-rich="italic">
          {children}
        </em>
      );
    case 'underline':
      return (
        <span key={key} className="oc-rich-underline" data-rich="underline">
          {children}
        </span>
      );
    case 'strike':
      return (
        <span key={key} className="oc-rich-strike" data-rich="strike">
          {children}
        </span>
      );
    case 'soft':
      return (
        <span key={key} className="oc-rich-soft" data-rich="soft">
          {children}
        </span>
      );
    case 'color':
      return (
        <span
          key={key}
          className="oc-rich-color"
          data-rich="color"
          data-color={open.hex}
          style={{ color: open.hex }}
        >
          {children}
        </span>
      );
    case 'font':
      return (
        <span
          key={key}
          className="oc-rich-font"
          data-rich="font"
          data-font={open.fontId}
          style={
            {
              fontFamily: fontCss(open.fontId),
              ['--oc-rich-font' as string]: fontCss(open.fontId),
            } as CSSProperties
          }
        >
          {children}
        </span>
      );
    case 'size':
      return (
        <span
          key={key}
          className="oc-rich-size"
          data-rich="size"
          data-size={open.sizePx}
          style={
            {
              fontSize: `${open.sizePx}px`,
              ['--oc-rich-size' as string]: `${open.sizePx}px`,
            } as CSSProperties
          }
        >
          {children}
        </span>
      );
  }
}

/** 마커가 줄바꿈을 넘겨도 문단마다 태그를 다시 연다 (코드 노출 방지) */
function parseMarksToParagraphs(text: string, keyPrefix: string): ReactNode[][] {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const paragraphs: ReactNode[][] = [];
  let buf: ReactNode[] = [];
  let textAcc = '';
  let n = 0;

  const flushText = () => {
    if (!textAcc) return;
    buf.push(<Fragment key={`${keyPrefix}-t${n++}`}>{textAcc}</Fragment>);
    textAcc = '';
  };

  const flushPara = () => {
    flushText();
    paragraphs.push(buf);
    buf = [];
  };

  const emitLiteral = (literal: string) => {
    for (let k = 0; k < literal.length; k += 1) {
      if (literal[k] === '\n') flushPara();
      else textAcc += literal[k];
    }
  };

  const walk = (str: string, prefix: string) => {
    let i = 0;
    while (i < str.length) {
      const icon = matchRichIconAt(str, i);
      if (icon) {
        flushText();
        buf.push(
          <i
            key={`${prefix}-ico${n++}`}
            className={`ti ti-${icon.id} oc-rich-icon`}
            data-rich="icon"
            data-icon={icon.id}
            aria-hidden
          />,
        );
        i += icon.len;
        continue;
      }

      const open = findEarliestOpen(str, i);
      if (!open) {
        let j = i;
        while (j < str.length) {
          const restIcon = matchRichIconAt(str, j);
          if (restIcon) {
            flushText();
            buf.push(
              <i
                key={`${prefix}-ico${n++}`}
                className={`ti ti-${restIcon.id} oc-rich-icon`}
                data-rich="icon"
                data-icon={restIcon.id}
                aria-hidden
              />,
            );
            j += restIcon.len;
            continue;
          }
          const bang = str.indexOf('{!', j);
          if (bang < 0) {
            emitLiteral(str.slice(j));
            break;
          }
          if (bang > j) emitLiteral(str.slice(j, bang));
          j = bang;
        }
        break;
      }
      if (open.index > i) {
        const bang = str.indexOf('{!', i);
        if (bang >= 0 && bang < open.index) {
          if (bang > i) emitLiteral(str.slice(i, bang));
          i = bang;
          continue;
        }
        emitLiteral(str.slice(i, open.index));
        i = open.index;
        continue;
      }

      const contentStart = open.index + open.openLen;
      const closed = findMarkClose(str, contentStart, open);
      if (!closed) {
        emitLiteral(str[open.index]);
        i = open.index + 1;
        continue;
      }

      const innerParas = parseMarksToParagraphs(
        str.slice(contentStart, closed.closeAt),
        `${prefix}-${open.kind}${n}`,
      );
      flushText();
      if (innerParas.length <= 1) {
        buf.push(wrapNode(open, innerParas[0] || [], `${prefix}-m${n++}`));
      } else {
        buf.push(wrapNode(open, innerParas[0], `${prefix}-m${n++}`));
        flushPara();
        for (let p = 1; p < innerParas.length - 1; p += 1) {
          buf.push(wrapNode(open, innerParas[p], `${prefix}-m${n++}`));
          flushPara();
        }
        buf.push(wrapNode(open, innerParas[innerParas.length - 1], `${prefix}-m${n++}`));
      }
      i = closed.closeAt + closed.closeLen;
    }
  };

  walk(normalized, keyPrefix);
  flushPara();
  return paragraphs;
}

function rgbToHex(input: string): string | null {
  const s = input.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return normalizeHex(s);
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const hex = [m[1], m[2], m[3]]
    .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  /* 문단 끝 placeholder <br>는 무시. 뒤에 콘텐츠가 있으면 소프트 줄바꿈. */
  if (tag === 'br') return isSoftBreakBr(el) ? '\n' : '';

  const richEarly = el.dataset.rich || '';
  if (richEarly === 'icon' || el.classList.contains('oc-rich-icon')) {
    const id = normalizeRichIconId(el.dataset.icon || '');
    return id ? richIconMarker(id) : '';
  }

  let out = Array.from(el.childNodes).map(serializeInline).join('');
  if (!out) return '';

  const rich = richEarly;
  const fw = el.style?.fontWeight || '';
  const fs = el.style?.fontStyle || '';
  const td = `${el.style?.textDecorationLine || ''} ${el.style?.textDecoration || ''}`;
  /* 인라인 style 상속/잔여로 중첩 마커가 이중 직렬화되지 않게 — data-rich·시맨틱 태그 우선 */
  const styledCarrier = Boolean(rich && rich !== 'bold' && rich !== 'italic' && rich !== 'underline' && rich !== 'strike' && rich !== 'soft');

  const bold =
    tag === 'strong' ||
    tag === 'b' ||
    el.classList.contains('oc-rich-strong') ||
    rich === 'bold' ||
    (!styledCarrier && !rich && (fw === 'bold' || fw === '700' || Number(fw) >= 600));
  const italic =
    tag === 'em' ||
    (tag === 'i' && !el.classList.contains('ti')) ||
    el.classList.contains('oc-rich-italic') ||
    rich === 'italic' ||
    (!styledCarrier && !rich && (fs === 'italic' || fs === 'oblique'));
  const underline =
    tag === 'u' ||
    el.classList.contains('oc-rich-underline') ||
    rich === 'underline' ||
    (!styledCarrier && !rich && td.includes('underline'));
  const strike =
    tag === 's' ||
    tag === 'strike' ||
    tag === 'del' ||
    el.classList.contains('oc-rich-strike') ||
    rich === 'strike' ||
    (!styledCarrier && !rich && td.includes('line-through'));
  const soft = el.classList.contains('oc-rich-soft') || rich === 'soft';
  const hex =
    el.classList.contains('oc-rich-color') || rich === 'color'
      ? rgbToHex(String(el.dataset.color || el.style?.color || ''))
      : tag === 'font' && el.getAttribute('color')
        ? rgbToHex(String(el.getAttribute('color') || ''))
        : null;
  const fontId =
    el.classList.contains('oc-rich-font') || rich === 'font'
      ? normalizeFontId(el.dataset.font || '')
      : null;
  const sizePx =
    el.classList.contains('oc-rich-size') || rich === 'size'
      ? normalizeSizePx(el.dataset.size || el.style?.fontSize?.replace('px', '') || '')
      : null;

  if (soft) out = `%%${out}%%`;
  if (strike) out = `~~${out}~~`;
  if (underline) out = `__${out}__`;
  if (italic) out = `//${out}//`;
  if (bold) out = `**${out}**`;
  if (hex) out = `{#${hex.slice(1)}}${out}{#}`;
  if (fontId) out = `{@${fontId}}${out}{/@}`;
  if (sizePx) out = `{=${sizePx}}${out}{/=}`;

  return out;
}

/** contentEditable 루트 → 마커 (문단 = \\n) */
export function editorHtmlToMarks(root: HTMLElement): string {
  const blocks: string[] = [];

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        blocks.push(child.textContent.replace(/\u00a0/g, ' '));
      }
      continue;
    }
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'hr' || el.dataset.rich === 'hr' || el.classList.contains('oc-rich-hr')) {
      blocks.push('---');
      continue;
    }
    if (tag === 'p' || tag === 'div' || tag === 'li') {
      const blank =
        el.classList.contains('oc-rich-p--blank') ||
        (!el.textContent?.replace(/\u00a0/g, '').trim() && !!el.querySelector('br'));
      const inline = blank ? '' : serializeInline(el).replace(/\u00a0/g, ' ');
      blocks.push(inline.trim() === '---' ? '---' : inline);
    }
  }

  if (!blocks.length) {
    return Array.from(root.childNodes).map(serializeInline).join('').replace(/\u00a0/g, ' ');
  }

  /* 맨 끝 빈 문단 1개는 유지 (다음 줄 캐럿·구분선 삽입용). 2개 이상만 축소 */
  while (blocks.length > 2 && blocks[blocks.length - 1] === '') blocks.pop();
  return blocks.join('\n');
}

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

  const paragraphs = parseMarksToParagraphs(normalized, 'p');
  const plains = projectPlainOffsets(normalized).plain.split('\n');

  if (Tag === 'span') {
    const flat = paragraphs.flatMap((nodes, i) =>
      i === 0 ? nodes : [<Fragment key={`sp-${i}`}> </Fragment>, ...nodes],
    );
    return <span className={className}>{flat}</span>;
  }

  /* as="p"는 문단 <p>와 중첩되어 hydration 오류 → 블록 래퍼는 항상 div */
  const Wrapper = 'div' as const;

  return (
    <Wrapper className={['oc-rich-text', className].filter(Boolean).join(' ')}>
      {paragraphs.map((nodes, i) => {
        const blank = !nodes.length;
        if ((plains[i] ?? '').trim() === '---') {
          return <hr key={i} className="oc-rich-hr" />;
        }
        return (
          <p key={i} className={blank ? 'oc-rich-p oc-rich-p--blank' : 'oc-rich-p'}>
            {blank ? '\u00A0' : nodes}
          </p>
        );
      })}
    </Wrapper>
  );
}
