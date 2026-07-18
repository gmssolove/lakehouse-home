/** 쉼표 구분 목록 — 입력 중 띄어쓰기 유지 */

export function joinCommaList(items: string[] | undefined): string {
  return (items ?? []).join(', ');
}

/**
 * 입력 중 파싱: 마지막 칸은 trim 하지 않아 단어 사이 공백 입력이 가능.
 * 완성된 칸(쉼표 앞)만 trim.
 */
export function splitCommaListLive(raw: string): string[] {
  // 쉼표(,，、) 또는 줄바꿈(엔터)으로 항목을 나눈다
  const parts = raw.split(/[,，、\n]/);
  if (parts.length === 1) return [parts[0] ?? ''];
  return parts.map((p, i) => (i === parts.length - 1 ? p.replace(/^\s+/, '') : p.trim()));
}

/** 저장 시 앞뒤 공백 제거 · 빈 항목 삭제 */
export function finalizeCommaList(items: string[] | undefined): string[] {
  return (items ?? []).map((s) => s.trim()).filter(Boolean);
}
