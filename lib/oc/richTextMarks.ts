/**
 * 서사/로그 인라인 마커 — 순수 문자열 로직 (React 없음)
 * - **굵게**  //기울임//  __밑줄__  ~~취소선~~  %%옅게%%
 * - {#RRGGBB}색{#}
 * - {@fontId}폰트{/@}  (레거시 닫기 {@} 도 읽기)
 * - {=18}크기(px){/=}  (레거시 닫기 {=} 도 읽기)
 * - {!icon-name} Tabler 단색 아이콘 (void)
 * 서로 다른 종류는 순서 무관하게 중첩 가능
 */

import {
  matchRichIconAt,
  normalizeRichIconId,
  RICH_ICON_PLAIN,
  richIconMarker,
  richIconToHtml,
} from '@/lib/oc/richIcons';

export type RichMarkKind =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'soft'
  | 'color'
  | 'font'
  | 'size';

export type WrapOpts = {
  colorHex?: string;
  fontId?: string;
  sizePx?: number;
  /** true면 같은 값이 이미 있어도 해제(토글)하지 않고 유지 */
  keepIfSame?: boolean;
  /** true면 해당 서식을 무조건 제거 (색 초기화 등) */
  clear?: boolean;
}

export const STORY_RICH_FONTS = [
  { id: 'chosun', label: '조선명조', css: "'ChosunNm', serif" },
  { id: 'pretendard', label: 'Pretendard', css: "'Pretendard', system-ui, sans-serif" },
  { id: 'noto-serif', label: 'Noto Serif', css: "var(--font-noto-serif-google), 'Noto Serif KR', serif" },
  { id: 'noto-sans', label: 'Noto Sans', css: "var(--font-noto-sans-kr), 'Noto Sans KR', sans-serif" },
  { id: 'marcellus', label: 'Marcellus', css: "var(--font-marcellus), Marcellus, serif" },
  { id: 'cormorant', label: 'Cormorant', css: "var(--font-cormorant), 'Cormorant Garamond', serif" },
  { id: 'jost', label: 'Jost', css: "var(--font-jost), Jost, sans-serif" },
] as const;

export type StoryRichFontId = (typeof STORY_RICH_FONTS)[number]['id'];

/** 로그/서사 본문 글자 크기 (px) — 0.5px 단위 */
export const STORY_RICH_SIZE_MIN = 10;
export const STORY_RICH_SIZE_MAX = 48;
/** 서식 없는 본문 기본 크기(px) — 에디터/렌더 CSS(.lh-story-rich__editor)와 동일 */
export const STORY_RICH_SIZE_BASE = 14.5;
export const STORY_RICH_SIZE_STEP = 0.5;
export const STORY_RICH_SIZES = Array.from(
  { length: STORY_RICH_SIZE_MAX - STORY_RICH_SIZE_MIN + 1 },
  (_, i) => STORY_RICH_SIZE_MIN + i,
) as readonly number[];

type DelimKind = Exclude<RichMarkKind, 'color' | 'font' | 'size'>;

type DelimDef = { kind: DelimKind; token: string };

const DELIMS: DelimDef[] = [
  { kind: 'bold', token: '**' },
  { kind: 'italic', token: '//' },
  { kind: 'underline', token: '__' },
  { kind: 'strike', token: '~~' },
  { kind: 'soft', token: '%%' },
];

const WRAP: Record<DelimKind, [string, string]> = {
  bold: ['**', '**'],
  italic: ['//', '//'],
  underline: ['__', '__'],
  strike: ['~~', '~~'],
  soft: ['%%', '%%'],
};

const COLOR_OPEN_RE = /^\{#([0-9a-fA-F]{3,8})\}/;
const FONT_OPEN_RE = /^\{@([a-z0-9-]+)\}/;
const SIZE_OPEN_RE = /^\{=([1-9]\d?(?:\.\d)?)\}/;

export function normalizeHex(raw: string): string | null {
  const h = raw.replace(/^#/, '');
  if (h.length === 3) {
    return `#${h
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  if (h.length === 6 || h.length === 8) return `#${h}`;
  return null;
}

export function normalizeFontId(raw: string): StoryRichFontId | null {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  return STORY_RICH_FONTS.some((f) => f.id === id) ? (id as StoryRichFontId) : null;
}

export function normalizeSizePx(raw: number | string): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  /* 0.5px 단위로 스냅 */
  const px = Math.round(n * 2) / 2;
  if (px < STORY_RICH_SIZE_MIN || px > STORY_RICH_SIZE_MAX) return null;
  return px;
}

function matchColorOpen(text: string, at: number): { hex: string; len: number } | null {
  const m = text.slice(at).match(COLOR_OPEN_RE);
  if (!m) return null;
  const hex = normalizeHex(m[1]);
  if (!hex) return null;
  return { hex, len: m[0].length };
}

function matchFontOpen(text: string, at: number): { fontId: string; len: number } | null {
  const m = text.slice(at).match(FONT_OPEN_RE);
  if (!m) return null;
  const fontId = normalizeFontId(m[1]);
  if (!fontId) return null;
  return { fontId, len: m[0].length };
}

function matchSizeOpen(text: string, at: number): { sizePx: number; len: number } | null {
  const m = text.slice(at).match(SIZE_OPEN_RE);
  if (!m) return null;
  const sizePx = normalizeSizePx(m[1]);
  if (!sizePx) return null;
  return { sizePx, len: m[0].length };
}

function findTokenClose(text: string, from: number, token: string): number {
  let i = from;
  while (i < text.length) {
    if (text.startsWith(token, i)) return i;
    i += 1;
  }
  return -1;
}

/** `{#hex}…{#}` depth */
function findColorClose(text: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < text.length) {
    if (text.startsWith('{#', i)) {
      const after = text.slice(i + 2);
      const open = after.match(/^([0-9a-fA-F]{3,8})\}/);
      if (open) {
        depth += 1;
        i += 2 + open[1].length + 1;
        continue;
      }
      if (after.startsWith('}')) {
        depth -= 1;
        if (depth === 0) return i;
        i += 3;
        continue;
      }
    }
    i += 1;
  }
  return -1;
}

