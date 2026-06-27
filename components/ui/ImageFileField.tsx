'use client';

import { useRef } from 'react';
import { uploadImageFile } from '@/lib/r2/client';
import { normalizeUploadFile } from '@/lib/r2/mime';

type Props = {
  label?: string;
  value: string;
  folder: string;
  uploading?: boolean;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  onChange: (url: string) => void;
};

async function uploadWithFallback(file: File, folder: string): Promise<string> {
  try {
    return await uploadImageFile(file, folder);
  } catch (err) {
    const legacy = typeof window !== 'undefined' ? window.LakeR2Upload : undefined;
    if (legacy?.uploadFile) {
      return legacy.uploadFile(file, folder);
    }
    throw err;
  }
}

export function ImageFileField({
  label = '이미지',
  value,
  folder,
  uploading,
  onUploadStart,
  onUploadEnd,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    const normalized = normalizeUploadFile(file);
    onUploadStart?.();
    try {
      const url = await uploadWithFallback(normalized, folder);
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
        <button
          type="button"
          className="file-input-label lh-image-field__pick"
          style={{ margin: 0, opacity: uploading ? 0.6 : 1 }}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? '업로드 중…' : '📁 파일 선택'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="lh-image-field__file"
          disabled={uploading}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          className="form-input lh-image-field__url"
          placeholder="URL (선택)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {value ? (
        <img src={value} alt="" className="lh-image-field__preview" referrerPolicy="no-referrer" />
      ) : null}
    </div>
  );
}
