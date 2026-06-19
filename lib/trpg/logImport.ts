export type ParsedLogHtml = {
  title: string;
  body: string;
  html: string;
};

export async function parseLogHtmlFile(file: File): Promise<ParsedLogHtml> {
  const html = await file.text();
  if (typeof DOMParser === 'undefined') {
    return {
      title: file.name.replace(/\.html?$/i, ''),
      body: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html,
    };
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body?.innerText?.replace(/\s+\n/g, '\n').trim() ?? '';
  return {
    title: file.name.replace(/\.html?$/i, '') || '세션 로그',
    body: text || html,
    html,
  };
}
