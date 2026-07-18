/** Client-side PDF text extract via pdfjs — layout-aware lines / paragraphs / rules. */

export type PdfExtractResult = {
  text: string;
  pageCount: number;
  charCount: number;
  dividerCount: number;
};

type TextRun = {
  str: string;
  x: number;
  y: number;
  h: number;
};

type HLine = {
  y: number;
  x0: number;
  x1: number;
};

function itemHeight(transform: number[], height?: number): number {
  if (typeof height === 'number' && height > 0) return height;
  const a = transform[0] ?? 0;
  const b = transform[1] ?? 0;
  const c = transform[2] ?? 0;
  const d = transform[3] ?? 0;
  return Math.max(Math.hypot(a, b), Math.hypot(c, d), 8);
}

function groupLines(runs: TextRun[]): TextRun[][] {
  if (!runs.length) return [];
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextRun[][] = [];
  let cur: TextRun[] = [sorted[0]];
  let curY = sorted[0].y;
  let curH = sorted[0].h;

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const thresh = Math.max(curH, r.h) * 0.3;
    if (Math.abs(r.y - curY) <= thresh) {
      cur.push(r);
      curY = (curY * (cur.length - 1) + r.y) / cur.length;
      curH = Math.max(curH, r.h);
    } else {
      lines.push(cur.sort((a, b) => a.x - b.x));
      cur = [r];
      curY = r.y;
      curH = r.h;
    }
  }
  lines.push(cur.sort((a, b) => a.x - b.x));
  return lines;
}

function joinLine(runs: TextRun[]): string {
  let out = '';
  for (let i = 0; i < runs.length; i++) {
    const s = runs[i].str;
    if (!s) continue;
    if (!out) {
      out = s;
      continue;
    }
    const prev = out[out.length - 1];
    const next = s[0];
    const needSpace =
      !/\s$/.test(out) &&
      !/^\s/.test(s) &&
      !/^[.,!?;:%）)」』】]/.test(next || '') &&
      !/[(（「『【]$/.test(prev || '');
    out += needSpace ? ` ${s}` : s;
  }
  return out.replace(/[ \t]+/g, ' ').trim();
}

function rebuildParagraphs(lines: TextRun[][]): { text: string; lineYs: number[] } {
  if (!lines.length) return { text: '', lineYs: [] };
  const texts = lines.map(joinLine).filter(Boolean);
  const ys = lines.map((ln) => ln.reduce((s, r) => s + r.y, 0) / ln.length);

  const gaps: number[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    gaps.push(Math.abs(ys[i] - ys[i + 1]));
  }
  const avgGap =
    gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 14;
  const paraThresh = avgGap * 1.5;

  const parts: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (i === 0) {
      parts.push(texts[i]);
      continue;
    }
    const gap = Math.abs(ys[i - 1] - ys[i]);
    parts.push(gap >= paraThresh ? `\n\n${texts[i]}` : `\n${texts[i]}`);
  }
  return { text: parts.join(''), lineYs: ys };
}

function collectHLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfjs: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opList: { fnArray: number[]; argsArray: unknown[] },
): HLine[] {
  const OPS = pdfjs.OPS as Record<string, number>;
  const out: HLine[] = [];
  const fns = opList.fnArray;
  const args = opList.argsArray;

  const pushRect = (x: number, y: number, w: number, h: number) => {
    const aw = Math.abs(w);
    const ah = Math.abs(h);
    if (aw < 24) return;
    if (ah > 0 && aw < ah * 10) return;
    // flat rule: height tiny or width >> height
    if (ah === 0 || aw >= Math.max(ah, 0.5) * 10) {
      out.push({
        y: y + h / 2,
        x0: Math.min(x, x + w),
        x1: Math.max(x, x + w),
      });
    }
  };

  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    const a = args[i] as unknown[];

    if (fn === OPS.rectangle && a && a.length >= 4) {
      pushRect(Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3]));
      continue;
    }

    // constructPath: [ops, coords] — look for rect-like segments
    if (fn === OPS.constructPath && a && a.length >= 2) {
      const pathOps = a[0] as number[] | undefined;
      const coords = a[1] as number[] | undefined;
      if (!pathOps || !coords) continue;
      let ci = 0;
      for (const pop of pathOps) {
        // rectangle op inside constructPath ≈ 4 numbers
        if (pop === OPS.rectangle || pop === 91) {
          if (ci + 3 < coords.length) {
            pushRect(coords[ci], coords[ci + 1], coords[ci + 2], coords[ci + 3]);
            ci += 4;
          }
        } else if (pop === OPS.moveTo || pop === 13) {
          ci += 2;
        } else if (pop === OPS.lineTo || pop === 14) {
          // horizontal lineTo: same y
          if (ci >= 2 && ci + 1 < coords.length) {
            const x0 = coords[ci - 2];
            const y0 = coords[ci - 1];
            const x1 = coords[ci];
            const y1 = coords[ci + 1];
            if (Math.abs(y1 - y0) <= 1.5 && Math.abs(x1 - x0) >= 40) {
              out.push({
                y: (y0 + y1) / 2,
                x0: Math.min(x0, x1),
                x1: Math.max(x0, x1),
              });
            }
          }
          ci += 2;
        } else if (pop === OPS.curveTo || pop === 15) {
          ci += 6;
        } else if (pop === OPS.closePath || pop === 18) {
          /* no coords */
        }
      }
    }
  }

  return out;
}

