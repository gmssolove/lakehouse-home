/**
 * VN 실재생과 스탠딩 미리보기가 공유하는 레이아웃 상수.
 *
 * 편집·미리보기 기준 해상도: **1920×1080** (16:9).
 *
 * 실재생 최종값 (`src/oc/styles` 캐스케이드):
 *   oc-rebuild → gallery-polish → **oc-profile-dialogue-final2**
 *   `.lh-vn-overlay`: bottom 128px · width min(820px, 100vw - 86px)
 *   `.lh-vn-box`: padding 24/24/28 · min-height 126px
 *   `.lh-vn-text`: min-height 64px · font 15px / line-height 2
 *   `.lh-vn-speaker`: 18px + margin-bottom 8px
 *
 * 미리보기는 스테이지를 위 기준 해상도로 보고 % 환산한다.
 * (작은 에디터에서 min(820px, …)를 그대로 쓰면 대사창이 비정상적으로 커 보임)
 */
export const VN_STAND_LAYOUT = {
  /** 대표 플레이 해상도 (16:9) — 스탠딩 위치 편집 기준 */
  refWidth: 1920,
  refHeight: 1080,
  overlayMaxWidth: 820,
  overlaySidePad: 86,
  overlayBottomPx: 128,
  overlayPadTop: 24,
  overlayPadX: 24,
  overlayPadBottom: 28,
  speakerLinePx: 18,
  speakerMarginPx: 8,
  textMinHeightPx: 64,
  spriteHeightPct: 88,
  /** 3인 기준 — 스프라이트가 커도 왼/중/우가 구분되게 */
  slotBaseX: {
    left: -28,
    center: 0,
    right: 28,
  } as const,
} as const;

/**
 * n명 동시 등장 시 i번째 자동 배치 (중앙 기준 x%, scale).
 * 3명 이하 L/C/R 포즈와 별개 — 4명+ 군중·미세조정의 기본 레인.
 */
export function crowdStandLayout(count: number, index: number): { x: number; scale: number } {
  const n = Math.max(1, count);
  const scale = n <= 3 ? 1 : Math.max(0.42, Math.min(1, 3.2 / n));
  if (n <= 1) return { x: 0, scale: 1 };
  const halfSprite = 13 * scale;
  const halfSpan = Math.max(10, Math.min(48 - halfSprite, 14 + n * 5));
  const minX = -halfSpan;
  const maxX = halfSpan;
  const x = minX + ((maxX - minX) * index) / (Math.max(1, n) - 1);
  return { x, scale };
}

/** speaker + text + padding — 실박스 최소 콘텐츠 높이 */
function overlayContentHeightPx() {
  const {
    overlayPadTop,
    overlayPadBottom,
    speakerLinePx,
    speakerMarginPx,
    textMinHeightPx,
  } = VN_STAND_LAYOUT;
  return overlayPadTop + overlayPadBottom + speakerLinePx + speakerMarginPx + textMinHeightPx;
}

function dboxWidthPct() {
  const w = Math.min(
    VN_STAND_LAYOUT.overlayMaxWidth,
    VN_STAND_LAYOUT.refWidth - VN_STAND_LAYOUT.overlaySidePad,
  );
  return (w / VN_STAND_LAYOUT.refWidth) * 100;
}

function dboxBottomPct() {
  return (VN_STAND_LAYOUT.overlayBottomPx / VN_STAND_LAYOUT.refHeight) * 100;
}

function dboxHeightPct() {
  return (overlayContentHeightPx() / VN_STAND_LAYOUT.refHeight) * 100;
}

/** CSS 변수로 바로 넣기 좋은 값 (1920×1080 기준 %) */
export const VN_STAND_DBOX = {
  widthPct: dboxWidthPct(),
  bottomPct: dboxBottomPct(),
  heightPct: dboxHeightPct(),
  /** padding % — CSS padding %는 가로 기준이므로 refWidth로 환산 */
  padTopPctOfWidth: (VN_STAND_LAYOUT.overlayPadTop / VN_STAND_LAYOUT.refWidth) * 100,
  padXPctOfWidth: (VN_STAND_LAYOUT.overlayPadX / VN_STAND_LAYOUT.refWidth) * 100,
  padBottomPctOfWidth: (VN_STAND_LAYOUT.overlayPadBottom / VN_STAND_LAYOUT.refWidth) * 100,
  contentHeightPx: overlayContentHeightPx(),
} as const;

export type StandSlotPosition = keyof typeof VN_STAND_LAYOUT.slotBaseX;
