/**
 * VN 오디오 — 404/autoplay 실패 시 콘솔 경고만 하고 진행을 막지 않음
 */
export function warnVnAudio(kind: 'bgm' | 'sfx', message: string, detail?: unknown) {
  if (detail !== undefined) {
    console.warn(`[vn ${kind}] ${message}`, detail);
  } else {
    console.warn(`[vn ${kind}] ${message}`);
  }
}

/** Audio 엘리먼트에 에러 리스너를 붙이고 play()를 안전하게 호출 */
export function playSafe(
  el: HTMLAudioElement,
  kind: 'bgm' | 'sfx',
  url: string,
): void {
  const onError = () => {
    warnVnAudio(kind, `로드 실패(404 등) — 무시하고 계속: ${url}`);
  };
  el.addEventListener('error', onError, { once: true });
  void el.play().catch((err) => {
    warnVnAudio(kind, `재생 실패 — 무시하고 계속: ${url}`, err);
  });
}
