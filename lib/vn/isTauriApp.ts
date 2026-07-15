/** Tauri 데스크톱 앱 여부 (웹 브라우저와 닫기/나가기 분기용) */
export function isTauriApp(): boolean {
  if (typeof window === 'undefined') return false;
  /* Tauri 2는 __TAURI_INTERNALS__ 를 주입하는 경우가 많아 함께 본다 */
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
}
