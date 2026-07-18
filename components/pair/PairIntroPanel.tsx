'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OcRichText } from '@/lib/oc/richText';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import {
  hasIntroFirstNow,
  resolveIntroPov,
  resolveIntroPovArt,
  type IntroViewpoint,
} from '@/lib/pair/introViewpoint';
import { StatRadarChart } from '@/components/shared/StatRadarChart';
import type { ImageFrame, PairChemistry, PairInterviewQA, PairIntro } from '@/lib/types/character';

type SectionId = 'define' | 'firstnow' | 'interview' | 'chem';

type Props = {
  overview?: string;
  introInterview: PairInterviewQA[];
  nameA: string;
  nameB: string;
  imgA?: string;
  imgB?: string;
  /** 섹션별 일러스트·시점별 첫인상/현인상 */
  intro?: PairIntro | null;
  chemistry?: PairChemistry[];
  accent?: string;
};

const LABELS: Record<SectionId, string> = {
  define: '관계 정의',
  firstnow: '첫인상 · 현인상',
  interview: '인터뷰',
  chem: '케미 수치',
};

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '').trim();
}

function ArtMedia({
  src,
  frame,
}: {
  src?: string;
  frame?: ImageFrame;
}) {
  if (!src) return <span className="pair-intro-v2__art-void" />;
  /* cover + 중앙. 비율/박스 바뀌면 ImageFrameView가 다시 맞춤.
   * y를 살짝 위로 — 하단 여백이 과해 보이지 않게 */
  const displayFrame: ImageFrame = {
    scale: frame?.scale ?? 1,
    x: frame?.x ?? 0,
    y: (frame?.y ?? 0) - 12,
    bottomBlur: frame?.bottomBlur,
  };
  return (
    <ImageFrameView
      src={src}
      frame={displayFrame}
      fit="cover"
      pos="center center"
      className="pair-intro-v2__art-frame"
    />
  );
}

function FloatArt({
  src,
  frame,
  tone,
  aspectRatio = '1 / 1',
  size = 100,
  swapAnim = false,
}: {
  src?: string;
  frame?: ImageFrame;
  tone: 'warm' | 'cool' | 'soft' | 'deep';
  aspectRatio?: string;
  size?: number;
  swapAnim?: boolean;
}) {
  const ratio = (aspectRatio || '1 / 1').trim() || '1 / 1';
  const is43 = ratio.replace(/\s+/g, '') === '4/3';
  const pct = Math.min(140, Math.max(60, size || 100));
  return (
    <figure
      className={`pair-intro-v2__art pair-intro-v2__art--${tone} intro-illustration${is43 ? ' is-ratio-43' : ''}${swapAnim ? ' is-pov-swap' : ''}`}
      style={{
        aspectRatio: ratio,
        ['--intro-art-size' as string]: String(pct / 100),
      }}
      aria-hidden={!src}
    >
      <ArtMedia src={src} frame={frame} />
    </figure>
  );
}

