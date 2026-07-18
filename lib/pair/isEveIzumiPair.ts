/** 이브 × 이즈미 페어만 — 다른 페어에는 적용하지 않음 */
export function isEveIzumiPair(chars: readonly string[] | undefined | null): boolean {
  const names = (chars || []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (names.length < 2) return false;
  const hasEve = names.some((n) => n.includes('이브') || n.includes('eve'));
  const hasIzumi = names.some((n) => n.includes('이즈미') || n.includes('izumi'));
  return hasEve && hasIzumi;
}
