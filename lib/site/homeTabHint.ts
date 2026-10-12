/** 홈 메뉴 클릭을 URL 폴링보다 먼저 알려 섹션 Firebase가 바로 붙게 함 */

type Listener = (tab: string) => void;

let tab = '';
const listeners = new Set<Listener>();

export function setHomeTabHint(next: string) {
  const t = String(next || 'main').trim() || 'main';
  if (tab === t) return;
  tab = t;
  listeners.forEach((fn) => fn(tab));
}

export function getHomeTabHint() {
  return tab;
}

export function subscribeHomeTabHint(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