export function PairIntroPanel({
  overview = '',
  introInterview,
  nameA,
  nameB,
  imgA,
  imgB,
  intro,
  chemistry,
  accent = '#d7a982',
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const [activeSec, setActiveSec] = useState(0);
  const [dotTops, setDotTops] = useState<number[]>([]);
  const [mobileProgress, setMobileProgress] = useState(0);
  const [firstNowPov, setFirstNowPov] = useState<IntroViewpoint>('A');
  const animLock = useRef(false);
  const activeSecRef = useRef(0);
  const sectionCountRef = useRef(0);
  const scrollRaf = useRef(0);
  const lastH = useRef(0);

  const interview = introInterview[0];
  const interviewQ = interview?.question?.trim() || '';
  const answerA = interview?.answerA?.trim() || '';
  const answerB = interview?.answerB?.trim() || '';

  const chemRows = useMemo(
    () => (chemistry || []).filter((r) => r.label?.trim()),
    [chemistry],
  );

  const chemAxes = useMemo(
    () =>
      chemRows.map((r) => ({
        axis: r.label.trim(),
        value: Number(r.value) || 0,
        hint: r.hint?.trim() || undefined,
      })),
    [chemRows],
  );

  const povFields = useMemo(
    () => resolveIntroPov(intro, firstNowPov),
    [intro, firstNowPov],
  );

  const povArt = useMemo(
    () => resolveIntroPovArt(intro, firstNowPov),
    [intro, firstNowPov],
  );

  const sections = useMemo(() => {
    const list: { id: SectionId; show: boolean }[] = [
      { id: 'define', show: !!overview.trim() },
      { id: 'firstnow', show: hasIntroFirstNow(intro) },
      { id: 'interview', show: !!(interviewQ || answerA || answerB) },
      { id: 'chem', show: chemRows.length >= 3 },
    ];
    return list.filter((s) => s.show);
  }, [overview, intro, interviewQ, answerA, answerB, chemRows.length]);

  sectionCountRef.current = sections.length;

  const layoutDots = useCallback(() => {
    const n = sections.length;
    if (!n) {
      setDotTops([]);
      return;
    }
    setDotTops(sections.map((_, i) => ((i + 0.5) / n) * 100));
  }, [sections]);

  const paintRail = useCallback(
    (index: number) => {
      const fill = railFillRef.current;
      const root = scrollRef.current;
      if (!fill || !sections.length) return;
      const i = Math.max(0, Math.min(index, sections.length - 1));
      const pct =
        sections.length <= 1 ? 100 : ((i + 0.5) / sections.length) * 100;
      fill.style.height = `${pct}%`;
      const host = root?.closest('.pair-intro--v2') ?? root?.parentElement;
      host?.querySelectorAll('.pair-intro-v2__dot').forEach((el, di) => {
        el.classList.toggle('is-lit', di <= i);
        el.classList.toggle('is-current', di === i);
      });
      root?.querySelectorAll('.pair-intro-v2__beat').forEach((el, bi) => {
        el.classList.toggle('is-active', bi === i);
        if (bi === i) el.classList.add('is-in');
      });
    },
    [sections.length],
  );

  const syncActiveFromScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root || !sections.length) return;
    const h = Math.max(1, root.clientHeight);
    const idx = Math.round(root.scrollTop / h);
    const next = Math.max(0, Math.min(sections.length - 1, idx));
    if (next !== activeSecRef.current) {
      activeSecRef.current = next;
      setActiveSec(next);
      paintRail(next);
    }
  }, [sections, paintRail]);

  const goToSection = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const root = scrollRef.current;
      if (!root || !sections.length) return;
      const next = Math.max(0, Math.min(sections.length - 1, index));
      const h = root.clientHeight;
      animLock.current = true;
      activeSecRef.current = next;
      setActiveSec(next);
      paintRail(next);
      root.scrollTo({ top: next * h, behavior });
      window.setTimeout(
        () => {
          animLock.current = false;
        },
        behavior === 'smooth' ? 480 : 16,
      );
    },
    [sections.length, paintRail],
  );

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !sections.length) return;

    layoutDots();
    paintRail(activeSecRef.current);
    lastH.current = root.clientHeight;

    const onScroll = () => {
      if (scrollRaf.current) return;
      scrollRaf.current = window.requestAnimationFrame(() => {
        scrollRaf.current = 0;
        const max = root.scrollHeight - root.clientHeight;
        const p = max > 0 ? root.scrollTop / max : 0;
        setMobileProgress((prev) => (Math.abs(prev - p) < 0.01 ? prev : p));
        if (!animLock.current) syncActiveFromScroll();
      });
    };

    const onWheel = (e: WheelEvent) => {
      if (sectionCountRef.current <= 1) return;
      if (Math.abs(e.deltaY) < 10) return;
      e.preventDefault();
      if (animLock.current) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      goToSection(activeSecRef.current + dir, 'smooth');
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        goToSection(activeSecRef.current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goToSection(activeSecRef.current - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToSection(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToSection(sectionCountRef.current - 1);
      }
    };

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const h = root.clientHeight;
        if (Math.abs(h - lastH.current) < 2) return;
        lastH.current = h;
        layoutDots();
        goToSection(activeSecRef.current, 'auto');
      }, 120);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('keydown', onKey);
    root.tabIndex = 0;
    window.addEventListener('resize', onResize);
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(root);

    /* 첫 비트만 즉시 표시 — IntersectionObserver 매 스크롤 부하 제거 */
    root.querySelector(`[data-intro-sec="0"]`)?.classList.add('is-in', 'is-active');

    return () => {
      if (scrollRaf.current) window.cancelAnimationFrame(scrollRaf.current);
      window.clearTimeout(resizeTimer);
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [sections, layoutDots, syncActiveFromScroll, goToSection, paintRail]);

  /* rail fill은 paintRail에서 직접 갱신 — activeSec effect 불필요 */

  if (!sections.length) {
    return (
      <div className="pair-panel__relation pair-intro pair-intro--v2">
        <p className="pair-intro-v2__empty">아직 소개 내용이 없습니다.</p>
      </div>
    );
  }

  const tones = ['warm', 'cool', 'soft', 'deep'] as const;
  const fallback = (i: number) => (i % 2 === 0 ? imgA : imgB);

  const artFor = (
    id: SectionId,
    i: number,
  ): { src?: string; frame?: ImageFrame; aspectRatio?: string; size?: number } | null => {
    if (id === 'chem') return null;
    if (id === 'define') {
      const src = intro?.defineImg?.trim() || fallback(i)?.trim();
      return {
        src: src || undefined,
        frame: intro?.defineImg ? intro.defineImgFrame : undefined,
        aspectRatio: intro?.defineImg ? intro.defineImgAspect : undefined,
        size: intro?.defineImg ? intro.defineImgSize : undefined,
      };
    }
    if (id === 'firstnow') {
      const src = povArt.src?.trim() || fallback(i)?.trim();
      return {
        src: src || undefined,
        frame: povArt.src ? povArt.frame : undefined,
        aspectRatio: povArt.src ? povArt.aspectRatio : undefined,
        size: povArt.src ? povArt.size : undefined,
      };
    }
    const src = intro?.interviewImg?.trim() || fallback(i)?.trim();
    return {
      src: src || undefined,
      frame: intro?.interviewImg ? intro.interviewImgFrame : undefined,
      aspectRatio: intro?.interviewImg ? intro.interviewImgAspect : undefined,
      size: intro?.interviewImg ? intro.interviewImgSize : undefined,
    };
  };

  return (
    <div className="pair-panel__relation pair-intro pair-intro--v2">
      <div className="pair-intro-v2__mobile-bar" aria-hidden>
        <div
          className="pair-intro-v2__mobile-fill"
          style={{ width: `${Math.round(mobileProgress * 100)}%` }}
        />
      </div>

      <aside className="pair-intro-v2__rail" aria-hidden={false}>
        <div className="pair-intro-v2__rail-track">
          <div className="pair-intro-v2__rail-fill" ref={railFillRef} />
        </div>
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`pair-intro-v2__dot${i <= activeSec ? ' is-lit' : ''}`}
            style={{ top: `${dotTops[i] ?? ((i + 0.5) / sections.length) * 100}%` }}
            aria-label={`${LABELS[s.id]}로 이동`}
            onClick={() => goToSection(i)}
          />
        ))}
      </aside>

      <div className="pair-intro-v2" ref={scrollRef} tabIndex={0} aria-label="소개 챕터 스크롤">
        {sections.map((s, i) => {
          const side = i % 2 === 0 ? 'left' : 'right';
          const art = artFor(s.id, i);
          const isChem = s.id === 'chem';

          return (
            <section
              key={s.id}
              className={`pair-intro-v2__beat pair-intro-v2__beat--${s.id} pair-intro-v2__beat--${side}`}
              data-intro-sec={i}
              data-id={s.id}
            >
              <div
                className={`pair-intro-v2__stage${isChem ? ' pair-intro-v2__stage--chem' : ''}`}
              >
                {!isChem && art ? (
                  <FloatArt
                    key={s.id === 'firstnow' ? `fn-art-${firstNowPov}` : s.id}
                    src={art.src}
                    frame={art.frame}
                    aspectRatio={art.aspectRatio}
                    size={art.size}
                    tone={tones[i % tones.length]}
                    swapAnim={s.id === 'firstnow'}
                  />
                ) : null}

                <div className="pair-intro-v2__copy">
                  <p className="pair-intro-v2__label">{LABELS[s.id]}</p>

                  {s.id === 'define' ? (
                    <OcRichText
                      text={overview}
                      className="pair-intro-v2__voice pair-intro-v2__voice--lead"
                    />
                  ) : null}

                  {s.id === 'firstnow' ? (
                    <div className="pair-intro-v2__duo">
                      <div
                        className="pair-menu pair-menu--story-sub pair-menu--intro-pov"
                        role="tablist"
                        aria-label="첫인상 · 현인상 시점"
                      >
                        <span className="pair-menu__slot">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={firstNowPov === 'A'}
                            className={`pair-menu__item${firstNowPov === 'A' ? ' is-active' : ''}`}
                            style={{ ['--menu-i' as string]: 0 }}
                            onClick={() => setFirstNowPov('A')}
                          >
                            <span className="pair-menu__glow" aria-hidden />
                            <span className="pair-menu__ko">{nameA} 시점</span>
                          </button>
                        </span>
                        <span className="pair-menu__sep" aria-hidden>
                          |
                        </span>
                        <span className="pair-menu__slot">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={firstNowPov === 'B'}
                            className={`pair-menu__item${firstNowPov === 'B' ? ' is-active' : ''}`}
                            style={{ ['--menu-i' as string]: 1 }}
                            onClick={() => setFirstNowPov('B')}
                          >
                            <span className="pair-menu__glow" aria-hidden />
                            <span className="pair-menu__ko">{nameB} 시점</span>
                          </button>
                        </span>
                      </div>
                      <div
                        key={firstNowPov}
                        className={`pair-intro-v2__pov-pane pair-intro-v2__pov-pane--${firstNowPov === 'A' ? 'a' : 'b'}`}
                      >
                        <blockquote className="pair-intro-v2__quote is-past">
                          <span className="pair-intro-v2__quote-tag">첫인상</span>
                          <p className="pair-intro-v2__voice">
                            {povFields.first.trim()
                              ? `“${stripHtml(povFields.first)}”`
                              : '“—”'}
                          </p>
                        </blockquote>
                        <blockquote className="pair-intro-v2__quote is-now">
                          <span className="pair-intro-v2__quote-tag">현인상</span>
                          <p className="pair-intro-v2__voice">
                            {povFields.now.trim()
                              ? `“${stripHtml(povFields.now)}”`
                              : '“—”'}
                          </p>
                        </blockquote>
                      </div>
                    </div>
                  ) : null}

                  {s.id === 'interview' ? (
                    <div className="pair-intro-v2__qa">
                      {interviewQ ? (
                        <p className="pair-intro-v2__q">
                          <span aria-hidden>Q</span>
                          {stripHtml(interviewQ)}
                        </p>
                      ) : null}
                      <div className="pair-intro-v2__answers">
                        {answerA ? (
                          <blockquote className="pair-intro-v2__quote is-gaze is-answer">
                            <span className="pair-intro-v2__who">{nameA}</span>
                            <p className="pair-intro-v2__voice">{`“${stripHtml(answerA)}”`}</p>
                          </blockquote>
                        ) : null}
                        {answerB ? (
                          <blockquote className="pair-intro-v2__quote is-gaze is-answer">
                            <span className="pair-intro-v2__who">{nameB}</span>
                            <p className="pair-intro-v2__voice">{`“${stripHtml(answerB)}”`}</p>
                          </blockquote>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {s.id === 'chem' ? (
                    <div className="pair-intro-v2__chem-radar" aria-label="케미 수치">
                      <StatRadarChart
                        axes={chemAxes}
                        accent={accent}
                        label="케미 레이더"
                        className="pair-intro-v2__radar"
                        size={280}
                        radius={88}
                        ornate
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
