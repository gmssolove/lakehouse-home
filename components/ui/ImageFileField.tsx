'use client';

import { uploadImageFile } from '@/lib/r2/client';

type Props = {
  label?: string;
  value: string;
  folder: string;
  uploading?: boolean;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  onChange: (url: string) => void;
};

export function ImageFileField({
  label = '이미지',
  value,
  folder,
  uploading,
  onUploadStart,
  onUploadEnd,
  onChange,
}: Props) {
  async function pick(file: File | undefined) {
    if (!file) return;
    onUploadStart?.();
    try {
      const url = await uploadImageFile(file, folder);
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '이미지 업로드 실패');
    } finally {
      onUploadEnd?.();
    }
  }

  return (
    <div className="lh-image-field">
      {label ? <span className="lh-image-field__label">{label}</span> : null}
      <div className="lh-image-field__row">
        <label className="file-input-label lh-image-field__pick" style={{ margin: 0, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중…' : '📁 파일 선택'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <input
          className="form-input lh-image-field__url"
          placeholder="URL (선택)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {value ? (
        <img src={value} alt="" className="lh-image-field__preview" />
      ) : null}
    </div>
  );
}
