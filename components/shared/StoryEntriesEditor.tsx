'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clampBgEffectOpacity,
  createChapter,
  createStoryEntry,
  mergeStoryCategories,
  moveEntry,
  resolveStoryCategoryColor,
  storyCategoryTagStyle,
} from '@/lib/oc/storyEntries';
import { GalleryCreditInput } from '@/components/ui/GalleryCreditInput';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { AccordionSection } from '@/components/ui/form';
import { StoryRichTextarea } from '@/components/shared/StoryRichTextarea';
import { StoryPostBody } from '@/components/shared/StoryPostBody';
import { extractPdfWithLayout } from '@/lib/oc/pdfText';
import { uploadImageFile, uploadMediaFile } from '@/lib/r2/client';
import type {
  StoryBgAccentMode,
  StoryBgEffect,
  StoryEntry,
  StoryViewMode,
  StoryVisibility,
} from '@/lib/types/character';

type Props = {
  entries: StoryEntry[];
  categories?: string[];
  /** 분류명 → hex 색 */
  categoryColors?: Record<string, string>;
  onChange: (
    entries: StoryEntry[],
    categories: string[],
    categoryColors?: Record<string, string>,
  ) => void;
  focusEntryId?: string | null;
  /** 일괄 업로드/수정 등 관리자 기능 */
  enableSeriesTools?: boolean;
  /** 로그 상세에서 PDF 가져오기 (기본 true) */
  enablePdfImport?: boolean;
  /** 분류 목록·행 select (기본 true) */
  enableCategories?: boolean;
  /** 상단 「글 추가」버튼 (기본 true). false면 하단 RepeatableList 스타일 추가만 */
  enableToolbarAdd?: boolean;
};