/** `{@id}…{/@}` (레거시 `{@}`) */
function findFontClose(text: string, from: number): { at: number; len: number } | null {
  let depth = 1;
  let i = from;
  while (i < text.length) {
    if (text.startsWith('{/@}', i)) {
      depth -= 1;
      if (depth === 0) return { at: i, len: 4 };
      i += 4;
      continue;
    }
    if (text.startsWith('{@', i)) {
      const after = text.slice(i + 2);
      const open = after.match(/^([a-z0-9-]+)\}/);
      if (open) {
        depth += 1;
        i += 2 + open[1].length + 1;
        continue;
      }
      /* legacy close {@} */
      if (after.startsWith('}')) {
        depth -= 1;
        if (depth === 0) return { at: i, len: 3 };
        i += 3;
        continue;
      }
    }
    i += 1;
  }
  return null;
}

/** `{=N}…{/=}` (레거시 `{=}`) */
function findSizeClose(text: string, from: number): { at: number; len: number } | null {
  let depth = 1;
  let i = from;
  while (i < text.length) {
    if (text.startsWith('{/=}', i)) {
      depth -= 1;
      if (depth === 0) return { at: i, len: 4 };
      i += 4;
      continue;
    }
    if (text.startsWith('{=', i)) {
      const after = text.slice(i + 2);
      const open = after.match(/^([1-9]\d?(?:\.\d)?)\}/);
      if (open) {
        depth += 1;
        i += 2 + open[1].length + 1;
        continue;
      }
      /* legacy close {=} */
      if (after.startsWith('}')) {
        depth -= 1;
        if (depth === 0) return { at: i, len: 3 };
        i += 3;
        continue;
      }
    }
    i += 1;
  }
  return null;
}

export type OpenHit =
  | { kind: DelimKind; index: number; openLen: number; token: string }
  | { kind: 'color'; index: number; openLen: number; hex: string }
  | { kind: 'font'; index: number; openLen: number; fontId: string }
  | { kind: 'size'; index: number; openLen: number; sizePx: number };

export function findEarliestOpen(text: string, from: number): OpenHit | null {
  let hit: OpenHit | null = null;

  for (let i = from; i < text.length; i += 1) {
    const color = matchColorOpen(text, i);
    if (color) {
      const cand: OpenHit = { kind: 'color', index: i, openLen: color.len, hex: color.hex };
      if (!hit || cand.index < hit.index) hit = cand;
    }
    const font = matchFontOpen(text, i);
    if (font) {
      const cand: OpenHit = { kind: 'font', index: i, openLen: font.len, fontId: font.fontId };
      if (!hit || cand.index < hit.index || (cand.index === hit.index && cand.openLen > hit.openLen)) {
        hit = cand;
      }
    }
    const size = matchSizeOpen(text, i);
    if (size) {
      const cand: OpenHit = { kind: 'size', index: i, openLen: size.len, sizePx: size.sizePx };
      if (!hit || cand.index < hit.index || (cand.index === hit.index && cand.openLen > hit.openLen)) {
        hit = cand;
      }
    }

    for (const d of DELIMS) {
      if (text.startsWith(d.token, i)) {
        const cand: OpenHit = {
          kind: d.kind,
          index: i,
          openLen: d.token.length,
          token: d.token,
        };
        if (
          !hit ||
          cand.index < hit.index ||
          (cand.index === hit.index && cand.openLen > hit.openLen)
        ) {
          hit = cand;
        }
      }
    }

    if (hit && hit.index === i) break;
  }

  return hit;
}

export function findMarkClose(
  text: string,
  contentStart: number,
  open: OpenHit,
): { closeAt: number; closeLen: number } | null {
  if (open.kind === 'color') {
    const closeAt = findColorClose(text, contentStart);
    return closeAt < 0 ? null : { closeAt, closeLen: 3 };
  }
  if (open.kind === 'font') {
    const closed = findFontClose(text, contentStart);
    return closed ? { closeAt: closed.at, closeLen: closed.len } : null;
  }
  if (open.kind === 'size') {
    const closed = findSizeClose(text, contentStart);
    return closed ? { closeAt: closed.at, closeLen: closed.len } : null;
  }
  const closeAt = findTokenClose(text, contentStart, open.token);
  return closeAt < 0 ? null : { closeAt, closeLen: open.token.length };
}

