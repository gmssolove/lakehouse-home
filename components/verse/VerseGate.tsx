'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { useLakeBackGesture } from '@/lib/hooks/useLakeBackNavigation';
import { parseYoutubeId } from '@/lib/bgm/playlist';

type Lang = 'kr' | 'en' | 'jp';

type Particle = {
  left: string;
  duration: string;
  delay: string;
  size: number;
};

const COPY = {
  kr: {
    archive: 'Archive',
    archiveSub: '境界の記録',
    school: 'School',
    schoolSub: '学校案内 — SOON',
  },
  en: {
    archive: 'Archive',
    archiveSub: '境界の記録',
    school: 'School',
    schoolSub: '学校案内 — SOON',
  },
  jp: {
    archive: 'Archive',
    archiveSub: '境界の記録',
    school: 'School',
    schoolSub: '学校案内 — SOON',
  },
} as const;

function makeParticles(): Particle[] {
  return Array.from({ length: 22 }, () => ({
    left: `${4 + Math.random() * 92}%`,
    duration: `${22 + Math.random() * 18}s`,
    delay: `${Math.random() * 10}s`,
    size: 1.4 + Math.random() * 0.8,
  }));
}

function findKisaragiCard(
  cards: {
    id: string;
    name: string;
    sub: string;
    icon: string;
    href?: string;
    entryBgm?: { title?: string; artist?: string; fileUrl?: string; url?: string };
  }[],
) {
  const scored = cards
    .map((c) => {
      let score = 0;
      if (c.href === '/verse/gate') score += 4;
      if (c.id === 'kisaragi') score += 3;
      if (c.name === '키사라기고교') score += 2;
      if (/如月|Kisaragi/i.test(c.sub || '') && c.icon === '如') score += 2;
      if (c.entryBgm?.fileUrl || c.entryBgm?.url) score += 1;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.c;
}

export function VerseGate() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState<Lang>('kr');
  const [hover, setHover] = useState<'archive' | 'school' | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const t = COPY[lang];
  const { universe, loaded } = useSiteContent();
  const { playCharacterTheme, restorePageSnapshot } = useBgm();
  const bgmRef = useRef({ playCharacterTheme, restorePageSnapshot });
  bgmRef.current = { playCharacterTheme, restorePageSnapshot };

  const kisaragi = useMemo(() => findKisaragiCard(universe), [universe]);

  const goBack = useCallback(() => {
    bgmRef.current.restorePageSnapshot(true);
    // 세계관 탭에서 입장 → 세계관 탭으로 복귀 (URL에 탭 유지)
    router.push('/?p=universe');
  }, [router]);

  useLakeBackGesture(goBack, true);

  useEffect(() => {
    setParticles(makeParticles());
    const id = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!loaded || !kisaragi) return;
    const bgm = kisaragi.entryBgm;
    const fileUrl = bgm?.fileUrl?.trim();
    const extUrl = bgm?.url?.trim();
    const ytId = extUrl ? parseYoutubeId(extUrl) : null;
    if (!fileUrl && !extUrl) return;

    bgmRef.current.playCharacterTheme(
      {
        fileData: fileUrl || (ytId ? undefined : extUrl),
        youtubeId: ytId || undefined,
        title: bgm?.title || kisaragi.name || 'Universe',
        artist: bgm?.artist || '',
      },
      false,
    );

    return () => {
      bgmRef.current.restorePageSnapshot(true);
    };
  }, [
    loaded,
    kisaragi?.id,
    kisaragi?.name,
    kisaragi?.entryBgm?.fileUrl,
    kisaragi?.entryBgm?.url,
    kisaragi?.entryBgm?.title,
    kisaragi?.entryBgm?.artist,
  ]);

  return (
    <div
      className={[
        'kb-entrance is-select',
        ready ? 'is-ready' : '',
        hover === 'archive' ? 'is-hover-archive' : '',
        hover === 'school' ? 'is-hover-school' : '',
      ].join(' ')}
    >
      <button type="button" className="kb-gate-back" onClick={goBack}>
        ← back
      </button>

      <div id="select-language" aria-label="Language">
        {(
          [
            { id: 'kr', label: 'KR' },
            { id: 'en', label: 'EN' },
            { id: 'jp', label: 'JP' },
          ] as const
        ).map((item, i) => (
          <span key={item.id} className="kb-lang-wrap">
            {i > 0 && (
              <div className="slash">
                <span>/</span>
              </div>
            )}
            <button
              type="button"
              className={lang === item.id ? 'active' : ''}
              onClick={() => setLang(item.id)}
            >
              <span>{item.label}</span>
            </button>
          </span>
        ))}
      </div>

      <div id="share">
        <div className="title">
          <span>Share</span>
        </div>
        <ul>
          <li>
            <a className="x" aria-label="X">
              <svg viewBox="0 0 13 14" fill="none">
                <path
                  d="M7.73677 5.92804L12.5763 0H11.4295L7.22732 5.14724L3.87105 0H0L5.07533 7.78354L0 14H1.14688L5.58449 8.56434L9.12895 14H13L7.73648 5.92804H7.73677ZM6.16595 7.85211L1.56012 0.909776H3.32166L11.43 13.1316H9.66849L6.16595 7.85241V7.85211Z"
                  fill="#FBFBFB"
                />
              </svg>
            </a>
          </li>
        </ul>
      </div>

      <div id="mainVisual" className="section is-active">
        <div className="section-wrap">
          <div className="section-inner">
            <div className="kb-veil" aria-hidden />

            <div className="back bg" aria-hidden />
            <div className="archive bg" aria-hidden />
            <div className="school bg" aria-hidden />

            <div className="kb-lift" aria-hidden>
              <span className="kb-lift__fog kb-lift__fog--a" />
              <span className="kb-lift__fog kb-lift__fog--b" />
              <span className="kb-lift__fog kb-lift__fog--c" />
              <span className="kb-lift__fog kb-lift__fog--d" />
              <span className="kb-lift__fog kb-lift__fog--e" />
              {particles.map((p, i) => (
                <span
                  key={i}
                  className="kb-particle"
                  style={{
                    left: p.left,
                    width: p.size,
                    height: p.size,
                    animationDuration: p.duration,
                    animationDelay: p.delay,
                  }}
                />
              ))}
            </div>

            <div className="kb-vignette" aria-hidden />
            <div className="kb-grain" aria-hidden />

            <div className="kb-center">
              <h1 className="kb-logo">
                <span className="kb-logo__jp">如月高校</span>
                <span className="kb-logo__rule" />
                <span className="kb-logo__en">KISARAGI</span>
              </h1>
              <p className="kb-center__whisper">境界の門</p>
            </div>

            <Link
              href="/verse"
              className="archive site"
              onMouseEnter={() => setHover('archive')}
              onMouseLeave={() => setHover(null)}
            >
              <div className="site-inner">
                <div className="line" />
                <div className="name">
                  <span>{t.archive}</span>
                </div>
                <p className="site-sub">{t.archiveSub}</p>
              </div>
            </Link>

            <div
              className="school site is-soon"
              onMouseEnter={() => setHover('school')}
              onMouseLeave={() => setHover(null)}
            >
              <div className="site-inner">
                <div className="line" />
                <div className="name">
                  <span>{t.school}</span>
                </div>
                <p className="site-sub">{t.schoolSub}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
