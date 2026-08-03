/**
 * 숨은 탭에서도 덜 미뤄지는 타이머.
 * 메인 스레드 setTimeout은 background에서 분 단위로 throttle 됨.
 * Dedicated Worker 타이머는 상대적으로 유지되는 편이라 pending 배달에 사용.
 */

type TimerCb = () => void;

let worker: Worker | null = null;
let seq = 1;
const callbacks = new Map<number, TimerCb>();
/** Worker 실패 시 fallback native timeout id */
const nativeFallback = new Map<number, number>();
let workerFailed = false;

function ensureWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (workerFailed) return null;
  if (worker) return worker;
  try {
    const source = `
      const ids = new Map();
      self.onmessage = (e) => {
        const data = e.data || {};
        if (data.type === 'set') {
          const prev = ids.get(data.id);
          if (prev) clearTimeout(prev);
          const t = setTimeout(() => {
            ids.delete(data.id);
            self.postMessage({ id: data.id });
          }, Math.max(0, Number(data.delay) || 0));
          ids.set(data.id, t);
        } else if (data.type === 'clear') {
          const prev = ids.get(data.id);
          if (prev) clearTimeout(prev);
          ids.delete(data.id);
        }
      };
    `;
    const blob = new Blob([source], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (e: MessageEvent<{ id?: number }>) => {
      const id = e.data?.id;
      if (typeof id !== 'number') return;
      const cb = callbacks.get(id);
      callbacks.delete(id);
      try {
        cb?.();
      } catch {
        /* ignore */
      }
    };
    worker.onerror = () => {
      workerFailed = true;
      try {
        worker?.terminate();
      } catch {
        /* ignore */
      }
      worker = null;
    };
    return worker;
  } catch {
    workerFailed = true;
    worker = null;
    return null;
  }
}

/** @returns handle — clearOcChatReliableTimeout 에 전달 */
export function setOcChatReliableTimeout(cb: TimerCb, delayMs: number): number {
  const id = seq++;
  callbacks.set(id, cb);
  const delay = Math.max(0, delayMs);
  const w = ensureWorker();
  if (w) {
    w.postMessage({ type: 'set', id, delay });
    return id;
  }
  const nativeId = window.setTimeout(() => {
    callbacks.delete(id);
    nativeFallback.delete(id);
    cb();
  }, delay);
  nativeFallback.set(id, nativeId);
  return id;
}

export function clearOcChatReliableTimeout(handle: number | undefined): void {
  if (handle == null || handle <= 0) return;
  callbacks.delete(handle);
  const nativeId = nativeFallback.get(handle);
  if (nativeId != null) {
    nativeFallback.delete(handle);
    window.clearTimeout(nativeId);
  }
  if (worker && !workerFailed) {
    try {
      worker.postMessage({ type: 'clear', id: handle });
    } catch {
      /* ignore */
    }
  }
}
