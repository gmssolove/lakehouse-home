/** 홈 메뉴·상세 패널 등 스크롤 컨테이너를 맨 위로. */
export function scrollPanelToTop(from?: Element | null) {
  const targets: HTMLElement[] = [];
  const add = (el: Element | null | undefined) => {
    if (el instanceof HTMLElement && !targets.includes(el)) targets.push(el);
  };

  if (from instanceof Element) {
    let node: HTMLElement | null = from instanceof HTMLElement ? from : from.parentElement;
    while (node) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        add(node);
      }
      if (
        node.classList.contains('content-block') ||
        node.classList.contains('pair-detail-screen') ||
        node.classList.contains('archive-layout') ||
        node.classList.contains('records-layout')
      ) {
        add(node);
        break;
      }
      node = node.parentElement;
    }
  }

  add(document.querySelector('.layout.layout--home .content-block.active'));

  for (const el of targets) {
    if (el.scrollTop !== 0) el.scrollTop = 0;
  }
}
