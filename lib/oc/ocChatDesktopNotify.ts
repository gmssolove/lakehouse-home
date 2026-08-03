/**
 * 다른 탭을 보는 동안 OC 채팅 알림 — OS Notification.
 * (숨은 탭에서는 in-page 토스트·rAF 기반 SFX가 멈춤)
 */

let permissionAsked = false;

export function armOcChatDesktopNotify(): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  if (permissionAsked) return;
  permissionAsked = true;
  /* 제스처 직후가 아니면 브라우저가 무시할 수 있음 — 실패해도 무해 */
  void Notification.requestPermission().catch(() => {});
}

/** 채팅 패널을 연 유저 제스처에서 권한 요청 */
export function requestOcChatDesktopNotifyPermission(): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  permissionAsked = true;
  void Notification.requestPermission().catch(() => {});
}

export function showOcChatDesktopNotify(opts: {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  /* 포그라운드면 페이지 토스트만 */
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

  try {
    const n = new Notification(opts.title || 'lakehouse', {
      body: (opts.body || '').slice(0, 140),
      icon: opts.icon || undefined,
      tag: opts.tag || 'lakehouse-oc-chat',
      silent: false,
      requireInteraction: false,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      opts.onClick?.();
      try {
        n.close();
      } catch {
        /* ignore */
      }
    };
    /* 자동 정리 */
    window.setTimeout(() => {
      try {
        n.close();
      } catch {
        /* ignore */
      }
    }, 12_000);
  } catch {
    /* ignore */
  }
}
