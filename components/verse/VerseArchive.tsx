'use client';

import Link from 'next/link';

const NAV = [
  { label: '核心', pending: true },
  { label: '組織', pending: true },
  { label: '起源', pending: true },
  { label: '年表', pending: true },
  { label: '人物', pending: true },
  { label: '関係', pending: true },
] as const;

export function VerseArchive() {
  return (
    <div className="sheet">
      <div className="sheet__grain" aria-hidden />
      <aside className="sheet__rail">
        <Link href="/verse/gate" className="sheet__back">
          PORTAL
        </Link>
        <nav className="sheet__nav" aria-label="menu">
          {NAV.map((item) => (
            <span key={item.label} className={`sheet__nav-item${item.pending ? ' is-pending' : ''}`}>
              {item.label}
            </span>
          ))}
        </nav>
      </aside>
      <section className="sheet__stage">
        <div className="sheet__copy">
          <p className="sheet__latin">境界の記録</p>
          <h1 className="sheet__h">
            ARCHIVE
            <span>아직 봉인된 페이지들</span>
          </h1>
          <p className="sheet__body">
            공식 아카이브 본편은 이어서 채워집니다.
            <br />
            포털의 Archive Site에서 진입한 세계관 허브입니다.
          </p>
          <p className="sheet__body sheet__body--dim">열람 주의 — 기록은 열릴 준비가 되는 대로 연결됩니다.</p>
        </div>
      </section>
    </div>
  );
}
