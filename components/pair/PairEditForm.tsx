'use client';

import { useEffect, useState } from 'react';
import { PairSlantHero } from '@/components/pair/PairSlantHero';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { useSaveToast } from '@/components/ui/SaveToast';
import { PAIR_SHIELD_CLIP } from '@/lib/oc/pairDefaults';
import { uploadImageFile } from '@/lib/r2/client';
import type { PairItem } from '@/lib/types/character';

type Props = {
  pair: PairItem;
  onSave: (p: PairItem) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  showPreview?: boolean;
  order?: { canUp: boolean; canDown: boolean; position: number; total: number };
  onMove?: (direction: -1 | 1) => void;
};

export function PairEditForm({ pair, onSave, onDelete, showPreview = true, order, onMove }: Props) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState(pair);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm(pair);
  }, [pair]);

  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, 'pair/cover');
      setForm((prev) => ({ ...prev, img: url }));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    await onSave(form);
    showSaveToast();
  }

  const coverSrc = form.img?.trim() || form.charImgs?.[0]?.trim() || '';
  const coverFit = form.imgFit || form.charImgFit?.[0] || 'cover';
  const coverPos = form.imgPos || form.charImgPos?.[0] || 'center top';

  return (
    <div className="pair-edit-form">
      {showPreview && (
        <div className="pair-edit-preview">
          <div className="pair-edit-preview-label">미리보기</div>
          <PairSlantHero pair={form} variant="preview" showMeta />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
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

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">카드 페어명</label>
          <input
            className="form-input"
            placeholder="예: Over Eclipse"
            value={form.pairTitle || ''}
            onChange={(e) => setForm({ ...form, pairTitle: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">카드 서브명</label>
          <input
            className="form-input"
            placeholder="예: Antagonist × Protagonist"
            value={form.pairSub || ''}
            onChange={(e) => setForm({ ...form, pairSub: e.target.value })}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">캐릭터 1</label>
          <input
            className="form-input"
            value={form.chars[0]}
            onChange={(e) => setForm({ ...form, chars: [e.target.value, form.chars[1]] })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">캐릭터 2</label>
          <input
            className="form-input"
            value={form.chars[1]}
            onChange={(e) => setForm({ ...form, chars: [form.chars[0], e.target.value] })}
          />
        </div>
      </div>

      <div className="section-sep" />
      <div className="form-group">
        <label className="form-label">페어 이미지</label>
        <div className="img-upload-wrap">
          <ImageFrameEditor
            src={coverSrc}
            value={form.imgFrame}
            onChange={(imgFrame) => setForm({ ...form, imgFrame })}
            fit={coverFit}
            pos={coverPos}
            aspectRatio="10 / 16.5"
            clipPath={PAIR_SHIELD_CLIP}
          />
          <label className="file-input-label">
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
            placeholder="또는 URL"
            value={form.img || ''}
            onChange={(e) => setForm({ ...form, img: e.target.value })}
          />
        </div>
      </div>

      <div className="section-sep" />
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">관계</label>
          <input className="form-input" value={form.relation || ''} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">카드 포인트 컬러</label>
          <input
            type="color"
            className="lh-color-picker"
            value={form.color?.trim() || '#d7a982'}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">소개</label>
        <textarea className="form-input" rows={3} value={form.desc || ''} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">키워드 (쉼표 구분)</label>
        <input
          className="form-input"
          placeholder="침묵, 동행"
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
      <div className="form-group">
        <label className="form-label">스토리</label>
        <textarea className="form-input" rows={5} value={form.story || ''} onChange={(e) => setForm({ ...form, story: e.target.value })} />
      </div>
    </div>
  );
}
