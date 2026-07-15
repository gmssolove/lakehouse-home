'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { framedImageStyle, type ImageFrame } from '@/lib/shared/imageFrame';

/** Shared card model for universe / pair skew accordion */
export type SkewAccordionCard = {
  id: string;
  name: string;
  sub?: string;
  img?: string;
  imgFit?: string;
  imgPos?: string;
  imgFrame?: ImageFrame;
  icon?: string;
  glowColor?: string;
  glowOpacity?: number;
  veilColor?: string;
  veilOpacity?: number;
  comingSoon?: boolean;
};

type Props = {
  cards: SkewAccordionCard[];
  resolveHref?: (card: SkewAccordionCard) => string;
  onSelect?: (card: SkewAccordionCard) => void;
  emptyLabel?: string;
  nextAriaLabel?: string;
  /** 페어처럼 마우스 이동 시 기울기·광택 */
  interactiveTilt?: boolean;
  /** 제목 아래 금색 강조선 */
  showAccentLine?: boolean;
  /** 제목 옆 › (세계관 기본 on, 페어 off) */
  showChevron?: boolean;
  /** 긴 제목 오른쪽 페이드 마스크 */
  fadeTitle?: boolean;
};

type Tilt = { rx: number; ry: number; shine: number };

const TILT_IDLE: Tilt = { rx: 0, ry: 0, shine: 42 };

function isComingSoonCard(card: SkewAccordionCard) {
  return (
    !!card.comingSoon ||
    card.id === 'coming-soon' ||
    /^coming\s*soon$/i.test(card.name || '')
  );
}

