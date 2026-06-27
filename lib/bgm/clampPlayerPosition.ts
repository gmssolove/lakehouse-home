export function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function clampBgmPlayerPosition(
  leftPx: number,
  topPx: number,
  width: number,
  height: number,
  margin = 8,
) {
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.max(margin, Math.min(leftPx, maxLeft)),
    top: Math.max(margin, Math.min(topPx, maxTop)),
  };
}

export function isBgmPlayerOffscreen(
  leftPx: number,
  topPx: number,
  width: number,
  height: number,
): boolean {
  const margin = 8;
  if (leftPx + width < margin || topPx + height < margin) return true;
  if (leftPx > window.innerWidth - margin || topPx > window.innerHeight - margin) return true;

  const visibleW = Math.min(leftPx + width, window.innerWidth) - Math.max(leftPx, 0);
  const visibleH = Math.min(topPx + height, window.innerHeight) - Math.max(topPx, 0);
  const minVisible = Math.min(48, width * 0.55, height * 0.55);
  return visibleW < minVisible || visibleH < minVisible;
}
