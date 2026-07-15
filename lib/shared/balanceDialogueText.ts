/**
 * 대사 줄바꿈 — 띄어쓰기 단위로 끊되, 한 줄만 꽉 차고 다음 줄이 短い
 * orphan이 되지 않도록 줄 길이를 고르게 맞춤.
 */

function createMeasurer(font: string): (s: string) => number {
  if (typeof document === 'undefined') {
    return (s) => [...s].length * 10;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return (s) => [...s].length * 10;
  ctx.font = font;
  return (s) => ctx.measureText(s).width;
}

function packGreedy(
  words: string[],
  widths: number[],
  spaceW: number,
  maxWidth: number,
  target: number,
  lineCount: number,
): string[] {
  const n = words.length;
  const lines: string[] = [];
  let i = 0;

  while (i < n) {
    const linesLeft = lineCount - lines.length;
    if (linesLeft <= 1) {
      lines.push(words.slice(i).join(' '));
      break;
    }

    const lineWords = [words[i]];
    let w = widths[i];
    i += 1;

    while (i < n) {
      const wordsAfterTake = n - i - 1;
      const linesAfter = linesLeft - 1;
      if (wordsAfterTake < linesAfter) break;

      const next = w + spaceW + widths[i];
      if (next > maxWidth + 0.5) break;

      /* 목표 길이에 가깝고, 다음 단어를 더하면 목표를 크게 넘으면 여기서 끊음 */
      if (lineWords.length >= 1 && w >= target * 0.82 && next > target * 1.08) {
        break;
      }

      lineWords.push(words[i]);
      w = next;
      i += 1;
    }

    lines.push(lineWords.join(' '));
  }

  return lines;
}

function balanceTwoLines(
  words: string[],
  measure: (s: string) => number,
  maxWidth: number,
): string | null {
  const n = words.length;
  if (n < 2) return null;

  let bestK = -1;
  let bestScore = Infinity;

  for (let k = 1; k < n; k += 1) {
    const left = words.slice(0, k).join(' ');
    const right = words.slice(k).join(' ');
    const lw = measure(left);
    const rw = measure(right);
    if (lw > maxWidth + 0.5 || rw > maxWidth + 0.5) continue;

    /* 길이가 고르고, 마지막 줄이 짧은 orphan(단어 1개 등)을 피함 */
    const ratio = Math.min(lw, rw) / Math.max(lw, rw);
    const lastWordCount = n - k;
    const orphan =
      lastWordCount === 1 && rw < maxWidth * 0.5
        ? 140
        : lastWordCount <= 2 && ratio < 0.5
          ? 60
          : 0;
    const score =
      Math.abs(lw - rw) + (ratio < 0.42 ? 80 : 0) + (ratio < 0.3 ? 80 : 0) + orphan;
    if (score < bestScore) {
      bestScore = score;
      bestK = k;
    }
  }

  if (bestK < 0) return null;
  return `${words.slice(0, bestK).join(' ')}\n${words.slice(bestK).join(' ')}`;
}

function balanceParagraph(
  para: string,
  measure: (s: string) => number,
  maxWidth: number,
): string {
  if (!para || measure(para) <= maxWidth + 0.5) return para;

  const words = para.split(/\s+/).filter(Boolean);
  if (words.length < 2) return para;

  const spaceW = measure(' ');
  const widths = words.map((w) => measure(w));
  const total = widths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1);
  let lineCount = Math.ceil(total / maxWidth);
  if (lineCount < 2) return para;
  lineCount = Math.min(lineCount, words.length);

  if (lineCount === 2) {
    const two = balanceTwoLines(words, measure, maxWidth);
    if (two) return two;
  }

  const target = total / lineCount;
  return packGreedy(words, widths, spaceW, maxWidth, target, lineCount).join('\n');
}

/** 띄어쓰기 기준 균형 줄바꿈. 기존 강제 개행(\n)은 단락 경계로 유지. */
export function balanceDialogueText(text: string, maxWidth: number, font: string): string {
  if (!text || maxWidth < 24) return text;
  const measure = createMeasurer(font);
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((para) => balanceParagraph(para, measure, maxWidth))
    .join('\n');
}

export function fontFromElement(el: Element): string {
  const cs = getComputedStyle(el);
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

export function contentWidthOf(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  return Math.max(0, el.clientWidth - pad);
}
