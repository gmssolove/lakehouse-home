'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { usePairData } from '@/lib/hooks/usePairData';
import type { PairItem } from '@/lib/types/character';

export function PairPageClient() {
  const router = useRouter();
  const { pairs } = usePairData();
  const { isAdmin } = useAuth();
  const [detail, setDetail] = useState<PairItem | null>(null);

  const handleDetailBack = useCallback(() => setDetail(null), []);
  const leavePair = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace('/');
  }, [router]);

  const routeGuard = useMemo(() => ({ guardPath: '/pair', router }), [router]);

  useLakeBackNavigation(!!detail, handleDetailBack, 'pair-detail', routeGuard);
  useLakeBackGesture(() => {
    if (detail) setDetail(null);
    else leavePair();
  });

  return (
    <>
      <nav>
        <Link href="/" replace className="nav-back">
          ← back
        </Link>
        <div className="nav-title">Pair — Relationships</div>
        <ul className="nav-links">
          <li>
            <Link href="/oc">OC</Link>
          </li>
          <li className="active">
            <Link href="/pair">Pair</Link>
          </li>
        </ul>
      </nav>

      <div className="main-content">
        <div className="pair-grid" id="pair-grid">
          {pairs.map((p) => (
            <div key={p.id} className="pair-card" onClick={() => setDetail(p)}>
              <div className="pair-card-imgs">
                {p.chars.map((name, i) => {
                  const img = p.charImgs?.[i];
                  const fit = p.charImgFit?.[i] || 'cover';
                  const pos = p.charImgPos?.[i] || 'center top';
                  return (
                    <div key={i} className="pair-char-wrap">
                      {img ? (
                        <img
                          className="pair-char-img"
                          src={img}
                          alt={name}
                          style={{ objectFit: fit as React.CSSProperties['objectFit'], objectPosition: pos }}
                        />
                      ) : (
                        <div className="pair-char-placeholder">{name[0]}</div>
                      )}
                    </div>
                  );
                })}
                <div className="pair-center-line" />
                <div className="pair-center-symbol">&</div>
              </div>
              <div className="pair-card-bottom">
                <div className="pair-card-names">
                  {p.chars[0]} <span>&</span> {p.chars[1]}
                </div>
                <div className="pair-card-rel">{p.relation}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div id="detail-screen" className={detail ? 'active' : ''}>
        {detail && (
          <>
            <div className="detail-nav">
              <button type="button" className="detail-back-btn" onClick={() => setDetail(null)}>
                ← 목록으로
              </button>
              <div className="detail-nav-title">
                {detail.chars[0]} & {detail.chars[1]}
              </div>
              {isAdmin && (
                <button type="button" className="btn-edit" style={{ display: 'block' }}>
                  ✎ 수정
                </button>
              )}
            </div>
            <div className="detail-body">
              <div className="detail-pair-title">
                {detail.chars[0]} <span>&</span> {detail.chars[1]}
              </div>
              <div className="detail-rel-badge">{detail.relation || '—'}</div>
              <div className="detail-section-title">About</div>
              <div className="detail-desc">{detail.desc || '—'}</div>
              <div className="detail-section-title">Story</div>
              <div className="detail-desc" style={{ whiteSpace: 'pre-wrap' }}>
                {detail.story || '—'}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
