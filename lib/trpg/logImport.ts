export type ParsedLogHtml = {
  title: string;
  body: string;
  html: string;
};

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

export function parseLogHtmlString(html: string, fallbackTitle = '세션 로그'): ParsedLogHtml {
  const cleanedHtml = stripCocofoliaSpeakerTagsFromHtml(html);

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
  const fallbackTitle = file.name.replace(/\.html?$/i, '') || '세션 로그';
  const cleanedHtml = stripCocofoliaSpeakerTagsFromHtml(html);

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
