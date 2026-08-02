/**
 * 채팅 알림 SFX — 백그라운드 탭/자동재생 정책에서도 최대한 들리게.
 * 유저 제스처로 Audio를 unlock 하고, 실패분은 탭이 다시 보일 때 재시도.
 */

let unlockedEl: HTMLAudioElement | null = null;
let unlockBound = false;
const pendingUrls: string[] = [];
let flushing = false;

function ensureUnlockListeners() {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    try {
      if (!unlockedEl) {
        unlockedEl = new Audio();
        unlockedEl.preload = 'auto';
      }
      unlockedEl.muted = true;
      unlockedEl.src =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
      void unlockedEl
        .play()
        .then(() => {
          unlockedEl!.pause();
          unlockedEl!.muted = false;
          unlockedEl!.removeAttribute('src');
          unlockedEl!.load();
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
    void flushPendingNotifySfx();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushPendingNotifySfx();
  });
}

function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const el = unlockedEl || new Audio();
      if (!unlockedEl) unlockedEl = el;
      el.muted = false;
      el.volume = 0.85;
      el.src = url;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => resolve(true)).catch(() => resolve(false));
      } else {
        resolve(true);
      }
    } catch {
      resolve(false);
    }
  });
}

export async function flushPendingNotifySfx() {
  if (flushing) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }
  flushing = true;
  try {
    while (pendingUrls.length) {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        break;
      }
      const url = pendingUrls.shift();
      if (!url) break;
      const ok = await playUrl(url);
      if (!ok) {
        pendingUrls.unshift(url);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/** 토스트와 함께 호출. 백그라운드면 큐에 넣고 포그라운드에서 재생 */
export function playOcChatNotifySfx(url: string | undefined) {
  const src = (url || '').trim();
  if (!src || typeof window === 'undefined') return;
  ensureUnlockListeners();

  if (document.visibilityState === 'hidden') {
    if (!pendingUrls.includes(src)) pendingUrls.push(src);
    return;
  }

  void playUrl(src).then((ok) => {
    if (!ok && !pendingUrls.includes(src)) {
      pendingUrls.push(src);
    }
  });
}

/** 채팅 패널 오픈 시 unlock 리스너만 미리 걸어둠 */
export function armOcChatNotifySfx() {
  ensureUnlockListeners();
}
