/** Admin overlay가 열리면 전체 site 섹션을 무제한 구독 */

type Listener = (eager: boolean) => void;

let eager = false;
const listeners = new Set<Listener>();

export function getSiteContentEager(): boolean {
  return eager;
}

export function setSiteContentEager(next: boolean): void {
  if (eager === next) return;
  eager = next;
  listeners.forEach((fn) => fn(eager));
}

export function subscribeSiteContentEager(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
