export type CursorPresetId =
  | 'ring'
  | 'dot'
  | 'shard'
  | 'cross'
  | 'classic'
  | 'classicHand'
  | 'classicCross'
  | 'classicMove'
  | 'classicWait'
  | 'custom';

/** CSS cursor 값용 SVG data URL */
function cur(svg: string, x: number, y: number, fallback: 'auto' | 'pointer'): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
}

/* 클래식 OS 커서 — 두꺼운 다크 테두리 · 밝은 회색 채움 · 왼쪽 베벨 음영 */
const O = '#1f1f1f';
const F = '#e4e4e4';
const S = '#9a9a9a';

/** 기본 화살표 (업로드해 주신 모양) */
const svgArrow = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${F}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round" d="M4.5 2.5v21.5l5.4-4.6 3.5 8.4 3.5-1.5-3.6-8.5H22Z"/><path fill="${S}" d="M6.2 4.8v15.6l3.5-3V8.2Z"/></svg>`;

/** 클릭용 검지 포인터 */
const svgPointer = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${F}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round" d="M12.2 2.8c-1.1 0-2 .9-2 2v9.6l-2.4-1.6c-.9-.6-2.1-.4-2.7.5-.6.9-.4 2.1.5 2.7l6.2 4.1-1 6.2c-.2 1.3.7 2.5 2 2.7h.6c1.1 0 2.1-.8 2.3-1.9l1.3-5.8 4.2 1.3c1.2.4 2.5-.3 2.8-1.5.1-.4.1-.7 0-1.1l-.8-3.2c-.4-1.4-1.2-1.9-2.3-1.9h-1.2V4.8c0-1.1-.9-2-2-2s-2 .9-2 2v5.6h-1V4.8c0-1.1-.9-2-2-2z"/><path fill="${S}" d="M11 4.9v10.6l1.35.9V4.9c0-.4-.3-.75-.7-.75s-.65.35-.65.75z"/></svg>`;

/** 편 손 (호버/드래그) */
const svgHand = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${F}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round" d="M10.8 3.2c-1 0-1.8.8-1.8 1.8v8.4H8.2c-1.1 0-2 .9-2 2v.8c0 .5.2.9.5 1.3l.3.3c-.7.4-1.2 1.1-1.2 1.9v.7c0 .5.2 1 .5 1.3-.6.4-1 1-1 1.7v.6c0 1.5 1.2 2.7 2.7 2.7h9.2c1.7 0 3.1-1.2 3.4-2.8l1.2-5.6c.2-.9.2-1.7 0-2.5l-.7-2.4c-.3-1.1-1-1.6-1.9-1.6h-1V5c0-1-.8-1.8-1.8-1.8S15.4 4 15.4 5v6.6h-.9V5c0-1-.8-1.8-1.8-1.8s-1.8.8-1.8 1.8v8.2h-.9V5c0-1-.8-1.8-1.8-1.8z"/><path fill="${S}" d="M9.8 5.1v9.2h1.25V5.1c0-.4-.3-.7-.6-.7s-.65.3-.65.7z"/></svg>`;

/** 십자 정밀 커서 */
const svgCross = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${F}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round" d="M14 3.5h4v10.5h10.5v4H18v10.5h-4V18H3.5v-4H14z"/><path fill="${S}" d="M14 3.5h1.6v10.5H3.5v1.6H15.6V3.5z"/><circle cx="16" cy="16" r="1.7" fill="${O}"/></svg>`;

/** 사방 이동 */
const svgMove = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${F}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round" d="M16 3.5 21 9.2h-3.2v5.3h5.3V11.3L28.5 16 23.1 20.7v-3.2h-5.3v5.3h3.2L16 28.5 11 22.8h3.2v-5.3H9.0v3.2L3.5 16 9 11.3v3.2h5.2V9.2H11z"/><path fill="${S}" d="M16 5.4 13.4 9.2h1.5v6.5H8.4v-1.5L5.6 16l2.8 2.3v-1.5h6.5v6.5h-1.5L16 26.6V5.4z"/></svg>`;

/** 모래시계 */
const svgWait = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${F}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round" d="M9.5 4h13v4.5L17.8 13l4.7 4.5V22h-13v-4.5L14.2 13 9.5 8.5z"/><path fill="${S}" d="M9.5 4h2.4v3.8L9.5 9.8zm0 18h2.4v-3.8L9.5 16.2z"/><path fill="none" stroke="${O}" stroke-width="1.3" d="M12.8 14.2h6.4"/><circle cx="16" cy="9.6" r="1.15" fill="${O}"/><circle cx="16" cy="20.4" r="1.15" fill="${O}"/></svg>`;

