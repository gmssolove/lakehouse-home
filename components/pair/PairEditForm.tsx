'use client';

import { useEffect, useMemo, useState } from 'react';
import { PairSlantHero } from '@/components/pair/PairSlantHero';
import { GalleryCreditInput } from '@/components/ui/GalleryCreditInput';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { LakeEditTabs } from '@/components/ui/LakeEditTabs';
import { useSaveToast } from '@/components/ui/SaveToast';
import { PAIR_SHIELD_CLIP } from '@/lib/oc/pairDefaults';
import { uploadImageFile } from '@/lib/r2/client';
import type { OcCharacter } from '@/lib/types/character';
import type { PairChemistry, PairGalleryItem, PairItem } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';

type PairEditTab = 'basic' | 'story' | 'gallery';

const PAIR_EDIT_TABS: { id: PairEditTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'story', label: '서사·로그' },
  { id: 'gallery', label: '갤러리' },
];

type Props = {
  pair: PairItem;
  characters?: OcCharacter[];
  onSave: (p: PairItem) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  showPreview?: boolean;
  order?: { canUp: boolean; canDown: boolean; position: number; total: number };
  onMove?: (direction: -1 | 1) => void;
};

function formatDdayPreview(iso?: string) {
  if (!iso?.trim()) return { main: 'D+??', since: '날짜 미설정' };
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return { main: 'D+??', since: '날짜 미설정' };
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return { main: `D${diff >= 0 ? '+' : ''}${diff}`, since: `Since ${iso}` };
}

function defaultChemistry(pair: PairItem): PairChemistry[] {
  if (pair.chemistry?.length) return pair.chemistry;
  return [
    { label: '긴장감', value: 50 },
    { label: '신뢰도', value: 50 },
    { label: '친밀도', value: 50 },
  ];
}

