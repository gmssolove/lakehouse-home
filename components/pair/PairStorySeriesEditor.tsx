'use client';

import { uploadImageFile } from '@/lib/r2/client';
import type { PairStorySeries } from '@/lib/types/character';

type Props = {
  value?: PairStorySeries | null;
  onChange: (next: PairStorySeries | undefined) => void;
};

function tagsToInput(tags?: string[]): string {
  return (tags || []).join(' ');
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
}

export function PairStorySeriesEditor({ value, onChange }: Props) {
  const v = value || {};

  const patch = (partial: Partial<PairStorySeries>) => {
    const next = { ...v, ...partial };
    const empty =
      !next.title?.trim() &&
      !next.quote?.trim() &&
      !next.intro?.trim() &&
      !next.image?.trim() &&
      !(next.hashtags && next.hashtags.length);
    onChange(empty ? undefined : next);
  };

  return (
    <div className="pair-story-series-editor">
      <p className="form-hint" style={{ marginBottom: 10 }}>
        스토리 &gt; 로그 상단 시리즈 소개(히어로). 이미지 없이도 텍스트만으로 표시됩니다.
      </p>
      <div className="form-group">
        <label className="form-label">시리즈 제목</label>
        <input
          className="form-input"
          value={v.title || ''}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="시리즈 제목"
        />
      </div>
      <div className="form-group">
        <label className="form-label">상징 대사 (인용구)</label>
        <textarea
          className="form-input"
          rows={2}
          value={v.quote || ''}
          onChange={(e) => patch({ quote: e.target.value })}
          placeholder="한 줄 인용"
        />
      </div>
      <div className="form-group">
        <label className="form-label">소개 문구</label>
        <textarea
          className="form-input"
          rows={3}
          value={v.intro || ''}
          onChange={(e) => patch({ intro: e.target.value })}
          placeholder="시리즈 소개"
        />
      </div>
      <div className="form-group">
        <label className="form-label">해시태그</label>
        <input
          className="form-input"
          value={tagsToInput(v.hashtags)}
          onChange={(e) => patch({ hashtags: parseTags(e.target.value) })}
          placeholder="#기억 #밤"
        />
      </div>
      <div className="form-group">
        <label className="form-label">히어로 이미지</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {v.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={v.image}
              alt=""
              style={{ width: 72, height: 48, objectFit: 'cover', borderRadius: 4 }}
            />
          ) : null}
          <label className="btn-save" style={{ padding: '6px 12px', cursor: 'pointer' }}>
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
                  const url = await uploadImageFile(f, 'pair/story-series');
                  patch({ image: url });
                } catch (err) {
                  console.error(err);
                  window.alert('이미지 업로드에 실패했습니다.');
                }
              }}
            />
          </label>
          {v.image ? (
            <button type="button" className="btn-del" onClick={() => patch({ image: '' })}>
              이미지 제거
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
