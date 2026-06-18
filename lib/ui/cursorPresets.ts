export type CursorPresetId = 'ring' | 'dot' | 'shard' | 'cross' | 'custom';

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
    id: 'custom',
    label: 'Custom — 직접 업로드',
    css: 'auto',
    cssPointer: 'pointer',
  },
];
