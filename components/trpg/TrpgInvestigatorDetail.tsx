'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { InvestigatorPortraitImage, portraitOptions } from '@/components/trpg/TrpgInvestigatorImage';
import { DustAtmosphere } from '@/components/shared/DustAtmosphere';
import { useDocumentVisible } from '@/lib/hooks/useInViewActive';
import {
  clampFrameOffset,
  clampFrameScale,
  wheelScaleStep,
  normalizeImageFrame,
  type ImageFrame,
} from '@/lib/shared/imageFrame';
import { normalizeHex } from '@/lib/oc/characterTheme';
import type { TrpgPlayerExpressionKind, TrpgPlayerProfile } from '@/lib/types/site-content';

const CLOSE_MS = 320;
const BODY_OPEN_CLASS = 'trpg-inv-detail-open';
const FRAME_SNAP = 2.8;
const QUOTE_SNAP = 2.2;

function snapNear(value: number, target: number, threshold: number) {
  return Math.abs(value - target) <= threshold ? target : value;
}

function stageCenterPct(stage: HTMLElement): { x: number; y: number } {
  const rect = stage.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return { x: 50, y: 50 };
  const right = stage.parentElement?.querySelector('.trpg-inv-detail__right') as HTMLElement | null;
  const rightLeft = right?.getBoundingClientRect().left;
  const usableRight = rightLeft != null && rightLeft > rect.left ? rightLeft : rect.right;
  const cx = (rect.left + usableRight) / 2;
  return {
    x: Math.min(92, Math.max(8, ((cx - rect.left) / rect.width) * 100)),
    y: 50,
  };
}

type Props = {
  player: TrpgPlayerProfile;
  expressionId: string;
  onExpressionChange: (id: string) => void;
  editing: boolean;
  editable?: boolean;
  onClose: () => void;
  onStartEdit?: () => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onDelete?: () => void;
  onQuotePosChange?: (pos: { x: number; y: number }) => void;
  onImgFrameChange?: (frame: ImageFrame) => void;
  identity?: ReactNode;
  children: ReactNode;
};