/** 마커 제외 평문 + plain→mark 인덱스 맵 */
export function projectPlainOffsets(marks: string): { plain: string; toMark: number[] } {
  const normalized = String(marks ?? '').replace(/\r\n/g, '\n');
  let plain = '';
  const toMark: number[] = [];

  const feedLiteral = (chunk: string, base: number) => {
    for (let k = 0; k < chunk.length; k += 1) {
      toMark[plain.length] = base + k;
      plain += chunk[k];
    }
  };

  const walk = (str: string, base: number) => {
    let i = 0;
    while (i < str.length) {
      const icon = matchRichIconAt(str, i);
      if (icon) {
        toMark[plain.length] = base + i;
        plain += RICH_ICON_PLAIN;
        i += icon.len;
        continue;
      }

      const open = findEarliestOpen(str, i);
      if (!open) {
        /* 남은 구간의 아이콘만 분리 */
        let j = i;
        while (j < str.length) {
          const restIcon = matchRichIconAt(str, j);
          if (restIcon) {
            toMark[plain.length] = base + j;
            plain += RICH_ICON_PLAIN;
            j += restIcon.len;
            continue;
          }
          const bang = str.indexOf('{!', j);
          if (bang < 0) {
            feedLiteral(str.slice(j), base + j);
            break;
          }
          if (bang > j) feedLiteral(str.slice(j, bang), base + j);
          j = bang;
        }
        break;
      }
      if (open.index > i) {
        const bang = str.indexOf('{!', i);
        if (bang >= 0 && bang < open.index) {
          if (bang > i) feedLiteral(str.slice(i, bang), base + i);
          i = bang;
          continue;
        }
        feedLiteral(str.slice(i, open.index), base + i);
        i = open.index;
        continue;
      }

      const contentStart = open.index + open.openLen;
      const closed = findMarkClose(str, contentStart, open);
      if (!closed) {
        /* 닫힘 없는 유사 마커는 코드로 노출하지 않고 `{` 한 글자만 통과 */
        feedLiteral(str[open.index], base + open.index);
        i = open.index + 1;
        continue;
      }

      walk(str.slice(contentStart, closed.closeAt), base + contentStart);
      i = closed.closeAt + closed.closeLen;
    }
  };

  walk(normalized, 0);
  // Caret after last plain char (before any trailing close markers).
  toMark[plain.length] =
    plain.length > 0 ? (toMark[plain.length - 1] ?? 0) + 1 : 0;
  return { plain, toMark };
}

export function plainOffsetsToMarkOffsets(
  marks: string,
  plainStart: number,
  plainEnd: number,
): { start: number; end: number } {
  const { plain, toMark } = projectPlainOffsets(marks);
  const a = Math.max(0, Math.min(plainStart, plain.length));
  const b = Math.max(0, Math.min(plainEnd, plain.length));
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const end =
    hi === lo || hi >= plain.length
      ? (toMark[hi] ?? marks.length)
      : (toMark[hi - 1] ?? 0) + 1;
  return {
    start: toMark[lo] ?? 0,
    end,
  };
}

/* ==========================================================================
   문자 단위 속성 모델
   - 마커 문자열 ↔ "평문 글자마다 활성 서식" 배열로 변환
   - 서식 적용을 인덱스 문자열 수술 대신 속성 토글로 처리
     → 선택 구간의 공백도 항상 포함되고, 기존 서식과 겹쳐도 마커가 깨지지 않음
   ========================================================================== */

export type RichAttr = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  soft?: boolean;
  color?: string;
  font?: string;
  size?: number;
};

export type RichCharAttr = RichAttr & { ch: string; icon?: string };

const BOOL_KINDS = ['bold', 'italic', 'underline', 'strike', 'soft'] as const;
type BoolKind = (typeof BOOL_KINDS)[number];

/** 마커 문자열 → 평문 글자마다 활성 서식 (문단 사이 \n 포함, projectPlainOffsets와 같은 순회) */
export function marksToCharAttrs(marks: string): RichCharAttr[] {
  const normalized = String(marks ?? '').replace(/\r\n/g, '\n');
  const chars: RichCharAttr[] = [];

  const feed = (chunk: string, active: RichAttr) => {
    for (const ch of chunk) chars.push({ ...active, ch });
  };

  const walk = (str: string, active: RichAttr) => {
    let i = 0;
    while (i < str.length) {
      const icon = matchRichIconAt(str, i);
      if (icon) {
        chars.push({ ...active, ch: RICH_ICON_PLAIN, icon: icon.id });
        i += icon.len;
        continue;
      }

      const open = findEarliestOpen(str, i);
      if (!open) {
        let j = i;
        while (j < str.length) {
          const restIcon = matchRichIconAt(str, j);
          if (restIcon) {
            chars.push({ ...active, ch: RICH_ICON_PLAIN, icon: restIcon.id });
            j += restIcon.len;
            continue;
          }
          const bang = str.indexOf('{!', j);
          if (bang < 0) {
            feed(str.slice(j), active);
            break;
          }
          if (bang > j) feed(str.slice(j, bang), active);
          j = bang;
        }
        break;
      }
      if (open.index > i) {
        const bang = str.indexOf('{!', i);
        if (bang >= 0 && bang < open.index) {
          if (bang > i) feed(str.slice(i, bang), active);
          i = bang;
          continue;
        }
        feed(str.slice(i, open.index), active);
        i = open.index;
        continue;
      }

      const contentStart = open.index + open.openLen;
      const closed = findMarkClose(str, contentStart, open);
      if (!closed) {
        feed(str[open.index], active);
        i = open.index + 1;
        continue;
      }

      const nextActive: RichAttr = { ...active };
      switch (open.kind) {
        case 'bold':
        case 'italic':
        case 'underline':
        case 'strike':
        case 'soft':
          nextActive[open.kind] = true;
          break;
        case 'color':
          nextActive.color = open.hex;
          break;
        case 'font':
          nextActive.font = open.fontId;
          break;
        case 'size':
          nextActive.size = open.sizePx;
          break;
      }
      walk(str.slice(contentStart, closed.closeAt), nextActive);
      i = closed.closeAt + closed.closeLen;
    }
  };

  walk(normalized, {});
  return chars;
}

