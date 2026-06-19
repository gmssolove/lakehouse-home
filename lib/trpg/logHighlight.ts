function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CoC·TRPG 로그에서 주사위·판정 구문 강조 */
const ROLL_PATTERN =
  /(\d+d\d+(?:[+-]\d+)?(?:\s*(?:[<≤=>≥]|≦|≧)\s*\d+)?|\b(?:크(?:리티컬|대성공)|대실패|ファンブル|クリティカル|成功|失敗|성공|실패)\b)/gi;

export function highlightLogPlainText(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(ROLL_PATTERN, '<mark class="trpg-roll-hit">$1</mark>');
}
