/** Notice plain-text → display segments (저장 포맷은 그대로, 렌더만 구조화) */

export type NoticeSegment =
  | { type: 'label'; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'warning'; lines: string[] };

export type NoticeBlock = {
  segments: NoticeSegment[];
};

/** 한 줄 전체가 영문 대문자(+공백)만 */
const SECTION_LABEL_RE = /^[A-Z]+(?:\s+[A-Z]+)*$/;

export function isNoticeSectionLabel(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && SECTION_LABEL_RE.test(t);
}

export function isNoticeWarnLine(line: string): boolean {
  return /^\s*⚠/.test(line);
}

/** `-` / `*` 로 시작하면 불릿 — 본문만 반환, 아니면 null */
export function matchNoticeBullet(line: string): string | null {
  const m = line.match(/^\s*[-*]\s*(.*)$/);
  if (!m) return null;
  // 섹션 라벨·경고와 겹치지 않게: 순수 `-`/`*`만 있는 줄도 항목으로
  return m[1] ?? '';
}

function splitRawBlocks(raw: string): string[][] {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur.length) {
        blocks.push(cur);
        cur = [];
      }
      continue;
    }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

function parseBlockLines(lines: string[]): NoticeSegment[] {
  const segments: NoticeSegment[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isNoticeWarnLine(line)) {
      segments.push({ type: 'warning', lines: lines.slice(i) });
      break;
    }

    if (isNoticeSectionLabel(line)) {
      segments.push({ type: 'label', text: line.trim() });
      i += 1;
      continue;
    }

    const bullet = matchNoticeBullet(line);
    if (bullet !== null) {
      const items = [bullet];
      i += 1;
      while (i < lines.length) {
        if (isNoticeWarnLine(lines[i]) || isNoticeSectionLabel(lines[i])) break;
        const next = matchNoticeBullet(lines[i]);
        if (next === null) break;
        items.push(next);
        i += 1;
      }
      segments.push({ type: 'list', items });
      continue;
    }

    const para = [line];
    i += 1;
    while (i < lines.length) {
      if (
        isNoticeWarnLine(lines[i]) ||
        isNoticeSectionLabel(lines[i]) ||
        matchNoticeBullet(lines[i]) !== null
      ) {
        break;
      }
      para.push(lines[i]);
      i += 1;
    }
    segments.push({ type: 'paragraph', lines: para });
  }
  return segments;
}

export function parseNoticeBody(raw: string): NoticeBlock[] {
  return splitRawBlocks(raw).map((lines) => ({ segments: parseBlockLines(lines) }));
}