/** 한 글자의 활성 서식을 바깥→안 순서 마커 목록으로 (span 오래 유지되는 값 마커가 바깥) */
type MarkDesc = { kind: RichMarkKind; val?: string | number };

function orderedMarks(a: RichAttr): MarkDesc[] {
  const list: MarkDesc[] = [];
  if (a.size) list.push({ kind: 'size', val: a.size });
  if (a.font) list.push({ kind: 'font', val: a.font });
  if (a.color) list.push({ kind: 'color', val: a.color });
  if (a.bold) list.push({ kind: 'bold' });
  if (a.italic) list.push({ kind: 'italic' });
  if (a.underline) list.push({ kind: 'underline' });
  if (a.strike) list.push({ kind: 'strike' });
  if (a.soft) list.push({ kind: 'soft' });
  return list;
}

function markOpen(m: MarkDesc): string {
  switch (m.kind) {
    case 'bold':
      return '**';
    case 'italic':
      return '//';
    case 'underline':
      return '__';
    case 'strike':
      return '~~';
    case 'soft':
      return '%%';
    case 'color': {
      const hex = normalizeHex(String(m.val ?? '')) || String(m.val ?? '#d7a982');
      return `{#${hex.replace(/^#/, '')}}`;
    }
    case 'font':
      return `{@${m.val}}`;
    case 'size':
      return `{=${m.val}}`;
  }
}

function markClose(m: MarkDesc): string {
  switch (m.kind) {
    case 'bold':
      return '**';
    case 'italic':
      return '//';
    case 'underline':
      return '__';
    case 'strike':
      return '~~';
    case 'soft':
      return '%%';
    case 'color':
      return '{#}';
    case 'font':
      return '{/@}';
    case 'size':
      return '{/=}';
  }
}

function markEq(a: MarkDesc, b: MarkDesc): boolean {
  return a.kind === b.kind && (a.val ?? '') === (b.val ?? '');
}

/**
 * 문자 속성 배열 → 마커 문자열 (스택 기반 중첩 직렬화).
 * 같은 서식은 여러 글자에 걸쳐 한 번만 열고 닫아 마커 중복·빈 마커 없이 정규화.
 * 줄바꿈에서는 열린 마커를 모두 닫는다 (마커가 줄을 넘지 않게).
 */
export function charAttrsToMarks(chars: RichCharAttr[]): string {
  let out = '';
  let stack: MarkDesc[] = [];

  const closeFrom = (n: number) => {
    for (let k = stack.length - 1; k >= n; k -= 1) out += markClose(stack[k]);
    stack = stack.slice(0, n);
  };

  for (const c of chars) {
    if (c.ch === '\n') {
      closeFrom(0);
      out += '\n';
      continue;
    }
    const desired = orderedMarks(c);
    let common = 0;
    while (common < stack.length && common < desired.length && markEq(stack[common], desired[common])) {
      common += 1;
    }
    closeFrom(common);
    for (let k = common; k < desired.length; k += 1) {
      out += markOpen(desired[k]);
      stack.push(desired[k]);
    }
    if (c.icon) {
      out += richIconMarker(c.icon);
      continue;
    }
    if (c.ch === RICH_ICON_PLAIN) continue;
    out += c.ch;
  }
  closeFrom(0);
  return out;
}

/**
 * 선택 평문 구간 [plainStart, plainEnd)에 서식 적용/토글.
 * - 공백 포함 모든 글자에 동일 적용 (줄바꿈만 건너뜀)
 * - 구간 전체가 이미 해당 서식이면 해제(토글), 아니면 전체 적용
 * - keepIfSame: 이미 같아도 해제하지 않고 유지
 */