export function TrpgInvestigatorDetail({
  player,
  expressionId,
  onExpressionChange,
  editing,
  editable = false,
  onClose,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onQuotePosChange,
  onImgFrameChange,
  identity,
  children,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [guideSnap, setGuideSnap] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [exprScrollFade, setExprScrollFade] = useState(1);
  const [portraitPanel, setPortraitPanel] = useState<TrpgPlayerExpressionKind>('expression');
  const [panelEnterDir, setPanelEnterDir] = useState<'next' | 'prev'>('next');
  const [panelAnim, setPanelAnim] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const portraitRef = useRef<HTMLDivElement | null>(null);
  const exprListRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const portraitDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const frameRef = useRef(normalizeImageFrame(player.stageImgFrame));
  frameRef.current = normalizeImageFrame(player.stageImgFrame);

  const expressionList = portraitOptions(player, 'expression');
  const versionList = portraitOptions(player, 'version');
  const activeList = portraitPanel === 'version' ? versionList : expressionList;
  const showPortraitPicker =
    !editing && (expressionList.length > 1 || versionList.length > 0);
  const listScrollable = activeList.length > 5;
  const quote = player.quote?.trim();
  const quoteAlign = player.quoteAlign || 'center';
  const canDragQuote = Boolean(editing && onQuotePosChange && quote);
  const stageSrc = player.stageImg || player.img;
  const canAdjustPortrait = Boolean(editing && stageSrc && onImgFrameChange);
  const showGuides = canAdjustPortrait || canDragQuote;
  const quoteX = dragPos?.x ?? player.quotePos?.x ?? 58;
  const quoteY = dragPos?.y ?? player.quotePos?.y ?? 78;
  const personalColor = normalizeHex(player.personalColor) || '';
  const stageStyle = personalColor
    ? ({ '--inv-personal': personalColor } as CSSProperties)
    : undefined;

  const docVisible = useDocumentVisible();
  const [stageInView, setStageInView] = useState(true);
  const [enterSettled, setEnterSettled] = useState(false);

  useEffect(() => {
    setEnterSettled(false);
    const t = window.setTimeout(() => setEnterSettled(true), 1500);
    return () => window.clearTimeout(t);
  }, [player.id]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setStageInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        setStageInView(entries.some((e) => e.isIntersecting && e.intersectionRatio > 0));
      },
      { root: null, rootMargin: '80px 0px', threshold: [0, 0.05, 0.2] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [player.id]);

  /* DustAtmosphere — pair/OC와 동일 게이트 (편집 중엔 유지) */
  const stageFxLive = editing || (enterSettled && stageInView && docVisible);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /* body 클래스는 Detail이 단독 소유 — Board와 레이스하면 숨김 CSS에 잠김 */
  useLayoutEffect(() => {
    document.body.classList.add(BODY_OPEN_CLASS);
    return () => {
      document.body.classList.remove(BODY_OPEN_CLASS);
    };
  }, []);

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => onCloseRef.current(), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    setClosing(false);
    setPortraitPanel('expression');
    setPanelAnim(false);
  }, [player.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, requestClose]);

  useEffect(() => {
    if (!listScrollable) {
      setExprScrollFade(0);
      return;
    }
    setExprScrollFade(1);
    let el = exprListRef.current;

    const update = () => {
      el = exprListRef.current;
      if (!el) return;
      const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
      setExprScrollFade(Math.min(1, Math.max(0, remain / 48)));
    };

    const raf = window.requestAnimationFrame(() => {
      update();
      window.requestAnimationFrame(update);
    });
    const onScroll = () => update();
    const attach = () => {
      el = exprListRef.current;
      if (!el) return;
      el.addEventListener('scroll', onScroll, { passive: true });
    };
    attach();
    window.addEventListener('resize', update);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (el) ro?.observe(el);

    return () => {
      window.cancelAnimationFrame(raf);
      exprListRef.current?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [listScrollable, activeList.length, portraitPanel, player.id]);

  useEffect(() => {
    const el = portraitRef.current;
    if (!el || !canAdjustPortrait || !onImgFrameChange) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = wheelScaleStep(e.deltaY, 0.01);
      if (!delta) return;
      const scale = clampFrameScale(frameRef.current.scale + delta);
      if (scale === frameRef.current.scale) return;
      const next = {
        ...frameRef.current,
        scale,
      };
      frameRef.current = normalizeImageFrame(next);
      onImgFrameChange(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canAdjustPortrait, onImgFrameChange, player.id]);

  function onQuotePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!canDragQuote) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const x = player.quotePos?.x ?? 58;
    const y = player.quotePos?.y ?? 78;
    dragRef.current = { ox: e.clientX, oy: e.clientY, x, y };
    dragPosRef.current = { x, y };
    setDragPos({ x, y });
  }

  function onQuotePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const center = stageCenterPct(stageRef.current);
    const dx = ((e.clientX - dragRef.current.ox) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.oy) / rect.height) * 100;
    let x = Math.min(92, Math.max(8, dragRef.current.x + dx));
    let y = Math.min(92, Math.max(8, dragRef.current.y + dy));
    const sx = snapNear(x, center.x, QUOTE_SNAP);
    const sy = snapNear(y, center.y, QUOTE_SNAP);
    setGuideSnap({ v: Math.abs(sx - center.x) < 0.01, h: Math.abs(sy - center.y) < 0.01 });
    x = Math.round(sx * 10) / 10;
    y = Math.round(sy * 10) / 10;
    dragPosRef.current = { x, y };
    setDragPos({ x, y });
  }

  function onQuotePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    const pos = dragPosRef.current;
    dragPosRef.current = null;
    setDragPos(null);
    setGuideSnap({ v: false, h: false });
    if (pos && onQuotePosChange) onQuotePosChange(pos);
  }

  function onPortraitPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!canAdjustPortrait || !onImgFrameChange) return;
    if ((e.target as HTMLElement).closest('.trpg-inv-detail__pv-quote')) return;
    if ((e.target as HTMLElement).closest('.trpg-inv-detail__portrait-tools')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const frame = frameRef.current;
    portraitDragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: frame.x,
      oy: frame.y,
    };
  }

  function onPortraitPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!portraitDragRef.current || !onImgFrameChange || !portraitRef.current) return;
    const rect = portraitRef.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dx = ((e.clientX - portraitDragRef.current.sx) / rect.width) * 100;
    const dy = ((e.clientY - portraitDragRef.current.sy) / rect.height) * 100;
    const scale = frameRef.current.scale;
    let x = clampFrameOffset(portraitDragRef.current.ox + dx, scale);
    let y = clampFrameOffset(portraitDragRef.current.oy + dy, scale);
    const sx = snapNear(x, 0, FRAME_SNAP);
    const sy = snapNear(y, 0, FRAME_SNAP);
    setGuideSnap({ v: sx === 0, h: sy === 0 });
    const next = { scale, x: sx, y: sy };
    frameRef.current = normalizeImageFrame(next);
    onImgFrameChange(next);
  }

  function onPortraitPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!portraitDragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    portraitDragRef.current = null;
    setGuideSnap({ v: false, h: false });
  }

  function centerPortrait() {
    if (!onImgFrameChange) return;
    const next = {
      scale: frameRef.current.scale,
      x: 0,
      y: 0,
    };
    frameRef.current = normalizeImageFrame(next);
    onImgFrameChange(next);
    setGuideSnap({ v: true, h: true });
    window.setTimeout(() => setGuideSnap({ v: false, h: false }), 520);
  }

  if (typeof document === 'undefined') return null;

  const quoteStyle: CSSProperties = {
    left: `${quoteX}%`,
    top: `${quoteY}%`,
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
  };

  return createPortal(
    <div
      className={`trpg-inv-detail trpg-inv-archive${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={player.name}
    >
      <div className="panel-topbar trpg-inv-detail__topbar">
        <div className="trpg-inv-detail__topbar-left">
          <button type="button" className="trpg-inv-detail__back" onClick={requestClose}>
            ← back
          </button>
          <span className="panel-topbar-title">{editing ? '수정 모드' : 'INVESTIGATOR'}</span>
        </div>
        <div className="topbar-btns">
          {editable ? (
            editing ? (
              <>
                <button type="button" className="btn primary" onClick={onSaveEdit}>
                  저장
                </button>
                <button type="button" className="btn" onClick={onCancelEdit}>
                  취소
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn primary" onClick={onStartEdit}>
                  ✏ 수정
                </button>
                <button type="button" className="btn" onClick={onDelete}>
                  삭제
                </button>
              </>
            )
          ) : null}
        </div>
      </div>

      <div className="trpg-inv-detail__body" key={player.id}>
        <div
          className={`trpg-inv-detail__stage${showGuides ? ' is-guiding' : ''}${personalColor ? ' has-personal' : ''}${!stageFxLive ? ' is-fx-paused' : ''}`}
          ref={stageRef}
          style={stageStyle}
        >
          {personalColor ? <div className="trpg-inv-detail__personal-glow" aria-hidden="true" /> : null}
          <div className="trpg-inv-detail__gradient" aria-hidden="true" />
          <DustAtmosphere fx={player.dustFx} active={stageFxLive} />
          {showGuides ? (
            <div className="trpg-inv-detail__guides" aria-hidden="true">
              <span className={`trpg-inv-detail__guide trpg-inv-detail__guide--v${guideSnap.v ? ' is-snap' : ''}`} />
              <span className={`trpg-inv-detail__guide trpg-inv-detail__guide--h${guideSnap.h ? ' is-snap' : ''}`} />
              <span className="trpg-inv-detail__guide-label">CENTER</span>
            </div>
          ) : null}
          <div
            ref={portraitRef}
            className={`trpg-inv-detail__char-slide${canAdjustPortrait ? ' is-editing-portrait' : ''}`}
            onPointerDown={onPortraitPointerDown}
            onPointerMove={onPortraitPointerMove}
            onPointerUp={onPortraitPointerUp}
            onPointerCancel={onPortraitPointerUp}
          >
            <InvestigatorPortraitImage
              player={player}
              expressionId={expressionId}
              full
              className="trpg-inv-detail__portrait animate-in"
            />
            {canAdjustPortrait ? (
              <div className="trpg-inv-detail__portrait-tools">
                <button type="button" className="trpg-inv-detail__center-btn" onClick={centerPortrait}>
                  중앙 맞추기
                </button>
                <span className="trpg-inv-detail__portrait-hint">드래그 · 휠 · 중앙선에 붙으면 스냅</span>
              </div>
            ) : null}
          </div>
          {quote ? (
            <div
              className={`trpg-inv-detail__pv-quote is-align-${quoteAlign}${canDragQuote ? ' is-draggable' : ''}${editing ? ' is-editing' : ''}`}
              style={quoteStyle}
              aria-live="polite"
              onPointerDown={onQuotePointerDown}
              onPointerMove={onQuotePointerMove}
              onPointerUp={onQuotePointerUp}
              onPointerCancel={onQuotePointerUp}
              title={canDragQuote ? '드래그해서 위치 조절' : undefined}
            >
              <p className={`trpg-inv-detail__pv-quote-box${editing ? ' is-revealed' : ' is-sweeping'}`}>
                <span className="trpg-inv-detail__pv-quote-blur" aria-hidden="true">
                  “{quote}”
                </span>
                <span className="trpg-inv-detail__pv-quote-text">
                  <span className="trpg-inv-detail__pv-quote-inner">“{quote}”</span>
                  {!editing ? <span className="trpg-inv-detail__pv-quote-shine" aria-hidden="true" /> : null}
                </span>
              </p>
              {canDragQuote ? <span className="trpg-inv-detail__pv-quote-hint">드래그로 이동</span> : null}
            </div>
          ) : null}
          {showPortraitPicker ? (
            <div
              className={`trpg-inv-detail__expr-wrap${listScrollable ? ' is-scrollable' : ''}${exprScrollFade > 0.02 ? ' has-more' : ''}`}
            >
              <div className={`trpg-inv-detail__expr-nav is-${portraitPanel}`}>
                <div className="trpg-inv-detail__expr-nav-core">
                  <span className="trpg-inv-detail__expr-nav-label">
                    {portraitPanel === 'version' ? 'VERSION' : 'EXPRESSION'}
                  </span>
                  {portraitPanel === 'version' ? (
                    <button
                      type="button"
                      className="trpg-inv-detail__expr-nav-btn is-prev"
                      onClick={() => {
                        setPanelEnterDir('prev');
                        setPanelAnim(true);
                        setPortraitPanel('expression');
                      }}
                      aria-label="표정 목록"
                      title="표정"
                    >
                      ‹
                    </button>
                  ) : null}
                  {portraitPanel === 'expression' && versionList.length > 0 ? (
                    <button
                      type="button"
                      className="trpg-inv-detail__expr-nav-btn is-next"
                      onClick={() => {
                        setPanelEnterDir('next');
                        setPanelAnim(true);
                        setPortraitPanel('version');
                      }}
                      aria-label="버전 목록"
                      title="버전"
                    >
                      ›
                    </button>
                  ) : null}
                </div>
              </div>
              <div
                className={`trpg-inv-detail__expr-viewport${listScrollable ? ' is-scrollable' : ''}`}
                style={
                  listScrollable
                    ? ({ '--expr-fade': String(exprScrollFade) } as CSSProperties)
                    : undefined
                }
              >
                <div
                  key={portraitPanel}
                  ref={exprListRef}
                  className={`trpg-inv-detail__expr${listScrollable ? ' is-scrollable' : ''}${panelAnim ? ` is-enter-${panelEnterDir}` : ''}`}
                  role="tablist"
                  aria-label={portraitPanel === 'version' ? '버전 선택' : '표정 선택'}
                >
                  {activeList.length ? (
                    activeList.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="tab"
                        aria-selected={expressionId === opt.id}
                        className={`trpg-inv-detail__expr-chip${expressionId === opt.id ? ' is-active' : ''}`}
                        onClick={() => onExpressionChange(opt.id)}
                        title={opt.label}
                      >
                        {opt.img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={opt.img} alt="" />
                        ) : (
                          <span>{opt.label[0]}</span>
                        )}
                        <em>{opt.label}</em>
                      </button>
                    ))
                  ) : (
                    <p className="trpg-inv-detail__expr-empty">등록된 버전이 없습니다</p>
                  )}
                </div>
              </div>
              {listScrollable ? (
                <span
                  className="trpg-inv-detail__expr-more"
                  style={{ opacity: exprScrollFade }}
                  aria-hidden="true"
                >
                  ▾
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="trpg-inv-detail__right">
          <button
            type="button"
            className="trpg-inv-detail__panel-close"
            onClick={requestClose}
            aria-label="닫기"
          >
            ✕
          </button>
          <div className="trpg-inv-detail__right-scroll panel-scroll lh-scroll">
            {identity}
            {children}
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
