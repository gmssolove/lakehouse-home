'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { OcEditForm } from '@/components/admin/OcEditForm';
import { OcAuPicker } from '@/components/oc/OcAuPicker';
import { OcVnDialogue, useVnDialogue } from '@/components/oc/OcVnDialogue';
import { applyCharacterTheme, clearCharacterTheme, resolveCharacterTheme } from '@/lib/oc/characterTheme';
import { gallerySrc, normalizeGalleryItem } from '@/lib/oc/gallery';
import { displayCategory, isTrpgCategory } from '@/lib/oc/categories';
import { buildDetailProfileRows, formatCardTag, formatStatDigits } from '@/lib/oc/profile';
import type { GalleryItem, OcCharacter, StoryLog, CharacterRelation } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';

type Props = {
  character: OcCharacter;
  charNo: number;
  auIdx: number;
  isAdmin: boolean;
  categories: string[];
  img: { src: string; fit: string; pos: string } | null;
  onBack: () => void;
  onBindBack?: (handler: (() => void) | null) => void;
  onAuChange: (au: number) => void;
  onSave?: (next: OcCharacter) => void | Promise<void>;
};

function isKeywordField(k: string) {
  return /^(키워드|keywords?)$/i.test(k.trim());
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
  return (
    <div className="oc-stat-row">
      <span className="oc-stat-label">{label}</span>
      <span className="oc-stat-value-box">{formatStatDigits(value)}</span>
    </div>
  );
}

type LeftSection = { id: string; label: string; content: ReactNode; layout?: 'gallery' | 'text' | 'compact' };

