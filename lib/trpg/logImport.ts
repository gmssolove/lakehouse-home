export type ParsedLogHtml = {
  title: string;
  body: string;
  html: string;
};

/** Cocoforia HTML 등 — 브라우저·RTDB·localStorage 한도를 넘기기 쉬운 크기 */
export const TRPG_LOG_HTML_MAX_CHARS = 1_500_000;

/** 코코포리아 등에서 추출한 [main] [other] 화자 태그 제거 */
export function stripCocofoliaSpeakerTags(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\[[^\]]+\]\s*/, '').replace(/\s*\[[^\]]+\]\s*/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripCocofoliaSpeakerTagsFromHtml(html: string): string {
  return html.replace(/(^|[>\n])(\s*)\[[^\]]+\]\s*/g, '$1$2');
}

export function assertLogHtmlSize(html: string): void {
  if (html.length > TRPG_LOG_HTML_MAX_CHARS) {
    const mb = (html.length / 1_000_000).toFixed(1);
    throw new Error(
      `HTML 로그가 너무 큽니다 (${mb}MB). ${Math.round(TRPG_LOG_HTML_MAX_CHARS / 1_000_000)}MB 이하로 나눠 불러와 주세요.`,
    );
  }
}

/** script/link 등 실행·외부 리소스 제거 (용량·렌더 크래시 완화) */
export function sanitizeLogHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

export function parseLogHtmlString(html: string, fallbackTitle = '세션 로그'): ParsedLogHtml {
  assertLogHtmlSize(html);
  const cleanedHtml = stripCocofoliaSpeakerTagsFromHtml(sanitizeLogHtml(html));

  if (typeof DOMParser === 'undefined') {
    const body = stripCocofoliaSpeakerTags(
      cleanedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    return { title: fallbackTitle, body: body || html, html: cleanedHtml };
  }

  const doc = new DOMParser().parseFromString(cleanedHtml, 'text/html');
  const rawText = doc.body?.innerText?.replace(/\s+\n/g, '\n').trim() ?? '';
  const body = stripCocofoliaSpeakerTags(rawText || cleanedHtml);

  return {
    title: fallbackTitle,
    body: body || rawText || cleanedHtml,
    html: cleanedHtml,
  };
}

export async function parseLogHtmlFile(file: File): Promise<ParsedLogHtml> {
  const html = await file.text();
  assertLogHtmlSize(html);
  const fallbackTitle = file.name.replace(/\.html?$/i, '') || '세션 로그';
  const cleanedHtml = stripCocofoliaSpeakerTagsFromHtml(sanitizeLogHtml(html));

  if (typeof DOMParser === 'undefined') {
    const body = stripCocofoliaSpeakerTags(
      cleanedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    return { title: fallbackTitle, body: body || html, html: cleanedHtml };
  }

  const doc = new DOMParser().parseFromString(cleanedHtml, 'text/html');
  const rawText = doc.body?.innerText?.replace(/\s+\n/g, '\n').trim() ?? '';
  const body = stripCocofoliaSpeakerTags(rawText || cleanedHtml);

  return {
    title: fallbackTitle,
    body: body || rawText || cleanedHtml,
    html: cleanedHtml,
  };
}
