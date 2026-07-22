/** 한국어 맞춤법·띄어쓰기 검사 (다음 문법 검사기) */

export type SpellIssue = {
  offset: number;
  length: number;
  token: string;
  suggestions: string[];
  message: string;
};

export type SpellLineResult = {
  lineId: string;
  text: string;
  issues: SpellIssue[];
  suggestedText?: string;
};

const DAUM_URL = 'https://dic.daum.net/grammar_checker.do';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeHtml(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<br\s*\/?>/gi, '\n');
}

function getAttr(line: string, key: string): string {
  const found = line.indexOf(key);
  if (found < 0) return '';
  const firstQuote = line.indexOf('"', found + 1);
  const secondQuote = line.indexOf('"', firstQuote + 1);
  if (firstQuote < 0 || secondQuote < 0) return '';
  return decodeHtml(line.slice(firstQuote + 1, secondQuote));
}

function applyFirstSuggestions(text: string, issues: SpellIssue[]): string {
  if (!issues.length) return text;
  const sorted = [...issues].sort((a, b) => b.offset - a.offset);
  let out = text;
  for (const issue of sorted) {
    const rep = issue.suggestions[0];
    if (rep == null || issue.offset < 0 || issue.length <= 0) continue;
    out = out.slice(0, issue.offset) + rep + out.slice(issue.offset + issue.length);
  }
  return out;
}

function typeLabel(type: string): string {
  if (type === 'space_spell' || type.includes('space_spell')) return '맞춤법·띄어쓰기';
  if (type.includes('space')) return '띄어쓰기';
  if (type.includes('spell')) return '맞춤법';
  return '교정';
}

/** 다음 맞춤법 검사기 HTML 파싱 */
function parseDaumHtml(html: string, original: string): SpellIssue[] {
  const issues: SpellIssue[] = [];
  const seen = new Set<string>();
  let found = -1;
  let searchFrom = 0;

  while ((found = html.indexOf('data-error-type', found + 1)) !== -1) {
    const end = html.indexOf('>', found + 1);
    if (end < 0) break;
    const line = html.slice(found, end);
    const type = getAttr(line, 'data-error-type=');
    const token = getAttr(line, 'data-error-input=');
    const output = getAttr(line, 'data-error-output=');
    if (!token) continue;

    const suggestions = output
      ? output
          .split(/[|｜]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    let offset = original.indexOf(token, searchFrom);
    if (offset < 0) offset = original.indexOf(token);
    if (offset < 0) continue;
    searchFrom = offset + token.length;

    const key = `${offset}:${token}→${suggestions[0] || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = typeLabel(type);
    issues.push({
      offset,
      length: token.length,
      token,
      suggestions,
      message: suggestions[0]
        ? `[${label}] 「${token}」→「${suggestions[0]}」`
        : `[${label}] 「${token}」 확인`,
    });
  }
  return issues;
}

async function checkViaDaum(text: string): Promise<SpellIssue[]> {
  const sentence = text.slice(0, 1000);
  const res = await fetch(DAUM_URL, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html',
    },
    body: new URLSearchParams({ sentence }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`맞춤법 서버 ${res.status}`);
  const html = await res.text();
  if (!html.includes('data-error-type') && !html.includes('grammar_checker')) {
    /* 오류 없음일 수도, 차단일 수도 — 마커가 전혀 없으면 실패로 봄 */
    if (!html.includes('맞춤법') && !html.includes('error')) {
      throw new Error('맞춤법 응답을 해석하지 못했어요');
    }
  }
  return parseDaumHtml(html, text);
}

export async function checkKoreanText(text: string): Promise<SpellIssue[]> {
  if (!text.trim()) return [];
  return checkViaDaum(text);
}

export async function checkDialogueLines(
  lines: { id: string; text: string }[],
): Promise<SpellLineResult[]> {
  const out: SpellLineResult[] = [];
  for (const line of lines) {
    const text = line.text || '';
    if (!text.trim()) {
      out.push({ lineId: line.id, text, issues: [] });
      continue;
    }
    try {
      const issues = await checkKoreanText(text);
      const suggestedText = issues.length ? applyFirstSuggestions(text, issues) : undefined;
      out.push({
        lineId: line.id,
        text,
        issues,
        suggestedText: suggestedText !== text ? suggestedText : undefined,
      });
    } catch (err) {
      out.push({
        lineId: line.id,
        text,
        issues: [
          {
            offset: 0,
            length: 0,
            token: '',
            suggestions: [],
            message: err instanceof Error ? err.message : '검사 실패',
          },
        ],
      });
    }
    await new Promise((r) => setTimeout(r, 280));
  }
  return out;
}