function parseHexColor(raw: string | undefined): { r: number; g: number; b: number } {
  const fallback = { r: 215, g: 169, b: 130 };
  const text = (raw || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(text);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function glowStyle(card: SkewAccordionCard): CSSProperties {
  const raw = card.glowColor || card.veilColor;
  const { r, g, b } = parseHexColor(raw);
  const opacity = Math.min(100, Math.max(0, card.glowOpacity ?? card.veilOpacity ?? 28)) / 100;
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  return {
    '--uni-glow': `rgba(${r}, ${g}, ${b}, ${opacity})`,
    '--uni-glow-mid': `rgba(${r}, ${g}, ${b}, ${opacity * 0.55})`,
    '--uni-glow-soft': `rgba(${r}, ${g}, ${b}, ${opacity * 0.18})`,
    '--uni-accent': hex,
  } as CSSProperties;
}

export function UniverseAccordionCards({
  cards,
  resolveHref,
  onSelect,
  emptyLabel = '— 등록된 세계관이 없습니다 —',
  nextAriaLabel = '다음',
  interactiveTilt = false,
  showAccentLine = false,
  showChevron = true,
  fadeTitle = true,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canNext, setCanNext] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tiltById, setTiltById] = useState<Record<string, Tilt>>({});
  const dragRef = useRef<{
    armed: boolean;
    dragging: boolean;
    startX: number;
    startScroll: number;
    moved: boolean;
    pointerId: number | null;
  }>({
    armed: false,
    dragging: false,
    startX: 0,
    startScroll: 0,
    moved: false,
    pointerId: null,
  });

  const visible = useMemo(
    () => cards.filter((c) => !isComingSoonCard(c)),
    [cards],
  );

  const syncArrows = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanNext(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    syncArrows();
    const onScroll = () => syncArrows();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => syncArrows());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [visible, syncArrows]);

  function scrollNext() {
    const el = viewportRef.current;
    if (!el) return;
    const step = Math.min(320, el.clientWidth * 0.5);
    el.scrollBy({ left: step, behavior: 'smooth' });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const el = viewportRef.current;
    if (!el) return;
    dragRef.current = {
      armed: true,
      dragging: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
      pointerId: e.pointerId,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.armed) return;
    const el = viewportRef.current;
    if (!el) return;
    const dx = e.clientX - drag.startX;
    if (!drag.dragging) {
      if (Math.abs(dx) < 12) return;
      drag.dragging = true;
      drag.moved = true;
      el.classList.add('is-dragging');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    el.scrollLeft = drag.startScroll - dx;
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const el = viewportRef.current;
    const drag = dragRef.current;
    if (!drag.armed) return;
    drag.armed = false;
    if (drag.dragging && el) {
      el.classList.remove('is-dragging');
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drag.dragging = false;
    window.setTimeout(() => {
      drag.moved = false;
    }, 0);
  }

  function handleTiltMove(cardId: string, e: ReactMouseEvent<HTMLElement>) {
    if (!interactiveTilt || dragRef.current.dragging) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setTiltById((prev) => ({
      ...prev,
      [cardId]: {
        ry: (x - 0.5) * 14,
        rx: -(y - 0.5) * 11 - 2,
        shine: x * 100,
      },
    }));
  }

  function handleTiltLeave(cardId: string) {
    setTiltById((prev) => ({ ...prev, [cardId]: TILT_IDLE }));
  }

  if (!visible.length) {
    return <div className="page-coming">{emptyLabel}</div>;
  }

  function renderCard(card: SkewAccordionCard, index: number) {
    const href = (resolveHref?.(card) || '').trim();
    const img = (card.img || '').trim();
    const active = activeId === card.id;
    const isFirst = index === 0;
    const isLast = index === visible.length - 1;
    const tilt = tiltById[card.id] || TILT_IDLE;
    const depthStyle = {
      ...glowStyle(card),
      '--uni-depth': index,
      '--uni-rx': `${tilt.rx}deg`,
      '--uni-ry': `${tilt.ry}deg`,
      '--uni-shine': `${tilt.shine}%`,
      zIndex: active ? 40 : index + 1,
    } as CSSProperties;

    const body = (
      <span className="uni-skew__tilt">
        <span className="uni-skew__chrome" aria-hidden />
        <span className="uni-skew__face" aria-hidden>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt=""
              className="uni-skew__img"
              style={framedImageStyle(card.imgFrame, {
                fit: card.imgFit || 'cover',
                pos: card.imgPos || 'center',
              })}
              draggable={false}
            />
          ) : (
            <span className="uni-skew__empty">{card.icon || '✦'}</span>
          )}
          <span className="uni-skew__scrim" />
        </span>
        <span className="uni-skew__glow" aria-hidden />
        {interactiveTilt ? <span className="uni-skew__shine" aria-hidden /> : null}
        <span className={`uni-skew__label${showAccentLine ? ' uni-skew__label--oc' : ''}`}>
          {showAccentLine ? (
            <>
              {card.sub ? <span className="uni-skew__sub">{card.sub}</span> : null}
              <span className="uni-skew__title-stack">
                <span className="uni-skew__name">{card.name}</span>
                <span className="uni-skew__accent-line" aria-hidden />
              </span>
            </>
          ) : (
            <>
              <span className="uni-skew__name-row">
                <span className="uni-skew__name">{card.name}</span>
                {showChevron ? (
                  <span className="uni-skew__chev" aria-hidden>
                    {' ›'}
                  </span>
                ) : null}
              </span>
              {card.sub ? <span className="uni-skew__sub">{card.sub}</span> : null}
            </>
          )}
        </span>
      </span>
    );

    const className = [
      'uni-skew__card',
      active ? 'is-active' : '',
      img ? 'has-img' : '',
      !href && !onSelect ? 'is-plain' : '',
      interactiveTilt ? 'has-tilt' : '',
      interactiveTilt && active ? 'is-tilting' : '',
      fadeTitle ? '' : 'no-title-fade',
    ]
      .filter(Boolean)
      .join(' ');

    function guardNav(e: { preventDefault: () => void }) {
      if (dragRef.current.moved || dragRef.current.dragging) {
        e.preventDefault();
        dragRef.current.moved = false;
        dragRef.current.dragging = false;
        return true;
      }
      return false;
    }

    const tiltHandlers = interactiveTilt
      ? {
          onMouseMove: (e: ReactMouseEvent<HTMLElement>) => handleTiltMove(card.id, e),
          onMouseLeave: () => handleTiltLeave(card.id),
        }
      : {};

    let hit: ReactNode;
    if (href) {
      hit = (
        <a
          className="uni-skew__hit"
          href={href}
          onClick={(e) => {
            guardNav(e);
          }}
          {...tiltHandlers}
        >
          {body}
        </a>
      );
    } else if (onSelect) {
      hit = (
        <button
          type="button"
          className="uni-skew__hit"
          onClick={(e) => {
            if (guardNav(e)) return;
            onSelect(card);
          }}
          {...tiltHandlers}
        >
          {body}
        </button>
      );
    } else {
      hit = (
        <div className="uni-skew__hit" {...tiltHandlers}>
          {body}
        </div>
      );
    }

    return (
      <div
        key={card.id}
        className={[
          'uni-skew__slot',
          isFirst ? 'is-first' : '',
          isLast ? 'is-last' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <article
          role="listitem"
          className={className}
          style={depthStyle}
          onMouseEnter={() => setActiveId(card.id)}
        >
          {hit}
        </article>
      </div>
    );
  }

  return (
    <div className={`uni-skew${interactiveTilt ? ' uni-skew--tilt' : ''}`}>
      <div
        ref={viewportRef}
        className="uni-skew__viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="uni-skew__track"
          role="list"
          onMouseLeave={() => setActiveId(null)}
        >
          {visible.map((card, index) => renderCard(card, index))}
        </div>
      </div>

      {canNext ? (
        <button
          type="button"
          className="uni-skew__arrow"
          aria-label={nextAriaLabel}
          onClick={scrollNext}
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