function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function StoryEntriesEditor({
  entries,
  categories,
  categoryColors,
  onChange,
  focusEntryId,
  enableSeriesTools = true,
  enablePdfImport = true,
  enableCategories = true,
  enableToolbarAdd = true,
}: Props) {
  const cats = mergeStoryCategories(categories, entries);
  const [customCat, setCustomCat] = useState('');
  const [customCatColor, setCustomCatColor] = useState('#c9b48a');
  const [busyBatch, setBusyBatch] = useState(false);
  const [batchEdit, setBatchEdit] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const focusRef = useRef<HTMLLIElement | null>(null);

  const colors = categoryColors || {};

  useEffect(() => {
    if (!focusEntryId || !focusRef.current) return;
    setExpandedId(focusEntryId);
    focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusRef.current.classList.add('is-focus-entry');
    const t = window.setTimeout(() => focusRef.current?.classList.remove('is-focus-entry'), 2200);
    return () => window.clearTimeout(t);
  }, [focusEntryId]);

  const commit = (
    next: StoryEntry[],
    nextCats = cats,
    nextColors: Record<string, string> = colors,
  ) => {
    onChange(
      next.map((e, i) => ({ ...e, order: i })),
      mergeStoryCategories(nextCats, next),
      Object.keys(nextColors).length ? nextColors : undefined,
    );
  };

  const patch = (id: string, partial: Partial<StoryEntry>) => {
    commit(entries.map((e) => (e.id === id ? { ...e, ...partial } : e)));
  };

  const setCategoryColor = (name: string, hex: string) => {
    commit(entries, cats, { ...colors, [name]: hex });
  };

  const addCategory = () => {
    const t = customCat.trim();
    if (!t) return;
    const nextColors = { ...colors, [t]: customCatColor };
    commit(entries, [...cats, t], nextColors);
    setCustomCat('');
  };

  const batchUploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusyBatch(true);
    try {
      const created: StoryEntry[] = [];
      let order = entries.length;
      for (const file of Array.from(files)) {
        const url = await uploadImageFile(file, 'pair/story-posts');
        const title = file.name.replace(/\.[^.]+$/, '');
        created.push(
          createStoryEntry({
            title,
            category: '본편',
            order: order++,
            viewMode: 'scroll',
            thumbnail: url,
            images: [url],
            chapters: [createChapter('')],
          }),
        );
      }
      commit([...entries, ...created]);
    } catch (err) {
      console.error(err);
      window.alert('일괄 업로드에 실패했습니다.');
    } finally {
      setBusyBatch(false);
    }
  };

  const applyBatchPatch = (partial: Partial<StoryEntry>) => {
    if (!selected.size) return;
    commit(entries.map((e) => (selected.has(e.id) ? { ...e, ...partial } : e)));
  };

  return (
    <div className="lh-story-editor">
      {enableToolbarAdd || enableSeriesTools ? (
        <div className="lh-story-editor__toolbar">
          {enableToolbarAdd ? (
            <button
              type="button"
              className="btn-save"
              style={{ padding: '6px 12px' }}
              onClick={() => {
                const next = [
                  ...entries,
                  createStoryEntry({ title: '', category: '본편', order: entries.length, viewMode: 'text' }),
                ];
                commit(next);
                setExpandedId(next[next.length - 1]?.id ?? null);
              }}
            >
              글 추가
            </button>
          ) : null}
          {enableSeriesTools ? (
            <>
              <label className="btn-save" style={{ padding: '6px 12px', cursor: 'pointer' }}>
                {busyBatch ? '업로드 중…' : '일괄 업로드(이미지)'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={busyBatch}
                  hidden
                  onChange={(e) => {
                    void batchUploadImages(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="btn-save"
                style={{ padding: '6px 12px' }}
                onClick={() => {
                  setBatchEdit((v) => !v);
                  setSelected(new Set());
                }}
              >
                {batchEdit ? '일괄 수정 닫기' : '일괄 수정'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {batchEdit ? (
        <div className="lh-story-batch">
          <p className="form-hint">선택한 포스트의 제목·부제·순서·썸네일을 한꺼번에 고칩니다.</p>
          <div className="lh-story-batch__list">
            {entries.map((e) => (
              <label key={e.id} className="lh-story-batch__item">
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={(ev) => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (ev.target.checked) n.add(e.id);
                      else n.delete(e.id);
                      return n;
                    });
                  }}
                />
                <span>{e.title.trim() || '(제목 없음)'}</span>
              </label>
            ))}
          </div>
          <div className="lake-edit-row2" style={{ marginTop: 8 }}>
            <div className="form-group">
              <label className="form-label">선택 항목 제목</label>
              <input
                className="form-input"
                placeholder="일괄 제목"
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t) applyBatchPatch({ title: t });
                  e.target.value = '';
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">선택 항목 부제</label>
              <input
                className="form-input"
                placeholder="일괄 부제"
                onBlur={(e) => {
                  applyBatchPatch({ subtitle: e.target.value });
                  e.target.value = '';
                }}
              />
            </div>
          </div>
          <label className="btn-save" style={{ padding: '6px 12px', cursor: 'pointer', marginTop: 6 }}>
            선택 항목 썸네일
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f || !selected.size) return;
                try {
                  const url = await uploadImageFile(f, 'pair/story-thumbs');
                  applyBatchPatch({ thumbnail: url });
                } catch (err) {
                  console.error(err);
                  window.alert('썸네일 업로드 실패');
                }
              }}
            />
          </label>
        </div>
      ) : null}

      {enableCategories ? (
        <div className="form-group" style={{ marginTop: 10 }}>
          <span className="form-label">분류 목록</span>
          <div className="lh-story-cat-list">
            {cats.map((c) => {
              const hex = resolveStoryCategoryColor(c, colors) || '#c9b48a';
              return (
                <label key={c} className="lh-story-cat-chip">
                  <input
                    type="color"
                    className="lh-story-cat-chip__color"
                    value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#c9b48a'}
                    onChange={(e) => setCategoryColor(c, e.target.value)}
                    title={`${c} 색상`}
                    aria-label={`${c} 색상`}
                  />
                  <span className="lh-story-tag" data-cat={c} style={storyCategoryTagStyle(c, colors)}>
                    {c}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="lh-story-cat-add">
            <input
              className="form-input"
              placeholder="새 분류 이름"
              value={customCat}
              onChange={(e) => setCustomCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCategory();
                }
              }}
            />
            <input
              type="color"
              className="lh-story-cat-add__color"
              value={customCatColor}
              onChange={(e) => setCustomCatColor(e.target.value)}
              title="분류 색상"
              aria-label="새 분류 색상"
            />
            <button type="button" className="btn-save" style={{ padding: '6px 10px' }} onClick={addCategory}>
              분류 추가
            </button>
          </div>
        </div>
      ) : null}

      <ul className="lh-story-editor__list">
        {entries.map((entry, index) => {
          const open = expandedId === entry.id;
          return (
            <li
              key={entry.id}
              ref={focusEntryId && entry.id === focusEntryId ? focusRef : undefined}
              className={`lh-story-editor__card lh-form-accord${focusEntryId === entry.id ? ' is-focus-entry' : ''}${
                open ? ' is-open' : ''
              }`}
            >
              <div className="lh-story-editor__acc-head">
                <button
                  type="button"
                  className="lh-story-editor__acc-toggle"
                  onClick={() => setExpandedId(open ? null : entry.id)}
                  aria-expanded={open}
                >
                  <span className="lh-story-editor__acc-chev" aria-hidden>
                    {open ? '▾' : '▸'}
                  </span>
                  <span className="lh-story-editor__acc-title">
                    {entry.title.trim() || '(제목 없음)'}
                  </span>
                  {enableCategories ? (
                    <span
                      className="lh-story-tag"
                      data-cat={entry.category}
                      style={storyCategoryTagStyle(entry.category, colors)}
                    >
                      {entry.category || '기타'}
                    </span>
                  ) : null}
                </button>
                <div className="lh-story-editor__acc-actions">
                  <button
                    type="button"
                    className="btn-del"
                    disabled={index === 0}
                    onClick={() => commit(moveEntry(entries, entry.id, -1))}
                    aria-label="위로"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-del"
                    disabled={index >= entries.length - 1}
                    onClick={() => commit(moveEntry(entries, entry.id, 1))}
                    aria-label="아래로"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-del"
                    onClick={() => commit(entries.filter((e) => e.id !== entry.id))}
                  >
                    삭제
                  </button>
                </div>
              </div>

              {open ? (
                <div className="lh-story-editor__acc-body">
                  <StoryEntryEditorCard
                    entry={entry}
                    onPatch={(p) => patch(entry.id, p)}
                    onCollapse={() => setExpandedId(null)}
                    enablePdfImport={enablePdfImport}
                    enableCategories={enableCategories}
                    categories={cats}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!entries.length ? (
        <p style={{ fontSize: 12, opacity: 0.6 }}>
          아직 글이 없습니다. {enableToolbarAdd ? '「글 추가」' : '「+ 로그 추가」'}를 눌러 주세요.
        </p>
      ) : null}
      {!enableToolbarAdd ? (
        <button
          type="button"
          className="lh-repeatable__add"
          style={{ marginTop: 10 }}
          onClick={() => {
            const next = [
              ...entries,
              createStoryEntry({ title: '', category: '본편', order: entries.length, viewMode: 'text' }),
            ];
            commit(next);
            setExpandedId(next[next.length - 1]?.id ?? null);
          }}
        >
          + 로그 추가
        </button>
      ) : null}
    </div>
  );
}

function isValidTweetUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./, '');
    return (host === 'twitter.com' || host === 'x.com') && /\/status\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

const MOOD_PRESETS_KEY = 'lh_story_mood_presets';

type MoodPreset = {
  bgAccentMode?: StoryBgAccentMode;
  bgColor?: string;
  bgEffect?: StoryBgEffect;
  bgEffectOpacity?: number;
};

function loadMoodPresets(): MoodPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MOOD_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MoodPreset[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveMoodPreset(preset: MoodPreset) {
  if (typeof window === 'undefined') return;
  const key = JSON.stringify(preset);
  const next = [preset, ...loadMoodPresets().filter((p) => JSON.stringify(p) !== key)].slice(0, 5);
  localStorage.setItem(MOOD_PRESETS_KEY, JSON.stringify(next));
}

function moodPresetLabel(p: MoodPreset, i: number): string {
  const effect = p.bgEffect === 'vignette' ? '비네트' : '그라데이션';
  const accent = p.bgAccentMode === 'custom' ? '커스텀' : '캐릭터';
  const opacity = clampBgEffectOpacity(p.bgEffectOpacity !== undefined ? p.bgEffectOpacity : 55);
  return `#${i + 1} ${accent} · ${effect} · ${opacity}%`;
}

type EditTab = 'body' | 'mood' | 'media' | 'basic';

const EDIT_TABS: { id: EditTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'body', label: '본문' },
  { id: 'mood', label: '분위기·BGM' },
  { id: 'media', label: '보기·미디어' },
];

function StoryEntryEditorCard({
  entry,
  onPatch,
  onCollapse,
  enablePdfImport = true,
  enableCategories = true,
  categories = [],
}: {
  entry: StoryEntry;
  onPatch: (partial: Partial<StoryEntry>) => void;
  onCollapse?: () => void;
  enablePdfImport?: boolean;
  enableCategories?: boolean;
  categories?: string[];
}) {
  const body0 = entry.chapters[0]?.body || '';
  const debouncedBody = useDebounced(body0, 200);
  const previewEntry = useMemo(
    () => ({
      ...entry,
      chapters: entry.chapters.map((c, i) => (i === 0 ? { ...c, body: debouncedBody } : c)),
    }),
    [entry, debouncedBody],
  );
  const mode = entry.viewMode === 'scroll' || entry.viewMode === 'comic' ? entry.viewMode : 'text';

  const [tab, setTab] = useState<EditTab>('basic');
  const [showPreview, setShowPreview] = useState(false);
  const [tweetInput, setTweetInput] = useState('');
  const [moodPresets, setMoodPresets] = useState<MoodPreset[]>([]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfDraft, setPdfDraft] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);

  useEffect(() => {
    setMoodPresets(loadMoodPresets());
  }, []);

  useEffect(() => {
    saveMoodPreset({
      bgAccentMode: entry.bgAccentMode,
      bgColor: entry.bgColor,
      bgEffect: entry.bgEffect,
      bgEffectOpacity: entry.bgEffectOpacity,
    });
    setMoodPresets(loadMoodPresets());
  }, [entry.bgAccentMode, entry.bgColor, entry.bgEffect, entry.bgEffectOpacity]);

  const applyPdfDraft = () => {
    if (pdfDraft === null) return;
    const chapters = entry.chapters.length
      ? entry.chapters.map((c, i) => (i === 0 ? { ...c, body: pdfDraft } : c))
      : [createChapter(pdfDraft)];
    const partial: Partial<StoryEntry> = { chapters };
    if (!entry.title.trim() && pdfFilename) {
      partial.title = pdfFilename;
    }
    onPatch(partial);
    setPdfDraft(null);
    setPdfFilename(null);
  };

  const tweetEmbeds = entry.tweetEmbeds || [];

  const addTweetUrl = () => {
    const url = tweetInput.trim();
    if (!url) return;
    if (!isValidTweetUrl(url)) {
      window.alert('twitter.com 또는 x.com 트윗 URL만 추가할 수 있습니다.');
      return;
    }
    if (tweetEmbeds.includes(url)) {
      setTweetInput('');
      return;
    }
    onPatch({ tweetEmbeds: [...tweetEmbeds, url] });
    setTweetInput('');
  };

  const moveTweet = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= tweetEmbeds.length) return;
    const next = [...tweetEmbeds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onPatch({ tweetEmbeds: next });
  };

  return (
    <div className="lh-story-editor__meta">
      <div className="lh-story-edit-card__sticky">
        <span className="lh-story-edit-card__sticky-title">로그 편집</span>
        <div className="lh-story-edit-card__sticky-actions">
          {onCollapse ? (
            <button type="button" className="btn-del" style={{ padding: '4px 10px' }} onClick={onCollapse}>
              접기
            </button>
          ) : null}
        </div>
      </div>
      <div className="lh-story-edit-tabs">
        <nav className="lh-story-edit-tabs__nav" role="tablist" aria-label="글 편집 섹션">
          {EDIT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`lh-story-edit-tabs__nav-btn${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="lh-story-edit-tabs__panel" role="tabpanel">
          {tab === 'basic' ? (
            <>
              <div className="form-group">
                <label className="form-label">제목</label>
                <input
                  className="form-input"
                  placeholder="제목"
                  value={entry.title}
                  onChange={(e) => onPatch({ title: e.target.value })}
                />
              </div>

              {enableCategories ? (
                <div className="form-group">
                  <label className="form-label">분류</label>
                  <select
                    className="form-input"
                    value={entry.category}
                    onChange={(e) => onPatch({ category: e.target.value })}
                  >
                    {(categories.length ? categories : ['본편', 'AU', 'IF', '기타']).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="lake-edit-row2">
                <div className="form-group">
                  <label className="form-label">부제</label>
                  <input
                    className="form-input"
                    value={entry.subtitle || ''}
                    onChange={(e) => onPatch({ subtitle: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">날짜</label>
                  <input
                    className="form-input"
                    type="date"
                    value={entry.date || ''}
                    onChange={(e) => onPatch({ date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">작가</label>
                <GalleryCreditInput
                  value={entry.author || ''}
                  onChange={(author) => onPatch({ author })}
                  placeholder="작가 / 출처"
                />
              </div>

              <div className="form-group">
                <label className="form-label">공개 범위</label>
                <select
                  className="form-input"
                  value={entry.visibility === 'secret' ? 'secret' : 'public'}
                  onChange={(e) => onPatch({ visibility: e.target.value as StoryVisibility })}
                >
                  <option value="public">전체공개</option>
                  <option value="secret">비밀글</option>
                </select>
              </div>

              {entry.visibility === 'secret' ? (
                <div className="form-group">
                  <label className="form-label">비밀글 비밀번호</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="비우면 페어 섹션 기본값"
                    value={entry.secretPassword || ''}
                    onChange={(e) => onPatch({ secretPassword: e.target.value })}
                  />
                </div>
              ) : null}

              <label className="lh-story-editor__check">
                <input
                  type="checkbox"
                  checked={!!entry.adult}
                  onChange={(e) => onPatch({ adult: e.target.checked || undefined })}
                />
                19금
              </label>
            </>
          ) : null}

          {tab === 'media' ? (
            <>
              <div className="form-group">
                <label className="form-label">보기 모드</label>
                <select
                  className="form-input"
                  value={mode}
                  onChange={(e) => onPatch({ viewMode: e.target.value as StoryViewMode })}
                >
                  <option value="text">텍스트 온리 (글)</option>
                  <option value="scroll">스크롤 뷰 (그림)</option>
                  <option value="comic">만화 뷰 (슬라이드)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">썸네일</label>
                <div className="lh-story-editor__thumb-row">
                  {entry.thumbnail ? (
                    <div className="lh-story-editor__thumb-frame" title="드래그·휠로 목록 노출 범위를 맞춥니다">
                      <ImageFrameEditor
                        className="lh-story-editor__thumb-frame-ed"
                        src={entry.thumbnail}
                        value={entry.thumbnailFrame}
                        onChange={(thumbnailFrame) => onPatch({ thumbnailFrame })}
                        aspectRatio="4 / 3"
                        allowWheelZoom
                        showBottomBlur={false}
                      />
                    </div>
                  ) : null}
                  <div className="lh-story-editor__thumb-actions">
                    <label className="btn-save" style={{ padding: '4px 10px', cursor: 'pointer' }}>
                      업로드
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          try {
                            const url = await uploadImageFile(f, 'pair/story-thumbs');
                            onPatch({ thumbnail: url, thumbnailFrame: undefined });
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                      />
                    </label>
                    {entry.thumbnail ? (
                      <button
                        type="button"
                        className="btn-del"
                        onClick={() => onPatch({ thumbnail: '', thumbnailFrame: undefined })}
                      >
                        제거
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {(mode === 'scroll' || mode === 'comic') && (
                <div className="form-group">
                  <label className="form-label">이미지 ({mode === 'comic' ? '슬라이드' : '스크롤'})</label>
                  <div className="lh-story-editor__imgs">
                    {(entry.images || []).map((src, i) => (
                      <div key={`${src}-${i}`} className="lh-story-editor__img">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" />
                        <button
                          type="button"
                          className="btn-del"
                          onClick={() =>
                            onPatch({ images: (entry.images || []).filter((_, j) => j !== i) })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="btn-save" style={{ padding: '4px 10px', cursor: 'pointer' }}>
                    이미지 추가
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={async (e) => {
                        const files = e.target.files;
                        e.target.value = '';
                        if (!files?.length) return;
                        try {
                          const urls: string[] = [];
                          for (const f of Array.from(files)) {
                            urls.push(await uploadImageFile(f, 'pair/story-posts'));
                          }
                          onPatch({ images: [...(entry.images || []), ...urls] });
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </>
          ) : null}

          {tab === 'mood' ? (
            <>
              <div className="form-group">
                <label className="form-label">포스트 BGM (없으면 페어 테마곡)</label>
                <div className="lake-edit-row2">
                  <input
                    className="form-input"
                    placeholder="곡 제목"
                    value={entry.theme?.title || ''}
                    onChange={(e) => onPatch({ theme: { ...entry.theme, title: e.target.value } })}
                  />
                  <input
                    className="form-input"
                    placeholder="아티스트"
                    value={entry.theme?.artist || ''}
                    onChange={(e) => onPatch({ theme: { ...entry.theme, artist: e.target.value } })}
                  />
                </div>
                <input
                  className="form-input"
                  style={{ marginTop: 6 }}
                  placeholder="YouTube URL 또는 ID"
                  value={entry.theme?.youtubeId || ''}
                  onChange={(e) => onPatch({ theme: { ...entry.theme, youtubeId: e.target.value } })}
                />
                <label className="btn-save" style={{ padding: '4px 10px', cursor: 'pointer', marginTop: 6 }}>
                  오디오 파일 업로드
                  <input
                    type="file"
                    accept="audio/*,.mp3,.ogg,.wav"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      try {
                        const url = await uploadMediaFile(f, 'pair/story-bgm');
                        onPatch({
                          theme: {
                            ...entry.theme,
                            fileData: url,
                            title: entry.theme?.title || f.name.replace(/\.[^.]+$/, ''),
                          },
                        });
                      } catch (err) {
                        console.error(err);
                        window.alert('BGM 업로드 실패');
                      }
                    }}
                  />
                </label>
              </div>

              {moodPresets.length ? (
                <div className="form-group">
                  <label className="form-label">최근 분위기 프리셋</label>
                  <select
                    className="form-input"
                    defaultValue=""
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (!Number.isFinite(idx) || idx < 0 || !moodPresets[idx]) return;
                      onPatch(moodPresets[idx]);
                      e.target.value = '';
                    }}
                  >
                    <option value="" disabled>
                      프리셋 불러오기…
                    </option>
                    {moodPresets.map((p, i) => (
                      <option key={i} value={i}>
                        {moodPresetLabel(p, i)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <AccordionSection title="고급 설정" defaultOpen={false}>
                <div className="lake-edit-row2">
                  <div className="form-group">
                    <label className="form-label">분위기 색</label>
                    <select
                      className="form-input"
                      value={entry.bgAccentMode === 'custom' ? 'custom' : 'character'}
                      onChange={(e) => {
                        const m = e.target.value as StoryBgAccentMode;
                        onPatch({
                          bgAccentMode: m,
                          bgColor: m === 'custom' ? entry.bgColor || '#d7a982' : undefined,
                        });
                      }}
                    >
                      <option value="character">캐릭터색 맞춤</option>
                      <option value="custom">커스텀</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">분위기</label>
                    <select
                      className="form-input"
                      value={entry.bgEffect === 'vignette' ? 'vignette' : 'bottom-gradient'}
                      onChange={(e) => onPatch({ bgEffect: e.target.value as StoryBgEffect })}
                    >
                      <option value="bottom-gradient">하단 그라데이션</option>
                      <option value="vignette">중앙 비네트</option>
                    </select>
                  </div>
                </div>

                {entry.bgAccentMode === 'custom' ? (
                  <div className="form-group">
                    <label className="form-label">커스텀 색</label>
                    <div className="lh-story-editor__color">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(entry.bgColor || '') ? entry.bgColor! : '#d7a982'}
                        onChange={(e) => onPatch({ bgAccentMode: 'custom', bgColor: e.target.value })}
                      />
                      <input
                        className="form-input"
                        value={entry.bgColor || ''}
                        onChange={(e) => onPatch({ bgAccentMode: 'custom', bgColor: e.target.value })}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="form-group">
                  <label className="form-label">
                    분위기 투명도{' '}
                    <span className="form-hint">
                      {clampBgEffectOpacity(entry.bgEffectOpacity !== undefined ? entry.bgEffectOpacity : 55)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    className="form-input"
                    min={0}
                    max={100}
                    value={clampBgEffectOpacity(entry.bgEffectOpacity !== undefined ? entry.bgEffectOpacity : 55)}
                    onChange={(e) => onPatch({ bgEffectOpacity: clampBgEffectOpacity(e.target.value) })}
                  />
                </div>
              </AccordionSection>
            </>
          ) : null}

          {tab === 'body' ? (
            <>
              <div className="lh-story-body-tab__toolbar">
                {mode === 'text' ? (
                  <button
                    type="button"
                    className="btn-save"
                    style={{ padding: '4px 10px' }}
                    onClick={() => setShowPreview((v) => !v)}
                  >
                    {showPreview ? '미리보기 닫기' : '미리보기'}
                  </button>
                ) : null}
              </div>

              {enablePdfImport ? (
                <div className="form-group">
                  <label className="btn-save" style={{ padding: '4px 10px', cursor: pdfBusy ? 'wait' : 'pointer' }}>
                    {pdfBusy ? 'PDF 처리 중…' : 'PDF에서 가져오기'}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      hidden
                      disabled={pdfBusy}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        setPdfBusy(true);
                        try {
                          const result = await extractPdfWithLayout(f);
                          if (!result.text.trim()) {
                            window.alert('추출된 텍스트가 없습니다. 이미지만 있는 PDF일 수 있습니다.');
                            return;
                          }
                          setPdfDraft(result.text);
                          setPdfFilename(f.name.replace(/\.[^.]+$/, ''));
                        } catch (err) {
                          console.error(err);
                          window.alert(err instanceof Error ? err.message : 'PDF 가져오기에 실패했습니다.');
                        } finally {
                          setPdfBusy(false);
                        }
                      }}
                    />
                  </label>

                  {pdfDraft !== null ? (
                    <div className="lh-story-pdf-review">
                      <p className="form-hint">
                        PDF에서 추출한 텍스트입니다. 줄바꿈·구분선(`---`)은 자동 추정이므로 확인 후 적용해 주세요.
                      </p>
                      <textarea
                        className="form-input"
                        rows={12}
                        value={pdfDraft}
                        onChange={(e) => setPdfDraft(e.target.value)}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" className="btn-save" style={{ padding: '4px 10px' }} onClick={applyPdfDraft}>
                          본문에 적용
                        </button>
                        <button
                          type="button"
                          className="btn-del"
                          onClick={() => {
                            setPdfDraft(null);
                            setPdfFilename(null);
                          }}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="form-group">
                <label className="form-label">트윗 임베드</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    className="form-input"
                    style={{ flex: '1 1 200px' }}
                    placeholder="https://x.com/…/status/…"
                    value={tweetInput}
                    onChange={(e) => setTweetInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTweetUrl();
                      }
                    }}
                  />
                  <button type="button" className="btn-save" style={{ padding: '4px 10px' }} onClick={addTweetUrl}>
                    트윗 URL 추가
                  </button>
                </div>
                {tweetEmbeds.length ? (
                  <ul className="lh-story-tweet-list">
                    {tweetEmbeds.map((url, i) => (
                      <li key={url} className="lh-story-tweet-list__item">
                        <span className="lh-story-tweet-list__url">{url}</span>
                        <span className="lh-story-tweet-list__actions">
                          <button type="button" className="btn-del" disabled={i === 0} onClick={() => moveTweet(i, -1)}>
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn-del"
                            disabled={i >= tweetEmbeds.length - 1}
                            onClick={() => moveTweet(i, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="btn-del"
                            onClick={() => onPatch({ tweetEmbeds: tweetEmbeds.filter((_, j) => j !== i) })}
                          >
                            삭제
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {mode === 'text' ? (
                <div className={showPreview ? 'lh-story-split' : 'lh-story-split is-single'}>
                  <div className="lh-story-split__editor">
                    {entry.chapters.map((ch, ci) => (
                      <div key={ch.id} className="lh-story-editor__chapter">
                        <div className="lh-story-editor__row">
                          <input
                            className="form-input"
                            style={{ flex: 1 }}
                            placeholder={`장 ${ci + 1} 제목 (선택)`}
                            value={ch.title || ''}
                            onChange={(e) => {
                              const chapters = entry.chapters.map((c) =>
                                c.id === ch.id ? { ...c, title: e.target.value } : c,
                              );
                              onPatch({ chapters });
                            }}
                          />
                          <button
                            type="button"
                            className="btn-del"
                            disabled={entry.chapters.length <= 1}
                            onClick={() => {
                              const chapters = entry.chapters.filter((c) => c.id !== ch.id);
                              onPatch({ chapters: chapters.length ? chapters : [createChapter()] });
                            }}
                          >
                            장 삭제
                          </button>
                        </div>
                        <StoryRichTextarea
                          rows={10}
                          placeholder="본문 — 드래그 후 서식 · 구분선은 「─」 버튼"
                          value={ch.body}
                          onChange={(body) => {
                            const chapters = entry.chapters.map((c) =>
                              c.id === ch.id ? { ...c, body } : c,
                            );
                            onPatch({ chapters });
                          }}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-save"
                      style={{ padding: '4px 10px', marginTop: 4 }}
                      onClick={() => onPatch({ chapters: [...entry.chapters, createChapter()] })}
                    >
                      장 추가
                    </button>
                  </div>
                  {showPreview ? (
                    <div className="lh-story-split__preview">
                      <span className="lh-story-split__preview-label">미리보기</span>
                      <div className="lh-story-split__preview-frame">
                        <h3 className="lh-story-split__preview-title">
                          {previewEntry.title.trim() || '(제목 없음)'}
                        </h3>
                        <StoryPostBody entry={previewEntry} preview />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="form-hint">
                  그림/만화 모드에서는 위 이미지가 본문으로 표시됩니다. 텍스트 본문은 저장만 됩니다.
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
