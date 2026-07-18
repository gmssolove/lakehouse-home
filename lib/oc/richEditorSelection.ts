/** contentEditable 문단 구조 ↔ 평문 오프셋 (문단 사이 \\n, 마커 plain과 동일) */

import { RICH_ICON_PLAIN } from '@/lib/oc/richIcons';

function isHrBlock(el: HTMLElement): boolean {
  return (
    el.tagName === 'HR' ||
    el.dataset.rich === 'hr' ||
    el.classList.contains('oc-rich-hr')
  );
}

function isIconEl(el: HTMLElement): boolean {
  return el.dataset.rich === 'icon' || el.classList.contains('oc-rich-icon');
}

type InlineUnit =
  | { kind: 'text'; node: Text; len: number }
  | { kind: 'icon'; el: HTMLElement; len: 1 }
  | { kind: 'br'; el: HTMLElement; len: 1 };

/** 뒤에 실질 콘텐츠가 있는 <br>만 줄바꿈. 문단 끝 placeholder <br>는 무시. */
export function isSoftBreakBr(el: HTMLElement): boolean {
  for (let sib = el.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.nodeType === Node.TEXT_NODE) {
      if ((sib.textContent || '').replace(/\u00a0/g, ' ').length) return true;
      continue;
    }
    if (sib.nodeType !== Node.ELEMENT_NODE) continue;
    const child = sib as HTMLElement;
    if (child.tagName === 'BR') return true;
    if (isIconEl(child)) return true;
    if ((child.textContent || '').replace(/\u00a0/g, '').trim()) return true;
    if (child.querySelector('br, .oc-rich-icon, [data-rich="icon"]')) return true;
  }
  return false;
}

function isVisuallyEmptyBlock(block: HTMLElement): boolean {
  if (block.classList.contains('oc-rich-p--blank')) return true;
  return !(block.textContent || '').replace(/\u00a0/g, '').trim();
}

function collectInlineUnits(block: HTMLElement): InlineUnit[] {
  if (isVisuallyEmptyBlock(block)) return [];
  const units: InlineUnit[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text;
      const len = (t.textContent || '').replace(/\u00a0/g, ' ').length;
      if (len) units.push({ kind: 'text', node: t, len });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (isIconEl(el)) {
      units.push({ kind: 'icon', el, len: 1 });
      return;
    }
    if (el.tagName === 'BR') {
      if (isSoftBreakBr(el)) units.push({ kind: 'br', el, len: 1 });
      return;
    }
    for (const c of el.childNodes) walk(c);
  };
  for (const c of block.childNodes) walk(c);
  return units;
}

function blockPlainLen(block: HTMLElement): number {
  if (isHrBlock(block)) return 3;
  return collectInlineUnits(block).reduce((n, u) => n + u.len, 0);
}

function blockPlainText(block: HTMLElement): string {
  if (isHrBlock(block)) return '---';
  let out = '';
  for (const u of collectInlineUnits(block)) {
    if (u.kind === 'icon') out += RICH_ICON_PLAIN;
    else if (u.kind === 'br') out += '\n';
    else out += (u.node.textContent || '').replace(/\u00a0/g, ' ');
  }
  return out;
}

export function getEditorBlocks(root: HTMLElement): HTMLElement[] {
  const blocks = [...root.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      (['P', 'DIV', 'LI', 'HR'].includes(el.tagName) || isHrBlock(el)),
  );
  return blocks.length ? blocks : [root];
}

export function getEditorDomPlain(root: HTMLElement): string {
  return getEditorBlocks(root).map(blockPlainText).join('\n');
}

function offsetInBlock(block: HTMLElement, container: Node, offset: number): number {
  if (isHrBlock(block)) return 0;
  const units = collectInlineUnits(block);

  if (container === block) {
    if (offset <= 0) return 0;
    let seen = 0;
    let childI = 0;
    for (const child of block.childNodes) {
      if (childI >= offset) break;
      if (child.nodeType === Node.ELEMENT_NODE && isIconEl(child as HTMLElement)) seen += 1;
      else if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as HTMLElement).tagName === 'BR' &&
        isSoftBreakBr(child as HTMLElement)
      ) {
        seen += 1;
      } else if (child.nodeType === Node.TEXT_NODE) {
        seen += (child.textContent || '').replace(/\u00a0/g, ' ').length;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        seen += collectInlineUnits(child as HTMLElement).reduce((n, u) => n + u.len, 0);
      }
      childI += 1;
    }
    return seen;
  }

  let count = 0;
  for (const unit of units) {
    if (unit.kind === 'icon' || unit.kind === 'br') {
      if (container === unit.el || unit.el.contains(container)) {
        return count + (offset > 0 ? 1 : 0);
      }
      const parent = unit.el.parentNode;
      if (container === parent) {
        const idx = [...parent!.childNodes].indexOf(unit.el);
        if (offset <= idx) return count;
        if (offset === idx + 1) return count + 1;
      }
      count += 1;
      continue;
    }
    if (unit.node === container) return count + Math.min(Math.max(0, offset), unit.len);
    count += unit.len;
  }
  return count;
}

