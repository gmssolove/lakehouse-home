'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { OcEditForm } from '@/components/admin/OcEditForm';
import { LakeEditModal } from '@/components/ui/LakeEditModal';
import { OcAuPicker } from '@/components/oc/OcAuPicker';
import { OcVnDialogue, useVnDialogue } from '@/components/oc/OcVnDialogue';
import { applyCharacterTheme, characterHasBgmTheme, clearCharacterTheme, resolveCharacterTheme } from '@/lib/oc/characterTheme';
import { formatGalleryCredit, gallerySrc, normalizeGalleryItem } from '@/lib/oc/gallery';
import { displayCategory, isTrpgCategory } from '@/lib/oc/categories';
import { buildDetailProfileRows, formatCardTag, formatStatDigits, parseStatPercent } from '@/lib/oc/profile';
import { OcRichText } from '@/lib/oc/richText';
import { lakeNavigate } from '@/lib/lake/routeTransition';
import { setTrpgReturnPath } from '@/lib/lake/trpgReturn';
import { framedImageStyle } from '@/lib/shared/imageFrame';
import type { GalleryItem, ImageFrame, OcCharacter, StoryLog, CharacterRelation } from '@/lib/types/character';
import { newId, type TrpgScenario } from '@/lib/types/site-content';

type Props = {
  character: OcCharacter;
  charNo: number;
  auIdx: number;
  isAdmin: boolean;
  categories: string[];
  img: { src: string; fit: string; pos: string; frame?: ImageFrame } | null;
  onBack: () => void;
  onBindBack?: (handler: (() => void) | null) => void;
  onAuChange: (au: number) => void;
  onSave?: (next: OcCharacter) => void | Promise<void>;
};

function isKeywordField(k: string) {
  return /^(키워드|keywords?)$/i.test(k.trim());
}

function findRelatedTrpgScenarios(scenarios: TrpgScenario[], ocId: string | number): TrpgScenario[] {
  const id = String(ocId);
  return scenarios.filter((s) => {
    if ((s.characterIds ?? []).some((cid) => String(cid) === id)) return true;
    if ((s.playerProfiles ?? []).some((p) => String(p.ocId || '') === id)) return true;
    return false;
  });
}

