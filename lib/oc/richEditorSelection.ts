/** contentEditable 문단 구조 ↔ 평문 오프셋 (문단 사이 \\n, 마커 plain과 동일) */

export function getEditorBlocks(root: HTMLElement): HTMLElement[] {
  const blocks = [...root.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && ['P', 'DIV', 'LI'].includes(el.tagName),
  );
  return blocks.length ? blocks : [root];
}

/** DOM 보이는 글자 연결 (문단 경계에 \\n) */
export function getEditorDomPlain(root: HTMLElement): string {
  const blocks = getEditorBlocks(root);
  return blocks
    .map((b) => (b.textContent || '').replace(/\u00a0/g, ' '))
    .join('\n');
}

function textOffsetInBlock(block: HTMLElement, container: Node, offset: number): number {
  if (container === block) {
    if (offset <= 0) return 0;
    return (block.textContent || '').length;
  }
  if (!block.contains(container) && container !== block) return -1;

  if (container.nodeType === Node.TEXT_NODE) {
    let count = 0;
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walk.nextNode())) {
      if (n === container) return count + offset;
      count += n.textContent?.length ?? 0;
    }
    return count;
  }

  const el = container as HTMLElement;
  let count = 0;
  const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walk.nextNode())) {
    if (!el.contains(n)) {
      if (el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) break;
      count += n.textContent?.length ?? 0;
      continue;
    }
    let idx = 0;
    if (n.parentNode === el) idx = [...el.childNodes].indexOf(n as ChildNode);
    else {
      let climb: Node | null = n;
      while (climb && climb.parentNode !== el) climb = climb.parentNode;
      idx = climb ? [...el.childNodes].indexOf(climb as ChildNode) : 0;
    }
    if (idx < offset) count += n.textContent?.length ?? 0;
    else break;
  }
  return count;
}

export function getPlainSelectionOffsets(
  root: HTMLElement,
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
    const blockLen = (block.textContent || '').length;

    if (block === range.startContainer || block.contains(range.startContainer)) {
      const local = textOffsetInBlock(block, range.startContainer, range.startOffset);
      if (local >= 0) start = plain + local;
    }
    if (block === range.endContainer || block.contains(range.endContainer)) {
      const local = textOffsetInBlock(block, range.endContainer, range.endOffset);
      if (local >= 0) end = plain + local;
    }

    plain += blockLen;
    if (bi < blocks.length - 1) plain += 1;
  }

  if (start < 0 || end < 0 || start === end) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function setPlainSelectionOffsets(root: HTMLElement, start: number, end: number) {
  const blocks = getEditorBlocks(root);
  let plain = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;

  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi];
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walk.nextNode())) {
      const len = n.textContent?.length ?? 0;
      if (!startNode && plain + len >= start) {
        startNode = n as Text;
        startOff = start - plain;
      }
      if (!endNode && plain + len >= end) {
        endNode = n as Text;
        endOff = end - plain;
        break;
      }
      plain += len;
    }
    if (endNode) break;
    if (bi < blocks.length - 1) plain += 1;
  }

  const sel = window.getSelection();
  if (!sel || !startNode) return;
  if (!endNode) {
    endNode = startNode;
    endOff = startNode.length;
  }

  const range = document.createRange();
  range.setStart(startNode, Math.max(0, Math.min(startOff, startNode.length)));
  range.setEnd(endNode, Math.max(0, Math.min(endOff, endNode.length)));
  sel.removeAllRanges();
  sel.addRange(range);
}
