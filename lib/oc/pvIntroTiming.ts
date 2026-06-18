export type PvIntroLinePlan = {
  /** 텍스트·빛 반사 인애니메이션 길이 */
  sweepMs: number;
  /** 스윕 완료 후 다음 대사(또는 종료)까지 읽기 대기 */
  pauseAfterMs: number;
};

/** 읽기 속도 기준: 공백 제외 이 글자 수일 때 아래 HOLD_* 가 적절함 */
export const PV_REF_CHAR_COUNT = 23;
export const PV_HOLD_BETWEEN_MS = 1500;
export const PV_HOLD_FINAL_MS = 1550;

export function countPvChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** 공백 제외 글자 수에 비례해 대기 시간 산출 (23자 = 기준) */
export function holdMsForLine(chars: number, isFinal: boolean): number {
  const base = isFinal ? PV_HOLD_FINAL_MS : PV_HOLD_BETWEEN_MS;
  const ratio = Math.max(1, chars / PV_REF_CHAR_COUNT);
  const scaled = Math.round(base * ratio);
  const min = base;
  const max = isFinal ? 4800 : 4000;
  return Math.min(max, Math.max(min, scaled));
}

/** durationMs = 인트로 전체 상한 힌트. 스윕·대기는 역할별로 분리 */
export function buildPvIntroPlan(lines: string[], durationMs: number): PvIntroLinePlan[] {
  const n = lines.length;
  if (n === 0) return [];

  const sweepBase = Math.max(780, Math.min(1450, Math.round(durationMs * 0.16)));

  const weights = lines.map((line) => Math.max(countPvChars(line), 6));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  return lines.map((line, index) => {
    const chars = countPvChars(line);
    const share = weights[index] / weightSum;
    const sweepMs = Math.max(720, Math.min(1500, Math.round(sweepBase * (0.9 + share * 0.28))));
    return {
      sweepMs,
      pauseAfterMs: holdMsForLine(chars, index === n - 1),
    };
  });
}

export function estimatePvIntroMs(lines: string[], durationMs: number): number {
  const plan = buildPvIntroPlan(lines, durationMs);
  return plan.reduce((sum, step) => sum + step.sweepMs + step.pauseAfterMs, 0);
}