function parseKeywordTags(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (!value?.trim()) return [];
  return value
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitProfileRows(character: OcCharacter) {
  const raw = buildDetailProfileRows(character);
  const kwRow = (character.profile ?? []).find((p) => isKeywordField(p.k));
  const keywordTags = kwRow ? parseKeywordTags(kwRow.v) : parseKeywordTags(character.keywords);
  const profileRows = raw;
  return { profileRows, keywordTags };
}

function StatBar({ label, value }: { label: string; value: string }) {
  const pct = parseStatPercent(value);
  const display = formatStatDigits(value);
  return (
    <div className="oc-stat-row">
      <span className="oc-stat-label">{label}</span>
      <div className="oc-stat-track" aria-hidden="true">
        <span className="oc-stat-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="oc-stat-num">{display}</span>
    </div>
  );
}

type LeftSection = { id: string; label: string; content: ReactNode; layout?: 'gallery' | 'text' | 'compact' };

const PANEL_ANIM_MS = 920;
type ShownPortrait = {
  src: string;
  fit: string;
  pos: string;
};

export function OcCharacterDetail({
  character,
  charNo,
  auIdx,
  isAdmin,
  categories,
  img,
  onBack,
  onBindBack,
  onAuChange,
  onSave,
}: Props) {
  const router = useRouter();
  const { trpg } = useSiteContent();
  const { playCharacterTheme, playing } = useBgm();
  const bgmApi = useRef({ playCharacterTheme, playing });
  bgmApi.current = { playCharacterTheme, playing };

  const [editOpen, setEditOpen] = useState(false);

  const [openLeft, setOpenLeft] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [shownPortrait, setShownPortrait] = useState<ShownPortrait | null>(null);
  const [charBounce, setCharBounce] = useState(false);
  const [charMotion, setCharMotion] = useState<'bounce' | 'shake' | null>(null);
  const motionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [galleryLightbox, setGalleryLightbox] = useState<GalleryItem | null>(null);
  const wasPlayingRef = useRef(false);
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const portraitRef = useRef<ShownPortrait>({ src: '', fit: 'contain', pos: 'center top' });
  const exprPortraitRef = useRef<{ front: 0 | 1; layers: [string, string] }>({
    front: 0,
    layers: ['', ''],
  });
  const [exprPortrait, setExprPortrait] = useState(exprPortraitRef.current);
  const exprSwapGenRef = useRef(0);
  const prevVnActiveRef = useRef(false);
  const vn = useVnDialogue(character);
  const { profileRows, keywordTags } = useMemo(() => splitProfileRows(character), [character]);
  const personalTheme = useMemo(() => resolveCharacterTheme(character), [character]);

  useEffect(() => {
    setCharBounce(false);
    setCharMotion(null);
  }, [character.id]);

  const playCharMotion = useCallback((motion: 'bounce' | 'shake' | null) => {
    if (motionClearRef.current) clearTimeout(motionClearRef.current);
    if (!motion) {
      setCharMotion(null);
      return;
    }
    setCharMotion(null);
    window.requestAnimationFrame(() => {
      setCharMotion(motion);
      motionClearRef.current = setTimeout(() => setCharMotion(null), motion === 'shake' ? 520 : 280);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (motionClearRef.current) clearTimeout(motionClearRef.current);
    };
  }, []);

  useEffect(() => {
    const el = document.getElementById('detail-screen');
    if (!el) return;
    applyCharacterTheme(el, character);
    const panel = el.querySelector('.oc-detail-right');
    panel?.classList.add('is-ready');
    return () => clearCharacterTheme(el);
  }, [character]);

  const portraitTarget = useMemo(
    () => ({
      src: vn.expression || img?.src || '',
      fit: img?.fit || 'contain',
      pos: img?.pos || 'center top',
      frame: img?.frame,
    }),
    [img?.fit, img?.frame, img?.pos, img?.src, vn.expression],
  );
  const displayImgSrc = shownPortrait?.src || portraitTarget.src;

  const portraitImgStyle = useCallback(
    (fit: string, pos: string, frame?: ImageFrame): CSSProperties =>
      framedImageStyle(frame, { fit, pos }),
    [],
  );

  useEffect(() => {
    if (vn.active && !prevVnActiveRef.current && portraitTarget.src) {
      const init = { front: 0 as const, layers: [portraitTarget.src, portraitTarget.src] as [string, string] };
      exprPortraitRef.current = init;
      setExprPortrait(init);
      exprSwapGenRef.current += 1;
    }
    prevVnActiveRef.current = vn.active;
  }, [vn.active, portraitTarget.src]);

  useEffect(() => {
    if (!vn.active || !portraitTarget.src) return;

    const nextSrc = portraitTarget.src;
    const current = exprPortraitRef.current;
    if (current.layers[current.front] === nextSrc) return;

    const back = (current.front ^ 1) as 0 | 1;
    const gen = ++exprSwapGenRef.current;

    const applySwap = () => {
      if (gen !== exprSwapGenRef.current) return;
      const live = exprPortraitRef.current;
      const layers: [string, string] = [...live.layers];
      layers[back] = nextSrc;
      const next = { front: back, layers };
      exprPortraitRef.current = next;
      setExprPortrait(next);
    };

    if (current.layers[back] === nextSrc) {
      const next = { front: back, layers: current.layers };
      exprPortraitRef.current = next;
      setExprPortrait(next);
      return;
    }

    const pre = new Image();
    pre.src = nextSrc;
    const finish = () => {
      void pre.decode?.().then(applySwap).catch(applySwap);
    };
    if (pre.complete) finish();
    else pre.onload = finish;
  }, [vn.active, portraitTarget.src]);

  useEffect(() => {
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    setOpenLeft(null);
    setPanelId(null);
    setPanelMounted(false);
    setPanelClosing(false);
    setGalleryLightbox(null);
    setShownPortrait(null);
    portraitRef.current = { src: '', fit: 'contain', pos: 'center top' };
    vn.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- character switch only
  }, [character.id]);

  useEffect(() => {
    const urls = new Set<string>();
    if (img?.src) urls.add(img.src);
    for (const node of character.dialogue ?? []) {
      if (node.expression?.trim()) urls.add(node.expression.trim());
    }
    for (const line of character.vnLines ?? []) {
      const expr = (line as { expression?: string }).expression;
      if (expr?.trim()) urls.add(expr.trim());
    }
    urls.forEach((url) => {
      const pre = new Image();
      pre.decoding = 'async';
      pre.src = url;
    });
  }, [character.id, character.dialogue, character.vnLines, img?.src]);

  useEffect(() => {
    const target = portraitTarget;
    if (!target.src) {
      setShownPortrait(null);
      portraitRef.current = { src: '', fit: 'contain', pos: 'center top' };
      return;
    }

    const prev = portraitRef.current;
    if (prev.src === target.src && prev.fit === target.fit && prev.pos === target.pos) {
      return;
    }

    portraitRef.current = target;
    setShownPortrait(target);
  }, [portraitTarget]);

  useEffect(() => () => {
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
  }, []);

  useEffect(() => {
    if (!galleryLightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setGalleryLightbox(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [galleryLightbox]);

  useEffect(() => {
    if (!characterHasBgmTheme(character)) return;

    const th = character.theme;
    wasPlayingRef.current = bgmApi.current.playing;
    bgmApi.current.playCharacterTheme(
      {
        fileData: th?.fileData,
        youtubeId: th?.youtubeId,
        title: th?.title || `${character.name} Theme`,
        artist: th?.artist || '',
      },
      bgmApi.current.playing,
    );
  }, [
    character.id,
    character.name,
    character.theme?.fileData,
    character.theme?.youtubeId,
    character.theme?.title,
    character.theme?.artist,
  ]);

  const storyLogs: StoryLog[] = character.storyLogs?.length
    ? character.storyLogs
    : character.story
      ? [{ id: 'main', title: '서사', body: character.story }]
      : [];

  const relationships: CharacterRelation[] = character.relationships || [];
  const starCount = character.stars ?? 5;
  const showStats = isTrpgCategory(character.category) && !!character.stats?.length;
  const relatedTrpg = useMemo(
    () => (isTrpgCategory(character.category) ? findRelatedTrpgScenarios(trpg, character.id) : []),
    [character.category, character.id, trpg],
  );

  useEffect(() => {
    const panel = rightPanelRef.current;
    const scroll = rightScrollRef.current;
    if (!panel || !scroll) return;

    const syncRightBalance = () => {
      const avail = panel.clientHeight;
      if (avail <= 0) return;
      const content = scroll.scrollHeight;
      const ratio = content / avail;
      let shift = 0;
      if (ratio > 1.02) {
        shift = -Math.min(52, (ratio - 1) * 60);
      } else if (ratio < 0.72) {
        shift = Math.min(36, (0.72 - ratio) * 70);
      } else {
        shift = -Math.min(22, (ratio - 0.72) * 48);
      }
      panel.style.setProperty('--oc-right-shift', `${Math.round(shift)}px`);
      panel.classList.toggle('is-dense', ratio > 0.9);
    };

    const id = window.requestAnimationFrame(syncRightBalance);
    const ro = new ResizeObserver(syncRightBalance);
    ro.observe(panel);
    ro.observe(scroll);
    window.addEventListener('resize', syncRightBalance);
    return () => {
      window.cancelAnimationFrame(id);
      ro.disconnect();
      window.removeEventListener('resize', syncRightBalance);
    };
  }, [character.id, relatedTrpg.length, profileRows.length, keywordTags.length, showStats]);

  const dismissLeftPanel = useCallback(() => {
    if (!openLeft && !panelMounted) return;
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    setPanelClosing(true);
    setOpenLeft(null);
    panelTimerRef.current = setTimeout(() => {
      setPanelMounted(false);
      setPanelClosing(false);
      setPanelId(null);
    }, PANEL_ANIM_MS);
  }, [openLeft, panelMounted]);

  const handleBack = useCallback(() => {
    if (editOpen) {
      setEditOpen(false);
      return;
    }
    if (galleryLightbox) {
      setGalleryLightbox(null);
      return;
    }
    if (panelMounted || openLeft) {
      dismissLeftPanel();
      return;
    }
    onBack();
  }, [dismissLeftPanel, editOpen, galleryLightbox, onBack, openLeft, panelMounted]);

  useEffect(() => {
    onBindBack?.(handleBack);
    return () => onBindBack?.(null);
  }, [handleBack, onBindBack]);

  const leftPanelOpen = panelMounted || !!openLeft;
  useLakeBackNavigation(leftPanelOpen, dismissLeftPanel, 'oc-detail-panel');
  useLakeBackNavigation(!!galleryLightbox, () => setGalleryLightbox(null), 'oc-detail-gallery');
  useLakeBackNavigation(editOpen, () => setEditOpen(false), 'oc-detail-edit');

  function toggleLeft(id: string) {
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    if (openLeft === id) {
      setPanelClosing(true);
      setOpenLeft(null);
      panelTimerRef.current = setTimeout(() => {
        setPanelMounted(false);
        setPanelClosing(false);
        setPanelId(null);
      }, PANEL_ANIM_MS);
      return;
    }
    setPanelClosing(false);
    setOpenLeft(id);
    setPanelId(id);
    setPanelMounted(true);
  }

  const leftSections = useMemo<LeftSection[]>(() => {
    const sections: LeftSection[] = [];

    if (character.gallery?.length) {
      sections.push({
        id: 'gallery',
        label: '갤러리',
        layout: 'gallery',
        content: (
          <div className="oc-acc-gallery">
            {character.gallery.map((g, i) => {
              const item = normalizeGalleryItem(g);
              return (
              <button
                key={i}
                type="button"
                className="oc-acc-gallery-item"
                onClick={() => setGalleryLightbox(item)}
              >
                <img src={gallerySrc(item)} alt="" />
              </button>
            );
            })}
          </div>
        ),
      });
    }

    if (storyLogs.length) {
      sections.push({
        id: 'story',
        label: '서사 로그',
        content: (
          <div className="oc-acc-story">
            {storyLogs.map((log) => (
              <div key={log.id} className="oc-acc-log">
                <div className="oc-acc-log-title">{log.title}</div>
                {log.date && <div className="oc-acc-log-date">{log.date}</div>}
                <OcRichText text={log.body} className="oc-acc-log-body" />
              </div>
            ))}
          </div>
        ),
      });
    }

    if (relationships.length) {
      sections.push({
        id: 'relations',
        label: '관계',
        layout: 'compact',
        content: (
          <div className="oc-acc-relations">
            {relationships.map((rel) => (
              <div key={rel.id} className="oc-acc-rel">
                <span className="oc-acc-rel-name">{rel.name}</span>
                <span className="oc-acc-rel-type">{rel.relation}</span>
                {rel.note ? <OcRichText text={rel.note} className="oc-acc-rel-note" /> : null}
              </div>
            ))}
          </div>
        ),
      });
    }

    if (character.desc) {
      sections.push({
        id: 'intro',
        label: '소개',
        content: <OcRichText text={character.desc} className="oc-acc-text" />,
      });
    }

    if (character.appearance) {
      sections.push({
        id: 'appearance',
        label: '외관',
        content: <OcRichText text={character.appearance} className="oc-acc-text" />,
      });
    }

    if (character.special) {
      sections.push({
        id: 'special',
        label: '특이사항',
        content: <OcRichText text={character.special} className="oc-acc-text" />,
      });
    }

    if (character.hobby || character.likes?.length || character.hates?.length) {
      sections.push({
        id: 'etc',
        label: '기타',
        content: (
          <div className="oc-acc-etc">
            {character.hobby && (
              <div className="oc-acc-etc-row">
                <em>Hobby</em>
                <OcRichText text={character.hobby} className="oc-acc-etc-value" />
              </div>
            )}
            {character.likes?.length ? (
              <div className="oc-acc-etc-row">
                <em>Likes</em>
                <OcRichText text={character.likes.join(', ')} className="oc-acc-etc-value" />
              </div>
            ) : null}
            {character.hates?.length ? (
              <div className="oc-acc-etc-row">
                <em>Hates</em>
                <OcRichText text={character.hates.join(', ')} className="oc-acc-etc-value" />
              </div>
            ) : null}
          </div>
        ),
      });
    }

    if (character.novel?.length) {
      sections.push({
        id: 'novel',
        label: 'Novel',
        content: (
          <div className="oc-acc-novel">
            {character.novel.map((n, i) => (
              <div key={i} className="oc-acc-novel-item">
                {n.title && <div className="oc-acc-log-title">{n.title}</div>}
                {n.preview ? <OcRichText text={n.preview} className="oc-acc-text" /> : null}
              </div>
            ))}
          </div>
        ),
      });
    }

    return sections;
  }, [character, relationships, storyLogs]);

  const panelSection = panelId ? leftSections.find((s) => s.id === panelId) : null;

  return (
    <>
      <div className="game-topbar">
        <button type="button" className="game-back" onClick={handleBack}>
          ← 목록으로
        </button>
        <div className="game-topbar-title">
          {displayCategory(character.category || '') || '—'}
          {formatCardTag(character.tag) ? ` · ${formatCardTag(character.tag)}` : ''}
        </div>
        {isAdmin && onSave && (
          <button type="button" className="btn-edit" style={{ marginLeft: 'auto' }} onClick={() => setEditOpen(true)}>
            ✎ 수정
          </button>
        )}
      </div>

      <div className={`game-body oc-detail-body${openLeft ? ' has-left-open' : ''}${vn.active ? ' vn-active' : ''}`}>
        <div className="game-left" id="game-left">
          <div className="game-char-gradient" />
          <div
            className={`oc-char-slide${openLeft ? ' shifted' : ''}${
              charBounce || charMotion === 'bounce'
                ? ' oc-char-bounce-once'
                : charMotion === 'shake'
                  ? ' oc-char-shake-once'
                  : ''
            }`}
          >
            {displayImgSrc ? (
              vn.active ? (
                <div className="oc-char-portrait-stack">
                  {([0, 1] as const).map((layer) => (
                    <img
                      key={layer}
                      id={layer === 0 ? 'game-char-img' : undefined}
                      className={`game-char-img oc-char-portrait-layer${exprPortrait.front === layer ? ' is-front' : ' is-back'}`}
                      src={exprPortrait.layers[layer] || portraitTarget.src}
                      alt=""
                      decoding="sync"
                      style={portraitImgStyle(portraitTarget.fit, portraitTarget.pos, portraitTarget.frame)}
                    />
                  ))}
                </div>
              ) : (
                <img
                  id="game-char-img"
                  className="game-char-img"
                  src={displayImgSrc}
                  alt=""
                  decoding="async"
                  style={portraitImgStyle(
                    shownPortrait?.fit || portraitTarget.fit,
                    shownPortrait?.pos || portraitTarget.pos,
                    img?.frame,
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (vn.active) return;
                    setCharBounce(true);
                    vn.open();
                    window.setTimeout(() => setCharBounce(false), 260);
                  }}
                />
              )
            ) : (
              <div className="game-char-placeholder" id="game-placeholder">
                {character.name?.[0] || '?'}
              </div>
            )}
          </div>
        </div>

        {leftSections.length > 0 && (
          <nav className="oc-detail-left" aria-label="추가 정보">
            {leftSections.map((sec) => {
              const open = openLeft === sec.id;
              return (
                <div key={sec.id} className={`oc-left-acc${open ? ' open' : ''}`}>
                  <button
                    type="button"
                    className="oc-left-acc-head"
                    aria-expanded={open}
                    onClick={() => toggleLeft(sec.id)}
                  >
                    <span className="oc-left-acc-bar" aria-hidden="true" />
                    <span className="oc-left-acc-label">{sec.label}</span>
                  </button>
                </div>
              );
            })}
          </nav>
        )}

        {panelMounted && panelSection && (
          <div
            className={`oc-left-panel-shell${panelClosing ? ' is-closing' : ' is-open'}${
              panelSection.layout ? ` oc-left-panel-shell--${panelSection.layout}` : ' oc-left-panel-shell--text'
            }`}
            role="region"
            aria-label={panelSection.label}
            aria-hidden={panelClosing}
          >
            <div className="oc-left-content-panel">
              <div className="oc-left-content-inner" key={panelId}>
                <h3 className="oc-left-content-title">{panelSection.label}</h3>
                <div className="oc-left-content-body">{panelSection.content}</div>
              </div>
            </div>
          </div>
        )}

        <div className="oc-detail-right" ref={rightPanelRef}>
          <div className="oc-detail-right-scroll" ref={rightScrollRef}>
          <header className="oc-identity">
            <div className="oc-identity-no">
              <span className="oc-identity-no-label">No.</span>
              <span className="oc-identity-no-num">{charNo}</span>
            </div>
            {character.nameSub && <div className="oc-identity-sub">{character.nameSub}</div>}
            <div className="oc-identity-name-block">
              <h1 className="oc-identity-name">{character.name}</h1>
              <div className="oc-identity-accent-line" aria-hidden="true" />
            </div>
          </header>

          {relatedTrpg.length > 0 && (
            <section className="oc-trpg-links" aria-label="Related scenario">
              <div className="oc-trpg-link-list">
                {relatedTrpg.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="oc-trpg-link-btn"
                    onClick={() => {
                      setTrpgReturnPath(
                        `/oc?c=${encodeURIComponent(String(character.id))}&view=detail&from=trpg`,
                      );
                      lakeNavigate(router, `/trpg/${encodeURIComponent(s.id)}`, '/oc');
                    }}
                  >
                    <span className="oc-trpg-link-kicker">Related scenario</span>
                    <span className="oc-trpg-link-title">{s.title || s.id}</span>
                    {s.subtitle ? <span className="oc-trpg-link-sub">{s.subtitle}</span> : null}
                    <span className="oc-trpg-link-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="oc-identity-meta">
            <div className="oc-identity-stars" aria-label={`${starCount} stars`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < starCount ? 'on' : 'off'}>
                  ★
                </span>
              ))}
            </div>
            <div className="oc-identity-personal-color" aria-label="퍼스널 컬러">
              <span
                className="oc-identity-personal-swatch"
                style={{ backgroundColor: personalTheme.personalColor }}
              />
              <span className="oc-identity-personal-hex">{personalTheme.personalColor.toUpperCase()}</span>
            </div>
          </div>

          <section className="oc-attr-panel oc-basic-info">
            <div className="oc-basic-info-block">
              <header className="oc-attr-head">
                <span className="oc-attr-head-en">PROFILE</span>
                <span className="oc-attr-head-ko">기본 정보</span>
              </header>
              <div className="oc-basic-info-fields">
                <div className="oc-attr-grid">
                  {profileRows.map((p) => (
                    <div key={p.k} className="oc-attr-cell oc-attr-row">
                      <div className="oc-attr-row-body oc-attr-inline">
                        <span className="oc-attr-label">{p.k}</span>
                        <span className="oc-attr-value">{p.v}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {keywordTags.length > 0 && (
                <div className="oc-attr-keywords-block">
                  <div className="oc-attr-keywords-stack">
                    <span className="oc-attr-label">키워드</span>
                    <div className="oc-keyword-chips">
                      {keywordTags.map((tag, i) => (
                        <span key={`${tag}-${i}`} className="oc-keyword-chip">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {showStats && character.stats && (
            <section className="oc-attr-panel oc-stat-section">
              <header className="oc-attr-head">
                <span className="oc-attr-head-en">ATTRIBUTE</span>
                <span className="oc-attr-head-ko">스테이터스</span>
              </header>
              <div className="oc-attr-grid oc-attr-grid-stats">
                {character.stats.map((s) => (
                  <StatBar key={s.k} label={s.k} value={s.v} />
                ))}
              </div>
            </section>
          )}
          </div>
        </div>

        <OcAuPicker character={character} auIdx={auIdx} onAuChange={onAuChange} />

        <OcVnDialogue
          character={character}
          active={vn.active}
          onClose={vn.close}
          onExpression={vn.setExpression}
          onMotion={playCharMotion}
        />
      </div>

      {galleryLightbox && (
        <div
          className="oc-gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="갤러리 이미지"
          onClick={() => setGalleryLightbox(null)}
        >
          <button
            type="button"
            className="oc-gallery-lightbox-close"
            aria-label="닫기"
            onClick={() => setGalleryLightbox(null)}
          >
            ✕
          </button>
          <div className="oc-gallery-lightbox-stage" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={galleryLightbox.src} alt="" />
            {galleryLightbox.credit?.trim() ? (
              <p className="oc-gallery-lightbox-credit">{formatGalleryCredit(galleryLightbox.credit)}</p>
            ) : null}
          </div>
        </div>
      )}

      {editOpen && isAdmin && onSave && (
        <LakeEditModal
          open={editOpen}
          className="lake-edit-modal--oc"
          title="캐릭터 수정"
          eyebrow="ADMIN · OC"
          onClose={() => setEditOpen(false)}
        >
          <OcEditForm
            key={character.id}
            character={character}
            categories={categories}
            compact
            onSave={async (next) => {
              await onSave(next);
              setEditOpen(false);
            }}
          />
        </LakeEditModal>
      )}
    </>
  );
}

export function emptyStoryLog(): StoryLog {
  return { id: newId(), title: '새 로그', body: '' };
}

export function emptyRelation(): CharacterRelation {
  return { id: newId(), name: '', relation: '' };
}