function pointFromPlain(
  block: HTMLElement,
  local: number,
): { node: Node; offset: number } | null {
  const units = collectInlineUnits(block);
  let pos = 0;
  for (const unit of units) {
    if (pos + unit.len >= local) {
      if (unit.kind === 'text') {
        return { node: unit.node, offset: local - pos };
      }
      const parent = unit.el.parentNode;
      if (!parent) return null;
      const idx = [...parent.childNodes].indexOf(unit.el);
      return { node: parent, offset: local > pos ? idx + 1 : idx };
    }
    pos += unit.len;
  }
  if (!units.length) {
    return { node: block, offset: 0 };
  }
  const last = units[units.length - 1];
  if (last.kind === 'text') {
    return { node: last.node, offset: last.len };
  }
  const parent = last.el.parentNode;
  if (!parent) return null;
  return { node: parent, offset: [...parent.childNodes].indexOf(last.el) + 1 };
}

export function getPlainSelectionOffsets(
  root: HTMLElement,
  opts?: { allowCollapsed?: boolean },
): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const blocks = getEditorBlocks(root);
  let plain = 0;
  let start = -1;
  let end = -1;

  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi];
    const blockLen = blockPlainLen(block);

    if (isHrBlock(block)) {
      if (block === range.startContainer || block.contains(range.startContainer)) start = plain;
      if (block === range.endContainer || block.contains(range.endContainer)) end = plain + blockLen;
    } else {
      if (block === range.startContainer || block.contains(range.startContainer)) {
        start = plain + offsetInBlock(block, range.startContainer, range.startOffset);
      }
      if (block === range.endContainer || block.contains(range.endContainer)) {
        end = plain + offsetInBlock(block, range.endContainer, range.endOffset);
      }
    }

    plain += blockLen;
    if (bi < blocks.length - 1) plain += 1;
  }

  if (start < 0 || end < 0) return null;
  if (start === end && !opts?.allowCollapsed) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function setPlainSelectionOffsets(root: HTMLElement, start: number, end: number) {
  const blocks = getEditorBlocks(root);
  let plain = 0;
  let startPt: { node: Node; offset: number } | null = null;
  let endPt: { node: Node; offset: number } | null = null;
  let caretBlock: HTMLElement | null = null;

  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi];
    const blockLen = blockPlainLen(block);

    if (isHrBlock(block)) {
      const inHr = start >= plain && start <= plain + blockLen;
      const endInHr = end >= plain && end <= plain + blockLen;
      if (!startPt && inHr) {
        let nextBlock = blocks[bi + 1] || null;
        if (!nextBlock) {
          const blank = document.createElement('p');
          blank.className = 'oc-rich-p oc-rich-p--blank';
          blank.appendChild(document.createElement('br'));
          root.appendChild(blank);
          nextBlock = blank;
        }
        caretBlock = nextBlock;
      }
      if (!endPt && endInHr) {
        caretBlock = blocks[bi + 1] || caretBlock;
        break;
      }
      plain += blockLen;
      if (bi < blocks.length - 1) plain += 1;
      continue;
    }

    if (!startPt && start <= plain + blockLen) {
      startPt = pointFromPlain(block, Math.max(0, start - plain));
    }
    if (!endPt && end <= plain + blockLen) {
      endPt = pointFromPlain(block, Math.max(0, end - plain));
      break;
    }

    if (blockLen === 0) {
      if (!startPt && plain >= start) caretBlock = block;
      if (!endPt && plain >= end) {
        caretBlock = block;
        break;
      }
    }

    plain += blockLen;
    if (bi < blocks.length - 1) plain += 1;
  }

  const sel = window.getSelection();
  if (!sel) return;

  if (!startPt && caretBlock) {
    const range = document.createRange();
    range.selectNodeContents(caretBlock);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  if (!startPt || !endPt) return;

  try {
    const range = document.createRange();
    range.setStart(startPt.node, Math.max(0, startPt.offset));
    range.setEnd(endPt.node, Math.max(0, endPt.offset));
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore */
  }
}
