'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/** 개발 서버에서만 — 저장 시 Fast Refresh로 즉시 반영됨을 표시 */
export function LiveDevHud() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    setVisible(true);
    setLastRefresh(new Date());

    const onVisible = () => setLastRefresh(new Date());
    window.addEventListener('focus', onVisible);
    return () => window.removeEventListener('focus', onVisible);
  }, [pathname]);

  if (!visible) return null;

  const time = lastRefresh
    ? lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div
      className={`live-dev-hud${collapsed ? ' live-dev-hud--collapsed' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="로컬 개발 미리보기"
    >
      <button
        type="button"
        className="live-dev-hud__toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? '개발 HUD 펼치기' : '개발 HUD 접기'}
      >
        <span className="live-dev-hud__dot" aria-hidden="true" />
        {collapsed ? 'LIVE' : 'LOCAL DEV'}
      </button>
      {!collapsed ? (
        <div className="live-dev-hud__body">
          <p className="live-dev-hud__line">
            <strong>실시간 미리보기</strong> — 파일 저장 시 자동 반영
          </p>
          <p className="live-dev-hud__meta">
            {pathname}
            {time ? ` · ${time}` : ''}
          </p>
          <p className="live-dev-hud__hint">배포 전 확인용 · 운영 사이트와 별개</p>
        </div>
      ) : null}
    </div>
  );
}