function insertDividers(text: string, lineYs: number[], hLines: HLine[]): { text: string; count: number } {
  if (!text || !hLines.length || !lineYs.length) return { text, count: 0 };
  const parts = text.split('\n');
  // Map each non-empty visual line index → y (approx by sequential non-empty)
  const nonEmptyIdx: number[] = [];
  parts.forEach((p, i) => {
    if (p.trim()) nonEmptyIdx.push(i);
  });
  if (nonEmptyIdx.length !== lineYs.length) {
    // fallback: insert by y order between paragraphs only
  }

  const used = new Set<number>();
  let inserted = 0;
  const inserts = new Map<number, true>(); // insert --- before part index

  for (const line of hLines) {
    // find text lines above and below this rule
    let above = -1;
    let below = -1;
    for (let i = 0; i < lineYs.length; i++) {
      if (lineYs[i] > line.y + 2) above = i;
      if (lineYs[i] < line.y - 2 && below < 0) below = i;
    }
    if (above < 0 || below < 0) continue;
    const key = above * 1000 + below;
    if (used.has(key)) continue;
    used.add(key);
    const partIdx = nonEmptyIdx[below];
    if (partIdx == null) continue;
    inserts.set(partIdx, true);
    inserted++;
  }

  if (!inserts.size) return { text, count: 0 };
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (inserts.has(i)) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push('---');
      out.push('');
    }
    out.push(parts[i]);
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), count: inserted };
}

async function setupWorker(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfjs: any,
): Promise<void> {
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;
  const ver = pdfjs.version || '4.10.38';
  // Prefer jsDelivr (often more reliable than unpkg in some networks)
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/build/pdf.worker.min.mjs`;
}

/**
 * Extract text from PDF with line/paragraph reconstruction and optional HR → `---`.
 */
export async function extractTextFromPdfFile(file: File): Promise<string> {
  const result = await extractPdfWithLayout(file);
  return result.text;
}

export async function extractPdfWithLayout(file: File): Promise<PdfExtractResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await import('pdfjs-dist');
  await setupWorker(pdfjs);

  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: false,
  }).promise;

  const pageTexts: string[] = [];
  let dividerCount = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent({
      includeMarkedContent: true,
    });

    const runs: TextRun[] = [];
    for (const it of content.items) {
      if (!it || typeof it !== 'object' || !('str' in it)) continue;
      const item = it as {
        str: string;
        transform: number[];
        height?: number;
        hasEOL?: boolean;
      };
      const str = String(item.str ?? '');
      if (!str.trim() && !item.hasEOL) continue;
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      runs.push({
        str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        h: itemHeight(transform, item.height),
      });
    }

    const lines = groupLines(runs.filter((r) => r.str.trim()));
    let { text, lineYs } = rebuildParagraphs(lines);

    try {
      const opList = await page.getOperatorList();
      const hLines = collectHLines(pdfjs, opList);
      const withDiv = insertDividers(text, lineYs, hLines);
      text = withDiv.text;
      dividerCount += withDiv.count;
    } catch {
      /* operator list optional */
    }

    if (text.trim()) pageTexts.push(text.trim());
  }

  const text = pageTexts.join('\n\n').trim();
  return {
    text,
    pageCount: doc.numPages,
    charCount: text.replace(/\s+/g, '').length,
    dividerCount,
  };
}