const PANEL_ANIM_MS = 920;
const CHAR_IMG_OUT_MS = 300;

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
  const { playCharacterTheme, playing } = useBgm();
  const bgmApi = useRef({ playCharacterTheme, playing });
  bgmApi.current = { playCharacterTheme, playing };

  const [editOpen, setEditOpen] = useState(false);
  const editPanelBodyRef = useRef<HTMLDivElement>(null);

  const [openLeft, setOpenLeft] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [shownPortrait, setShownPortrait] = useState<ShownPortrait | null>(null);
  const [charAnim, setCharAnim] = useState<'in' | 'out'>('in');
  const [galleryLightbox, setGalleryLightbox] = useState<GalleryItem | null>(null);
  const wasPlayingRef = useRef(false);
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portraitRef = useRef<ShownPortrait>({ src: '', fit: 'contain', pos: 'center top' });
  const vn = useVnDialogue(character);
  const { profileRows, keywordTags } = useMemo(() => splitProfileRows(character), [character]);
  const personalTheme = useMemo(() => resolveCharacterTheme(character), [character]);

  useEffect(() => {
    const el = document.getElementById('detail-screen');
    if (!el) return;
    applyCharacterTheme(el, character);
    return () => clearCharacterTheme(el);
  }, [character]);

  const portraitTarget = useMemo(
    () => ({
      src: vn.expression || img?.src || '',
      fit: img?.fit || 'contain',
      pos: img?.pos || 'center top',
    }),
    [img?.fit, img?.pos, img?.src, vn.expression],
  );
  const displayImgSrc = shownPortrait?.src || portraitTarget.src;

  useEffect(() => {
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    setOpenLeft(null);
    setPanelId(null);
    setPanelMounted(false);
    setPanelClosing(false);
    setGalleryLightbox(null);
    setShownPortrait(null);
    setCharAnim('in');
    portraitRef.current = { src: '', fit: 'contain', pos: 'center top' };
    vn.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- character switch only
  }, [character.id]);

  useEffect(() => {
    const target = portraitTarget;
    if (!target.src) {
      setShownPortrait(null);
      portraitRef.current = { src: '', fit: 'contain', pos: 'center top' };
      return;
    }

    const prev = portraitRef.current;
    if (!prev.src) {
      portraitRef.current = target;
      setShownPortrait(target);
      setCharAnim('in');
      return;
    }

    if (prev.src === target.src && prev.fit === target.fit && prev.pos === target.pos) {
      return;
    }

    if (vn.active) {
      portraitRef.current = target;
      setShownPortrait(target);
      setCharAnim('in');
      return;
    }

    setCharAnim('out');
    const swapTimer = window.setTimeout(() => {
      portraitRef.current = target;
      setShownPortrait(target);
      setCharAnim('in');
    }, CHAR_IMG_OUT_MS);

    return () => window.clearTimeout(swapTimer);
  }, [portraitTarget, vn.active]);

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
    const th = character.theme;
    const themeId = th?.fileData || th?.youtubeId;
    if (!themeId) return;

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
                <div className="oc-acc-log-body">{log.body}</div>
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
                {rel.note && <p className="oc-acc-rel-note">{rel.note}</p>}
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
        content: <p className="oc-acc-text">{character.desc}</p>,
      });
    }

    if (character.appearance) {
      sections.push({
        id: 'appearance',
        label: '외관',
        content: <p className="oc-acc-text">{character.appearance}</p>,
      });
    }

    if (character.special) {
      sections.push({
        id: 'special',
        label: '특이사항',
        content: <p className="oc-acc-text">{character.special}</p>,
      });
    }

    if (character.hobby || character.likes?.length || character.hates?.length) {
      sections.push({
        id: 'etc',
        label: '기타',
        content: (
          <div className="oc-acc-etc">
            {character.hobby && (
              <p>
                <em>Hobby</em> {character.hobby}
              </p>
            )}
            {character.likes?.length ? (
              <p>
                <em>Likes</em> {character.likes.join(', ')}
              </p>
            ) : null}
            {character.hates?.length ? (
              <p>
                <em>Hates</em> {character.hates.join(', ')}
              </p>
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
                {n.preview && <p className="oc-acc-text">{n.preview}</p>}
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

      <div className={`game-body oc-detail-body${openLeft ? ' has-left-open' : ''}`}>
        <div className="game-left" id="game-left">
          <div className="game-char-gradient" />
          <div className={`oc-char-slide${openLeft ? ' shifted' : ''}`}>
            {displayImgSrc ? (
              <img
                id="game-char-img"
                key={`${character.id}-${displayImgSrc}-${shownPortrait?.fit}-${shownPortrait?.pos}`}
                className={`game-char-img animate-${charAnim}`}
                src={displayImgSrc}
                alt=""
                style={{
                  objectFit: (shownPortrait?.fit || portraitTarget.fit) as React.CSSProperties['objectFit'],
                  objectPosition: shownPortrait?.pos || portraitTarget.pos,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!vn.active) vn.open();
                }}
              />
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
            className={`oc-left-panel-shell${panelClosing ? ' is-closing' : ' is-open'}${panelSection.layout ? ` oc-left-panel-shell--${panelSection.layout}` : ' oc-left-panel-shell--text'}`}
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

        <div className="oc-detail-right">
          <div className="oc-detail-right-scroll">
          <header className="oc-identity">
            <div className="oc-identity-no">
              <span className="oc-identity-no-label">No.</span>
              <span className="oc-identity-no-num">{charNo}</span>
            </div>
            <h1 className="oc-identity-name">{character.name}</h1>
            {character.nameSub && <div className="oc-identity-sub">{character.nameSub}</div>}
          </header>

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
                <span className="oc-attr-head-ko">기본 정보</span>
                <span className="oc-attr-head-en">Profile</span>
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
                <span className="oc-attr-head-ko">스테이터스</span>
                <span className="oc-attr-head-en">Attribute</span>
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
              <p className="oc-gallery-lightbox-credit">{galleryLightbox.credit.trim()}</p>
            ) : null}
          </div>
        </div>
      )}

      {editOpen && isAdmin && onSave && (
        <div className="oc-edit-panel" role="dialog" aria-label="캐릭터 수정">
          <div className="oc-edit-panel-header">
            <span style={{ fontSize: 12, color: 'var(--lake-copper-soft)' }}>캐릭터 수정</span>
            <button type="button" className="ep-close" onClick={() => setEditOpen(false)} aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="oc-edit-panel-body" ref={editPanelBodyRef}>
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
          </div>
          <button
            type="button"
            className="oc-edit-scroll-top"
            aria-label="맨 위로 — 저장"
            onClick={() => editPanelBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            ↑ 저장
          </button>
        </div>
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