export function applyRichRange(
  marks: string,
  plainStart: number,
  plainEnd: number,
  kind: RichMarkKind,
  opts: WrapOpts = {},
): { next: string; changed: boolean } {
  const chars = marksToCharAttrs(marks);
  const len = chars.length;
  const lo = Math.max(0, Math.min(plainStart, plainEnd, len));
  const hi = Math.max(0, Math.min(Math.max(plainStart, plainEnd), len));
  if (lo >= hi) return { next: marks, changed: false };

  const idxs: number[] = [];
  for (let i = lo; i < hi; i += 1) if (chars[i].ch !== '\n') idxs.push(i);
  if (!idxs.length) return { next: marks, changed: false };

  const keepIfSame = !!opts.keepIfSame;
  let changed = false;

  if ((BOOL_KINDS as readonly string[]).includes(kind)) {
    const k = kind as BoolKind;
    const allOn = idxs.every((i) => !!chars[i][k]);
    const target = keepIfSame ? true : !allOn;
    for (const i of idxs) {
      if (!!chars[i][k] !== target) {
        chars[i] = { ...chars[i], [k]: target || undefined };
        changed = true;
      }
    }
  } else if (kind === 'color') {
    if (opts.clear) {
      for (const i of idxs) {
        if (chars[i].color) {
          chars[i] = { ...chars[i], color: undefined };
          changed = true;
        }
      }
    } else {
      const val = normalizeHex(opts.colorHex || '#d7a982') || '#d7a982';
      const allSame = idxs.every((i) => (chars[i].color ?? '') === val);
      const remove = allSame && !keepIfSame;
      for (const i of idxs) {
        const nv = remove ? undefined : val;
        if (chars[i].color !== nv) {
          chars[i] = { ...chars[i], color: nv };
          changed = true;
        }
      }
    }
  } else if (kind === 'font') {
    if (opts.clear) {
      for (const i of idxs) {
        if (chars[i].font) {
          chars[i] = { ...chars[i], font: undefined };
          changed = true;
        }
      }
    } else {
      const val = normalizeFontId(opts.fontId || 'chosun') || 'chosun';
      const allSame = idxs.every((i) => (chars[i].font ?? '') === val);
      const remove = allSame && !keepIfSame;
      for (const i of idxs) {
        const nv = remove ? undefined : val;
        if (chars[i].font !== nv) {
          chars[i] = { ...chars[i], font: nv };
          changed = true;
        }
      }
    }
  } else if (kind === 'size') {
    if (opts.clear) {
      for (const i of idxs) {
        if (chars[i].size != null) {
          chars[i] = { ...chars[i], size: undefined };
          changed = true;
        }
      }
    } else {
      const val = normalizeSizePx(opts.sizePx ?? STORY_RICH_SIZE_BASE) ?? STORY_RICH_SIZE_BASE;
      const allSame = idxs.every((i) => (chars[i].size ?? 0) === val);
      const remove = allSame && !keepIfSame;
      for (const i of idxs) {
        const nv = remove ? undefined : val;
        if (chars[i].size !== nv) {
          chars[i] = { ...chars[i], size: nv };
          changed = true;
        }
      }
    }
  }

  if (!changed) return { next: marks, changed: false };
  return { next: charAttrsToMarks(chars), changed: true };
}

function expandIfWrapped(
  value: string,
  start: number,
  end: number,
  open: string,
  close: string,
): { start: number; end: number } {
  let a = start;
  let b = end;
  while (
    a >= open.length &&
    b + close.length <= value.length &&
    value.slice(a - open.length, a) === open &&
    value.slice(b, b + close.length) === close
  ) {
    a -= open.length;
    b += close.length;
  }
  return { start: a, end: b };
}

