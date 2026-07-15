/**
 * 서사/로그 인라인 마커 — 순수 문자열 로직 (React 없음)
 * - **굵게**  //기울임//  __밑줄__  ~~취소선~~  %%옅게%%
 * - {#RRGGBB}색{#}
 * - {@fontId}폰트{/@}  (레거시 닫기 {@} 도 읽기)
 * - {=18}크기(px){/=}  (레거시 닫기 {=} 도 읽기)
 * 서로 다른 종류는 순서 무관하게 중첩 가능
 */

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

/** 로그/서사 본문 글자 크기 (px) — 1px 단위 */
export const STORY_RICH_SIZE_MIN = 10;
export const STORY_RICH_SIZE_MAX = 48;
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
const SIZE_OPEN_RE = /^\{=([1-9]\d?)\}/;

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
  const px = Math.round(n);
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
      const open = after.match(/^([1-9]\d?)\}/);
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
      const open = findEarliestOpen(str, i);
      if (!open) {
        feedLiteral(str.slice(i), base + i);
        break;
      }
      if (open.index > i) feedLiteral(str.slice(i, open.index), base + i);

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
    const m = before.match(/\{=([1-9]\d?)\}$/);
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
    const sizePx = normalizeSizePx(options.sizePx ?? 16) || 16;
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
        const m = sel.match(/^\{=([1-9]\d?)\}([\s\S]*)(\{\/=\}|\{=\})$/);
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
      const open = findEarliestOpen(str, i);
      if (!open) {
        emitLiteral(str.slice(i));
        break;
      }
      if (open.index > i) emitLiteral(str.slice(i, open.index));

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
    .map((html) =>
      html
        ? `<p class="oc-rich-p">${html}</p>`
        : '<p class="oc-rich-p oc-rich-p--blank"><br></p>',
    )
    .join('');
}
