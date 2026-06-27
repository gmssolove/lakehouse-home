'use client';

import { useRef } from 'react';
import { uploadMediaFile } from '@/lib/r2/client';
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

export function AudioFileField({
  label = '오디오',
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
    const normalized = normalizeUploadFile(file, 'audio/mpeg');
    onUploadStart?.();
    try {
      const url = await uploadMediaFile(normalized, folder);
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      onUploadEnd?.();
    }
  }

  return (
    <div className="lh-image-field">
      {label ? <span className="lh-image-field__label">{label}</span> : null}
      <div className="lh-image-field__row">
        <input
          className="form-input lh-image-field__url"
          value={value}
          placeholder="URL 또는 파일 업로드"
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn-edit lh-image-field__pick" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? '업로드 중…' : '파일'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="lh-image-field__file"
          disabled={uploading}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {value && (value.startsWith('data:audio') || /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)/i.test(value) || value.includes('/file/')) ? (
        <audio controls src={value} style={{ width: '100%', marginTop: 6 }} />
      ) : null}
    </div>
  );
}