export function PairEditForm({ pair, characters = [], onSave, onDelete, showPreview = true, order, onMove }: Props) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState(pair);
  const [tab, setTab] = useState<PairEditTab>('basic');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm(pair);
  }, [pair]);

  const ddayPreview = useMemo(() => formatDdayPreview(form.dday), [form.dday]);
  const chemistry = defaultChemistry(form);

  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, 'pair/cover');
      setForm((prev) => ({ ...prev, img: url }));
    } finally {
      setUploading(false);
    }
  }

  async function uploadGallery(file: File) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, 'pair/gallery');
      const item: PairGalleryItem = { id: newId(), src: url };
      setForm((prev) => ({ ...prev, gallery: [...(prev.gallery ?? []), item] }));
    } finally {
      setUploading(false);
    }
  }

  function updateChem(index: number, patch: Partial<PairChemistry>) {
    const next = [...chemistry];
    next[index] = { ...next[index], ...patch };
    setForm((prev) => ({ ...prev, chemistry: next }));
  }

  function addChem() {
    setForm((prev) => ({
      ...prev,
      chemistry: [...defaultChemistry(prev), { label: '지표', value: 50 }],
    }));
  }

  function removeChem(index: number) {
    setForm((prev) => ({
      ...prev,
      chemistry: defaultChemistry(prev).filter((_, i) => i !== index),
    }));
  }

  function updateGalleryItem(id: string, patch: Partial<PairGalleryItem>) {
    setForm((prev) => ({
      ...prev,
      gallery: (prev.gallery ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }

  function removeGalleryItem(id: string) {
    setForm((prev) => ({ ...prev, gallery: (prev.gallery ?? []).filter((g) => g.id !== id) }));
  }

  function pickCharacter(name: string, slot: 0 | 1) {
    const nextChars = [...form.chars] as [string, string];
    nextChars[slot] = name;
    const char = characters.find((c) => c.name === name);
    const nextImgs = [...(form.charImgs ?? ['', ''])] as [string, string];
    const nextSubs = [...(form.charSubs ?? ['', ''])] as [string, string];
    if (char) {
      nextImgs[slot] = char.img || '';
      nextSubs[slot] = char.nameSub || '';
    }
    setForm({ ...form, chars: nextChars, charImgs: nextImgs, charSubs: nextSubs });
  }

  async function handleSave() {
    await onSave(form);
    showSaveToast();
  }

  const coverSrc = form.img?.trim() || form.charImgs?.[0]?.trim() || '';
  const coverFit = form.imgFit || form.charImgFit?.[0] || 'cover';
  const coverPos = form.imgPos || form.charImgPos?.[0] || 'center top';

  return (
    <div className="lake-edit-shell pair-edit-form">
      {showPreview && (
        <div className="pair-edit-preview">
          <div className="pair-edit-preview-label">미리보기</div>
          <PairSlantHero pair={form} variant="preview" showMeta />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft)' }}>Pair Detail Edit</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-save" onClick={() => void handleSave()}>
            저장
          </button>
          {onDelete && (
            <button type="button" className="btn-del" onClick={() => void onDelete()}>
              삭제
            </button>
          )}
        </div>
      </div>

      {order && onMove && order.total > 1 && (
        <div className="pair-order-controls">
          <span className="pair-order-controls__label">
            목록 순서 {order.position} / {order.total}
          </span>
          <div className="pair-order-controls__btns">
            <button type="button" className="pair-order-btn" disabled={!order.canUp} onClick={() => onMove(-1)}>
              ↑ 앞으로
            </button>
            <button type="button" className="pair-order-btn" disabled={!order.canDown} onClick={() => onMove(1)}>
              ↓ 뒤로
            </button>
          </div>
        </div>
      )}

      <LakeEditTabs tabs={PAIR_EDIT_TABS} active={tab} onChange={(id) => setTab(id as PairEditTab)} />

      <div className="lake-edit-shell__body">
        {tab === 'basic' ? (
          <>
            <div className="lake-edit-section-title">페어 정보</div>
            <div className="lake-edit-row2">
              <div className="form-group">
                <label className="form-label">페어명 (한글)</label>
                <input
                  className="form-input"
                  value={form.pairTitle || ''}
                  onChange={(e) => setForm({ ...form, pairTitle: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">페어명 (영문)</label>
                <input
                  className="form-input"
                  value={form.pairSub || ''}
                  onChange={(e) => setForm({ ...form, pairSub: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">태그 (쉼표 구분)</label>
              <input
                className="form-input"
                placeholder="#적대, #키사라기고교"
                value={(form.keywords || []).join(', ')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    keywords: e.target.value
                      .split(/[,，、]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>

            {characters.length > 0 ? (
              <>
                <div className="lake-edit-section-title">캐릭터 선택</div>
                <div className="pair-char-pick">
                  {characters.slice(0, 12).map((c) => {
                    const selected = form.chars.includes(c.name);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`pair-char-card${selected ? ' is-selected' : ''}`}
                        onClick={() => {
                          const slot = form.chars[0] === c.name ? 0 : form.chars[1] === c.name ? 1 : form.chars[0] ? 1 : 0;
                          pickCharacter(c.name, slot as 0 | 1);
                        }}
                      >
                        <span className="pair-char-card__img">
                          {c.img ? <img src={c.img} alt="" referrerPolicy="no-referrer" /> : c.name[0]}
                        </span>
                        <span className="pair-char-card__name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <div className="lake-edit-row2">
              <div className="form-group">
                <label className="form-label">캐릭터 A</label>
                <input
                  className="form-input"
                  value={form.chars[0]}
                  onChange={(e) => setForm({ ...form, chars: [e.target.value, form.chars[1]] })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">캐릭터 B</label>
                <input
                  className="form-input"
                  value={form.chars[1]}
                  onChange={(e) => setForm({ ...form, chars: [form.chars[0], e.target.value] })}
                />
              </div>
            </div>

            <div className="lake-edit-section-title">D-Day 설정</div>
            <div className="pair-dday-edit">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">기준 날짜</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.dday || ''}
                  onChange={(e) => setForm({ ...form, dday: e.target.value })}
                />
              </div>
              <div className="pair-dday-preview">{ddayPreview.main}</div>
              <div className="pair-dday-since">{ddayPreview.since}</div>
            </div>

            <div className="lake-edit-section-title">납작캐해</div>
            <div className="form-group">
              <textarea
                className="form-input"
                rows={3}
                placeholder="공식 해석"
                value={form.flatLore || ''}
                onChange={(e) => setForm({ ...form, flatLore: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">납작캐해 키워드 (쉼표)</label>
              <input
                className="form-input"
                value={(form.flatLoreKeywords || []).join(', ')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    flatLoreKeywords: e.target.value
                      .split(/[,，、]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>

            <div className="lake-edit-section-title">관계 개요</div>
            <div className="form-group">
              <textarea className="form-input" rows={3} value={form.desc || ''} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </div>

            <div className="lake-edit-section-title">케미 지표</div>
            {chemistry.map((row, i) => (
              <div key={`${row.label}-${i}`} className="pair-chem-edit-row">
                <input
                  className="form-input pair-chem-edit-lbl"
                  value={row.label}
                  onChange={(e) => updateChem(i, { label: e.target.value })}
                />
                <input
                  type="range"
                  className="pair-chem-slider"
                  min={0}
                  max={100}
                  value={row.value}
                  onChange={(e) => updateChem(i, { value: Number(e.target.value) })}
                />
                <input
                  className="pair-chem-num"
                  type="number"
                  min={0}
                  max={100}
                  value={row.value}
                  onChange={(e) => updateChem(i, { value: Number(e.target.value) || 0 })}
                />
                <button type="button" className="lake-edit-mini-del" onClick={() => removeChem(i)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="lake-edit-add-btn" onClick={addChem}>
              + 지표 추가
            </button>

            <div className="lake-edit-section-title">대표 이미지</div>
            <div className="form-group">
              <ImageFrameEditor
                src={coverSrc}
                value={form.imgFrame}
                onChange={(imgFrame) => setForm({ ...form, imgFrame })}
                fit={coverFit}
                pos={coverPos}
                aspectRatio="10 / 16.5"
                clipPath={PAIR_SHIELD_CLIP}
                allowWheelZoom={false}
              />
              <label className="file-input-label" style={{ marginTop: 8 }}>
                {uploading ? '업로드 중…' : '📁 파일 선택'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadCover(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <input
                className="form-input"
                style={{ marginTop: 8 }}
                placeholder="또는 URL"
                value={form.img || ''}
                onChange={(e) => setForm({ ...form, img: e.target.value })}
              />
            </div>

            <div className="lake-edit-row2">
              <div className="form-group">
                <label className="form-label">관계 라벨</label>
                <input className="form-input" value={form.relation || ''} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">포인트 컬러</label>
                <input
                  type="color"
                  className="lh-color-picker"
                  value={form.color?.trim() || '#d7a982'}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                />
              </div>
            </div>
          </>
        ) : null}

        {tab === 'story' ? (
          <>
            <div className="lake-edit-section-title">메인 스토리</div>
            <div className="form-group">
              <textarea className="form-input" rows={5} value={form.story || ''} onChange={(e) => setForm({ ...form, story: e.target.value })} />
            </div>
          </>
        ) : null}

        {tab === 'gallery' ? (
          <>
            <div className="lake-edit-section-title">갤러리</div>
            <div className="pair-gal-grid">
              {(form.gallery ?? []).map((g) => (
                <div key={g.id} className="pair-gal-item">
                  <div className="pair-gal-item__ph">
                    {g.src ? <img src={g.src} alt="" referrerPolicy="no-referrer" /> : '🖼'}
                  </div>
                  <div className="pair-gal-item__cap">
                    <span>{g.title || '이미지'}</span>
                    <button type="button" className="lake-edit-mini-del" onClick={() => removeGalleryItem(g.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="file-input-label">
                {uploading ? '업로드 중…' : '📁 갤러리 이미지 추가'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadGallery(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {(form.gallery ?? []).map((g) => (
              <div key={`edit-${g.id}`} className="lake-edit-card">
                <div className="lake-edit-row2">
                  <div className="form-group">
                    <label className="form-label">URL</label>
                    <input
                      className="form-input"
                      value={g.src}
                      onChange={(e) => updateGalleryItem(g.id, { src: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">제목</label>
                    <input
                      className="form-input"
                      value={g.title || ''}
                      onChange={(e) => updateGalleryItem(g.id, { title: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">작가 / 출처</label>
                  <GalleryCreditInput
                    value={g.credit || ''}
                    onChange={(credit) => updateGalleryItem(g.id, { credit })}
                  />
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
