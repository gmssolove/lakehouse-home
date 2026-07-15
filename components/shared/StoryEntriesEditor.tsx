'use client';

import { useState } from 'react';
import {
  clampBgEffectOpacity,
  createChapter,
  createStoryEntry,
  mergeStoryCategories,
  moveEntry,
} from '@/lib/oc/storyEntries';
import { GalleryCreditInput } from '@/components/ui/GalleryCreditInput';
import { StoryRichTextarea } from '@/components/shared/StoryRichTextarea';
import { extractTextFromPdfFile } from '@/lib/oc/pdfText';
import type { StoryBgAccentMode, StoryBgEffect, StoryEntry } from '@/lib/types/character';

type Props = {
  entries: StoryEntry[];
  categories?: string[];
  onChange: (entries: StoryEntry[], categories: string[]) => void;
};

export function StoryEntriesEditor({ entries, categories, onChange }: Props) {
  const cats = mergeStoryCategories(categories, entries);
  const [customCat, setCustomCat] = useState('');
  const [busyPdf, setBusyPdf] = useState(false);

  const commit = (next: StoryEntry[], nextCats = cats) => {
    onChange(
      next.map((e, i) => ({ ...e, order: i })),
      mergeStoryCategories(nextCats, next),
    );
  };

  const patch = (id: string, partial: Partial<StoryEntry>) => {
    commit(entries.map((e) => (e.id === id ? { ...e, ...partial } : e)));
  };

  const addCategory = () => {
    const t = customCat.trim();
    if (!t) return;
    commit(entries, [...cats, t]);
    setCustomCat('');
  };

  const importPdf = async (file: File) => {
    setBusyPdf(true);
    try {
      const text = await extractTextFromPdfFile(file);
      if (!text) {
        window.alert('텍스트를 추출하지 못했습니다. (이미지 PDF일 수 있어요)');
        return;
      }
      const title = file.name.replace(/\.pdf$/i, '');
      commit([
        ...entries,
        createStoryEntry({
          title,
          category: '기타',
          chapters: [createChapter(text)],
          order: entries.length,
        }),
      ]);
    } catch (err) {
      console.error(err);
      window.alert('PDF 읽기에 실패했습니다.');
    } finally {
      setBusyPdf(false);
    }
  };

  return (
    <div className="lh-story-editor">
      <div className="lh-story-editor__toolbar">
        <button
          type="button"
          className="btn-save"
          style={{ padding: '6px 12px' }}
          onClick={() =>
            commit([
              ...entries,
              createStoryEntry({ title: '', category: '본편', order: entries.length }),
            ])
          }
        >
          글 추가
        </button>
        <label className="btn-save" style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {busyPdf ? 'PDF 읽는 중…' : 'PDF에서 가져오기'}
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busyPdf}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importPdf(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="form-group" style={{ marginTop: 10 }}>
        <span className="form-label">분류 목록</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {cats.map((c) => (
            <span key={c} className={`lh-story-tag`} data-cat={c}>
              {c}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
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
          <button type="button" className="btn-save" style={{ padding: '6px 10px' }} onClick={addCategory}>
            분류 추가
          </button>
        </div>
      </div>

      <ul className="lh-story-editor__list">
        {entries.map((entry, index) => (
          <li key={entry.id} className="lh-story-editor__card">
            <div className="lh-story-editor__row">
              <input
                className="form-input"
                style={{ flex: 1 }}
                placeholder="제목"
                value={entry.title}
                onChange={(e) => patch(entry.id, { title: e.target.value })}
              />
              <select
                className="form-input"
                style={{ width: 110 }}
                value={entry.category}
                onChange={(e) => patch(entry.id, { category: e.target.value })}
              >
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-del"
                disabled={index === 0}
                onClick={() => commit(moveEntry(entries, entry.id, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-del"
                disabled={index >= entries.length - 1}
                onClick={() => commit(moveEntry(entries, entry.id, 1))}
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

            <div className="lh-story-editor__meta">
              <div className="form-group">
                <label className="form-label">작가</label>
                <GalleryCreditInput
                  value={entry.author || ''}
                  onChange={(author) => patch(entry.id, { author })}
                  placeholder="작가 / 출처"
                />
              </div>
              <div className="lake-edit-row2">
                <div className="form-group">
                  <label className="form-label">분위기 색</label>
                  <select
                    className="form-input"
                    value={entry.bgAccentMode === 'custom' ? 'custom' : 'character'}
                    onChange={(e) => {
                      const mode = e.target.value as StoryBgAccentMode;
                      patch(entry.id, {
                        bgAccentMode: mode,
                        bgColor: mode === 'custom' ? entry.bgColor || '#d7a982' : undefined,
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
                    onChange={(e) =>
                      patch(entry.id, { bgEffect: e.target.value as StoryBgEffect })
                    }
                  >
                    <option value="bottom-gradient">하단 그라데이션</option>
                    <option value="vignette">중앙 비네트</option>
                  </select>
                </div>
              </div>
              {entry.bgAccentMode === 'custom' ? (
                <div className="form-group">
                  <label className="form-label">커스텀 색 (비네트/그라데이션)</label>
                  <div className="lh-story-editor__color">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(entry.bgColor || '') ? entry.bgColor! : '#d7a982'}
                      onChange={(e) =>
                        patch(entry.id, { bgAccentMode: 'custom', bgColor: e.target.value })
                      }
                      aria-label="분위기 색"
                    />
                    <input
                      className="form-input"
                      placeholder="#hex"
                      value={entry.bgColor || ''}
                      onChange={(e) =>
                        patch(entry.id, { bgAccentMode: 'custom', bgColor: e.target.value })
                      }
                    />
                  </div>
                </div>
              ) : null}
              <div className="form-group">
                <label className="form-label">
                  분위기 투명도{' '}
                  <span className="form-hint">
                    {clampBgEffectOpacity(
                      entry.bgEffectOpacity !== undefined ? entry.bgEffectOpacity : 55,
                    )}
                    %
                  </span>
                </label>
                <input
                  type="range"
                  className="form-input"
                  min={0}
                  max={100}
                  step={1}
                  value={clampBgEffectOpacity(
                    entry.bgEffectOpacity !== undefined ? entry.bgEffectOpacity : 55,
                  )}
                  onChange={(e) =>
                    patch(entry.id, { bgEffectOpacity: clampBgEffectOpacity(e.target.value) })
                  }
                  aria-label="분위기 투명도"
                />
              </div>
            </div>

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
                      patch(entry.id, { chapters });
                    }}
                  />
                  <button
                    type="button"
                    className="btn-del"
                    disabled={entry.chapters.length <= 1}
                    onClick={() => {
                      const chapters = entry.chapters.filter((c) => c.id !== ch.id);
                      patch(entry.id, { chapters: chapters.length ? chapters : [createChapter()] });
                    }}
                  >
                    장 삭제
                  </button>
                </div>
                <StoryRichTextarea
                  rows={6}
                  placeholder="본문 — 텍스트 드래그 후 서식/색 적용"
                  value={ch.body}
                  onChange={(body) => {
                    const chapters = entry.chapters.map((c) =>
                      c.id === ch.id ? { ...c, body } : c,
                    );
                    patch(entry.id, { chapters });
                  }}
                />
              </div>
            ))}

            <button
              type="button"
              className="btn-save"
              style={{ padding: '4px 10px', marginTop: 4 }}
              onClick={() =>
                patch(entry.id, { chapters: [...entry.chapters, createChapter()] })
              }
            >
              장 추가
            </button>
          </li>
        ))}
      </ul>

      {!entries.length ? (
        <p style={{ fontSize: 12, opacity: 0.6 }}>아직 글이 없습니다. 「글 추가」를 눌러 주세요.</p>
      ) : null}
    </div>
  );
}