function expandIfColorWrapped(value: string, start: number, end: number) {
  let a = start;
  let b = end;
  while (b + 3 <= value.length && value.slice(b, b + 3) === '{#}') {
    const before = value.slice(0, a);
    const m = before.match(/\{#([0-9a-fA-F]{3,8})\}$/i);
    if (!m) break;
    a -= m[0].length;
    b += 3;
  }
  return { start: a, end: b };
}

function expandIfFontWrapped(value: string, start: number, end: number) {
  let a = start;
  let b = end;
  while (true) {
    let closeLen = 0;
    if (value.slice(b, b + 4) === '{/@}') closeLen = 4;
    else if (value.slice(b, b + 3) === '{@}') closeLen = 3;
    else break;
    const before = value.slice(0, a);
    const m = before.match(/\{@([a-z0-9-]+)\}$/);
    if (!m) break;
    a -= m[0].length;
    b += closeLen;
  }
  return { start: a, end: b };
}

function expandIfSizeWrapped(value: string, start: number, end: number) {
  let a = start;
  let b = end;
  while (true) {
    let closeLen = 0;
    if (value.slice(b, b + 4) === '{/=}') closeLen = 4;
    else if (value.slice(b, b + 3) === '{=}') closeLen = 3;
    else break;
    const before = value.slice(0, a);
    const m = before.match(/\{=([1-9]\d?(?:\.\d)?)\}$/);
    if (!m) break;
    a -= m[0].length;
    b += closeLen;
  }
  return { start: a, end: b };
}

/**
 * 선택 구간을 감싼 다른 종류 마커(굵게/색 등) 바깥까지 올린다.
 * 폰트·크기를 굵게 안에만 넣으면 DOM 재직렬화/중첩에서 깨지기 쉬움.
 */
function expandThroughOtherWrappers(
  value: string,
  start: number,
  end: number,
  kind: RichMarkKind,
): { start: number; end: number } {
  let a = start;
  let b = end;
  for (let guard = 0; guard < 32; guard += 1) {
    const prevA = a;
    const prevB = b;
    for (const d of DELIMS) {
      const [open, close] = WRAP[d.kind];
      if (
        a >= open.length &&
        b + close.length <= value.length &&
        value.slice(a - open.length, a) === open &&
        value.slice(b, b + close.length) === close
      ) {
        a -= open.length;
        b += close.length;
      }
    }
    if (kind !== 'color') {
      const ex = expandIfColorWrapped(value, a, b);
      a = ex.start;
      b = ex.end;
    }
    if (kind !== 'font') {
      const ex = expandIfFontWrapped(value, a, b);
      a = ex.start;
      b = ex.end;
    }
    if (kind !== 'size') {
      const ex = expandIfSizeWrapped(value, a, b);
      a = ex.start;
      b = ex.end;
    }
    if (a === prevA && b === prevB) break;
  }
  return { start: a, end: b };
}

function wrapTaggedInner(
  normalized: string,
  a: number,
  b: number,
  openMark: string,
  closeMark: string,
  expanded: { start: number; end: number },
  isSame: (fullSelected: string) => { inner: string; same: boolean } | null,
  keepIfSame = false,
): { next: string; selStart: number; selEnd: number } {
  const expandedSlice = normalized.slice(expanded.start, expanded.end);
  const expandedHit = isSame(expandedSlice);
  if (expandedHit && expanded.start !== a) {
    if (expandedHit.same) {
      if (keepIfSame) {
        return { next: normalized, selStart: a, selEnd: b };
      }
      return {
        next:
          normalized.slice(0, expanded.start) +
          expandedHit.inner +
          normalized.slice(expanded.end),
        selStart: expanded.start,
        selEnd: expanded.start + expandedHit.inner.length,
      };
    }
    const wrapped = `${openMark}${expandedHit.inner}${closeMark}`;
    return {
      next: normalized.slice(0, expanded.start) + wrapped + normalized.slice(expanded.end),
      selStart: expanded.start + openMark.length,
      selEnd: expanded.start + openMark.length + expandedHit.inner.length,
    };
  }

  const slice = normalized.slice(a, b);
  const exact = isSame(slice);
  if (exact) {
    if (exact.same) {
      if (keepIfSame) {
        return { next: normalized, selStart: a, selEnd: b };
      }
      return {
        next: normalized.slice(0, a) + exact.inner + normalized.slice(b),
        selStart: a,
        selEnd: a + exact.inner.length,
      };
    }
    const wrapped = `${openMark}${exact.inner}${closeMark}`;
    return {
      next: normalized.slice(0, a) + wrapped + normalized.slice(b),
      selStart: a + openMark.length,
      selEnd: a + openMark.length + exact.inner.length,
    };
  }

  const wrapped = `${openMark}${slice}${closeMark}`;
  return {
    next: normalized.slice(0, a) + wrapped + normalized.slice(b),
    selStart: a + openMark.length,
    selEnd: a + openMark.length + slice.length,
  };
}

/**
 * 선택 구간에 서식 적용.
 * - 같은 종류가 정확히 감싸면 토글 해제(값 같으면) / 교체(값 다르면)
 * - 아니면 그 구간에만 한 겹 추가 (다른 종류와 중첩)
 */
export function wrapRichSelection(
  value: string,
  start: number,
  end: number,
  kind: RichMarkKind,
  opts: WrapOpts | string = {},
): { next: string; selStart: number; selEnd: number } {
  const options: WrapOpts = typeof opts === 'string' ? { colorHex: opts } : opts || {};
  const normalized = String(value ?? '');
  let a = Math.max(0, Math.min(start, end, normalized.length));
  let b = Math.max(0, Math.min(Math.max(start, end), normalized.length));
  if (a === b) {
    return { next: normalized, selStart: a, selEnd: b };
  }

  /*
   * 마커가 줄바꿈을 가로지르면 줄 단위 HTML 변환이 깨져 코드가 노출됨.
   * 여러 문단 선택은 줄마다 따로 감싼다 (뒤에서 앞으로 적용해 오프셋 유지).
   */
  if (normalized.slice(a, b).includes('\n')) {
    const segments: Array<[number, number]> = [];
    let i = a;
    while (i < b) {
      let j = i;
      while (j < b && normalized[j] !== '\n') j += 1;
      if (j > i) segments.push([i, j]);
      i = j < b && normalized[j] === '\n' ? j + 1 : j;
    }
    let next = normalized;
    for (let s = segments.length - 1; s >= 0; s -= 1) {
      const [sa, sb] = segments[s];
      next = wrapRichSelection(next, sa, sb, kind, options).next;
    }
    return { next, selStart: a, selEnd: b };
  }

  if (kind === 'color') {
    const hex = normalizeHex(options.colorHex || '#d7a982') || '#d7a982';
    const digits = hex.slice(1);
    const openMark = `{#${digits}}`;
    const closeMark = '{#}';
    const lifted = expandThroughOtherWrappers(normalized, a, b, 'color');
    const expanded = expandIfColorWrapped(normalized, lifted.start, lifted.end);
    return wrapTaggedInner(
      normalized,
      lifted.start,
      lifted.end,
      openMark,
      closeMark,
      expanded,
      (sel) => {
        const m = sel.match(/^\{#([0-9a-fA-F]{3,8})\}([\s\S]*)\{#\}$/i);
        if (!m) return null;
        return { inner: m[2], same: m[1].toLowerCase() === digits.toLowerCase() };
      },
      Boolean(options.keepIfSame),
    );
  }

  if (kind === 'font') {
    const fontId = normalizeFontId(options.fontId || 'chosun') || 'chosun';
    const openMark = `{@${fontId}}`;
    const closeMark = '{/@}';
    const lifted = expandThroughOtherWrappers(normalized, a, b, 'font');
    const expanded = expandIfFontWrapped(normalized, lifted.start, lifted.end);
    return wrapTaggedInner(
      normalized,
      lifted.start,
      lifted.end,
      openMark,
      closeMark,
      expanded,
      (sel) => {
        const m = sel.match(/^\{@([a-z0-9-]+)\}([\s\S]*)(\{\/@\}|\{@\})$/);
        if (!m) return null;
        return { inner: m[2], same: m[1] === fontId };
      },
      Boolean(options.keepIfSame),
    );
  }

  if (kind === 'size') {
    const sizePx = normalizeSizePx(options.sizePx ?? STORY_RICH_SIZE_BASE) || STORY_RICH_SIZE_BASE;
    const openMark = `{=${sizePx}}`;
    const closeMark = '{/=}';
    const lifted = expandThroughOtherWrappers(normalized, a, b, 'size');
    const expanded = expandIfSizeWrapped(normalized, lifted.start, lifted.end);
    return wrapTaggedInner(
      normalized,
      lifted.start,
      lifted.end,
      openMark,
      closeMark,
      expanded,
      (sel) => {
        const m = sel.match(/^\{=([1-9]\d?(?:\.\d)?)\}([\s\S]*)(\{\/=\}|\{=\})$/);
        if (!m) return null;
        return { inner: m[2], same: Number(m[1]) === sizePx };
      },
      Boolean(options.keepIfSame),
    );
  }

  const [open, close] = WRAP[kind];
  const expanded = expandIfWrapped(normalized, a, b, open, close);
  const expandedSlice = normalized.slice(expanded.start, expanded.end);

  if (
    expanded.start !== a &&
    expandedSlice.startsWith(open) &&
    expandedSlice.endsWith(close) &&
    expandedSlice.length > open.length + close.length
  ) {
    const inner = expandedSlice.slice(open.length, expandedSlice.length - close.length);
    return {
      next: normalized.slice(0, expanded.start) + inner + normalized.slice(expanded.end),
      selStart: expanded.start,
      selEnd: expanded.start + inner.length,
    };
  }

  const slice = normalized.slice(a, b);
  if (
    slice.startsWith(open) &&
    slice.endsWith(close) &&
    slice.length > open.length + close.length
  ) {
    const inner = slice.slice(open.length, slice.length - close.length);
    return {
      next: normalized.slice(0, a) + inner + normalized.slice(b),
      selStart: a,
      selEnd: a + inner.length,
    };
  }

  const wrapped = `${open}${slice}${close}`;
  return {
    next: normalized.slice(0, a) + wrapped + normalized.slice(b),
    selStart: a + open.length,
    selEnd: a + open.length + slice.length,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fontCss(fontId: string): string {
  const f = STORY_RICH_FONTS.find((x) => x.id === fontId);
  return f?.css || "'ChosunNm', serif";
}

function wrapOpenToHtml(open: OpenHit, innerHtml: string): string {
  switch (open.kind) {
    case 'bold':
      return `<strong class="oc-rich-strong" data-rich="bold">${innerHtml}</strong>`;
    case 'italic':
      return `<em class="oc-rich-italic" data-rich="italic">${innerHtml}</em>`;
    case 'underline':
      return `<span class="oc-rich-underline" data-rich="underline">${innerHtml}</span>`;
    case 'strike':
      return `<span class="oc-rich-strike" data-rich="strike">${innerHtml}</span>`;
    case 'soft':
      return `<span class="oc-rich-soft" data-rich="soft">${innerHtml}</span>`;
    case 'color':
      return `<span class="oc-rich-color" data-rich="color" data-color="${open.hex}" style="color:${open.hex}">${innerHtml}</span>`;
    case 'font': {
      const ff = fontCss(open.fontId);
      return `<span class="oc-rich-font" data-rich="font" data-font="${open.fontId}" style="font-family:${ff};--oc-rich-font:${ff}">${innerHtml}</span>`;
    }
    case 'size':
      return `<span class="oc-rich-size" data-rich="size" data-size="${open.sizePx}" style="font-size:${open.sizePx}px;--oc-rich-size:${open.sizePx}px">${innerHtml}</span>`;
  }
}

/**
 * 마커를 HTML 조각 배열로 (문단 = 원소).
 * 마커가 줄바꿈을 가로질러도 각 문단에 태그를 다시 열어 코드가 노출되지 않게 한다.
 */
export function marksToParagraphHtmlParts(text: string): string[] {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const paragraphs: string[] = [];
  let buf = '';

  const flush = () => {
    paragraphs.push(buf);
    buf = '';
  };

  const emitLiteral = (literal: string) => {
    for (let k = 0; k < literal.length; k += 1) {
      if (literal[k] === '\n') flush();
      else buf += escapeHtml(literal[k]);
    }
  };

  const walk = (str: string) => {
    let i = 0;
    while (i < str.length) {
      const icon = matchRichIconAt(str, i);
      if (icon) {
        buf += richIconToHtml(icon.id);
        i += icon.len;
        continue;
      }

      const open = findEarliestOpen(str, i);
      if (!open) {
        let j = i;
        while (j < str.length) {
          const restIcon = matchRichIconAt(str, j);
          if (restIcon) {
            buf += richIconToHtml(restIcon.id);
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

      const innerParts = marksToParagraphHtmlParts(str.slice(contentStart, closed.closeAt));
      if (innerParts.length <= 1) {
        buf += wrapOpenToHtml(open, innerParts[0] || '');
      } else {
        buf += wrapOpenToHtml(open, innerParts[0]);
        flush();
        for (let p = 1; p < innerParts.length - 1; p += 1) {
          buf += wrapOpenToHtml(open, innerParts[p]);
          flush();
        }
        buf += wrapOpenToHtml(open, innerParts[innerParts.length - 1]);
      }
      i = closed.closeAt + closed.closeLen;
    }
  };

  walk(normalized);
  paragraphs.push(buf);
  return paragraphs;
}

/** 한 줄짜리 (줄바꿈 없음) 인라인 HTML — 테스트/호환용 */
export function marksInlineToHtml(line: string): string {
  return marksToParagraphHtmlParts(String(line ?? '').replace(/\n/g, ' '))[0] || '';
}

export function marksToEditorHtml(text: string): string {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  if (!normalized) return '<p class="oc-rich-p oc-rich-p--blank"><br></p>';
  return marksToParagraphHtmlParts(normalized)
    .map((html) => {
      const plain = html.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim();
      if (plain === '---') return '<hr class="oc-rich-hr" data-rich="hr">';
      return html
        ? `<p class="oc-rich-p">${html}</p>`
        : '<p class="oc-rich-p oc-rich-p--blank"><br></p>';
    })
    .join('');
}

/** 커서/선택 위치에 평문 삽입 (붙여넣기용) */
export function insertPlainAt(
  marks: string,
  plainStart: number,
  plainEnd: number,
  insertText: string,
): { next: string; caretPlain: number } {
  const { plain, toMark } = projectPlainOffsets(marks);
  const lo = Math.max(0, Math.min(plainStart, plainEnd, plain.length));
  const hi = Math.max(0, Math.min(Math.max(plainStart, plainEnd), plain.length));
  const markLo = lo >= plain.length ? marks.length : (toMark[lo] ?? marks.length);
  const markHi = hi >= plain.length ? marks.length : (toMark[hi] ?? marks.length);
  const text = String(insertText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const next = `${marks.slice(0, markLo)}${text}${marks.slice(markHi)}`;
  return { next, caretPlain: lo + text.length };
}

/** 커서/선택 위치에 구분선 삽입 (선택 구간은 지우지 않음 — 끝점으로 삽입) */
export function insertRichDivider(
  marks: string,
  plainStart: number,
  plainEnd: number,
): { next: string; caretPlain: number } {
  const { plain, toMark } = projectPlainOffsets(marks);
  /* 치환 금지: 선택 구간이 있어도 끝점 뒤에 삽입 */
  let pos = Math.max(0, Math.min(Math.max(plainStart, plainEnd), plain.length));

  /* 문단 중간이면 해당 문단 끝(다음 \\n 앞)으로 밀어 아랫줄/윗줄 내용을 보존 */
  if (pos < plain.length && plain[pos] !== '\n') {
    const nextNl = plain.indexOf('\n', pos);
    pos = nextNl >= 0 ? nextNl : plain.length;
  }

  const markPos = pos >= plain.length ? marks.length : (toMark[pos] ?? marks.length);
  const before = marks.slice(0, markPos);
  const after = marks.slice(markPos);
  const beforePlain = plain.slice(0, pos);
  const leadNl = beforePlain.length > 0 && !beforePlain.endsWith('\n');
  const mid = `${leadNl ? '\n' : ''}---\n`;
  const next = `${before}${mid}${after}`;

  const caretPlain = pos + (leadNl ? 1 : 0) + 3 + 1;
  const nextPlainLen = projectPlainOffsets(next).plain.length;
  return { next, caretPlain: Math.min(caretPlain, nextPlainLen) };
}

/** 커서/선택 위치에 Tabler 아이콘 마커 삽입 */
export function insertRichIcon(
  marks: string,
  plainStart: number,
  plainEnd: number,
  iconId: string,
): { next: string; caretPlain: number } | null {
  const id = normalizeRichIconId(iconId);
  if (!id) return null;
  const token = richIconMarker(id);
  const { plain, toMark } = projectPlainOffsets(marks);
  const lo = Math.max(0, Math.min(plainStart, plainEnd, plain.length));
  const hi = Math.max(0, Math.min(Math.max(plainStart, plainEnd), plain.length));
  const markLo = lo >= plain.length ? marks.length : (toMark[lo] ?? marks.length);
  const markHi = hi >= plain.length ? marks.length : (toMark[hi] ?? marks.length);
  const next = `${marks.slice(0, markLo)}${token}${marks.slice(markHi)}`;
  return { next, caretPlain: lo + 1 };
}

/** 문단이 구분선인지 (마커 제거 후 ---) */
export function isRichDividerParagraph(htmlOrNodesPlain: string): boolean {
  return htmlOrNodesPlain.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim() === '---';
}