const svgWaitBusy = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${F}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round" d="M9.5 4h13v4.5L17.8 13l4.7 4.5V22h-13v-4.5L14.2 13 9.5 8.5z"/><path fill="${S}" d="M9.5 4h2.4v3.8L9.5 9.8zm0 18h2.4v-3.8L9.5 16.2z"/><path fill="none" stroke="${O}" stroke-width="1.5" d="M12.5 12.5c1.4-1.6 5.6-1.6 7 0M12.5 17.5c1.4 1.6 5.6 1.6 7 0"/></svg>`;

export const CURSOR_PRESETS: { id: CursorPresetId; label: string; css: string; cssPointer: string }[] = [
  {
    id: 'ring',
    label: 'Ring — 골드 링',
    css: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Ccircle cx='10' cy='10' r='6.5' fill='none' stroke='%23d7a982' stroke-width='1.2'/%3E%3Ccircle cx='10' cy='10' r='2' fill='%23f0cfad'/%3E%3C/svg%3E") 10 10, auto`,
    cssPointer: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'%3E%3Ccircle cx='11' cy='11' r='7.5' fill='none' stroke='%23f0cfad' stroke-width='1.4'/%3E%3Ccircle cx='11' cy='11' r='2.5' fill='%23f0cfad'/%3E%3C/svg%3E") 11 11, pointer`,
  },
  {
    id: 'dot',
    label: 'Dot — 작은 점',
    css: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3.5' fill='%23f0cfad' opacity='.88'/%3E%3C/svg%3E") 8 8, auto`,
    cssPointer: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Ccircle cx='9' cy='9' r='4.5' fill='%23f0cfad'/%3E%3C/svg%3E") 9 9, pointer`,
  },
  {
    id: 'shard',
    label: 'Shard — 다이아',
    css: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpath d='M9 2 L15 9 L9 16 L3 9 Z' fill='none' stroke='%23d7a982' stroke-width='1.1'/%3E%3Ccircle cx='9' cy='9' r='1.6' fill='%23f0cfad'/%3E%3C/svg%3E") 9 9, auto`,
    cssPointer: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M10 2 L17 10 L10 18 L3 10 Z' fill='none' stroke='%23f0cfad' stroke-width='1.3'/%3E%3Ccircle cx='10' cy='10' r='2' fill='%23f0cfad'/%3E%3C/svg%3E") 10 10, pointer`,
  },
  {
    id: 'cross',
    label: 'Cross — 십자',
    css: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpath d='M9 3v12M3 9h12' stroke='%23d7a982' stroke-width='1' opacity='.75'/%3E%3Ccircle cx='9' cy='9' r='2' fill='%23f0cfad'/%3E%3C/svg%3E") 9 9, auto`,
    cssPointer: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M10 3v14M3 10h14' stroke='%23f0cfad' stroke-width='1.1'/%3E%3Ccircle cx='10' cy='10' r='2.2' fill='%23f0cfad'/%3E%3C/svg%3E") 10 10, pointer`,
  },
  {
    id: 'classic',
    label: 'Classic — 화살표',
    css: cur(svgArrow, 5, 3, 'auto'),
    cssPointer: cur(svgPointer, 10, 3, 'pointer'),
  },
  {
    id: 'classicHand',
    label: 'Classic — 손',
    css: cur(svgHand, 11, 3, 'auto'),
    cssPointer: cur(svgPointer, 10, 3, 'pointer'),
  },
  {
    id: 'classicCross',
    label: 'Classic — 십자',
    css: cur(svgCross, 16, 16, 'auto'),
    cssPointer: cur(svgCross, 16, 16, 'pointer'),
  },
  {
    id: 'classicMove',
    label: 'Classic — 이동',
    css: cur(svgMove, 16, 16, 'auto'),
    cssPointer: cur(svgHand, 11, 3, 'pointer'),
  },
  {
    id: 'classicWait',
    label: 'Classic — 대기',
    css: cur(svgWait, 16, 16, 'auto'),
    cssPointer: cur(svgWaitBusy, 16, 16, 'pointer'),
  },
  {
    id: 'custom',
    label: 'Custom — 직접 업로드',
    css: 'auto',
    cssPointer: 'pointer',
  },
];
