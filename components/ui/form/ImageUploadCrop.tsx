'use client';

import { useRef, useState } from 'react';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { uploadImageFile } from '@/lib/r2/client';
import { normalizeUploadFile } from '@/lib/r2/mime';
import type { ImageFrame } from '@/lib/shared/imageFrame';

type Props = {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  /** 파일 업로드 성공 시에만 호출 (URL 타이핑과 구분) */
  onUploaded?: (url: string) => void;
  folder: string;
  /** 있으면 URL 있을 때 프레임 에디터 표시 */
  frame?: ImageFrame;
  onFrameChange?: (frame: ImageFrame) => void;
  /** 프레임 에디터 소스 (기본: value). 카드 커버 폴백용 */
  frameSrc?: string;
  hint?: string;
  aspectRatio?: string;
  fit?: string;
  pos?: string;
  allowWheelZoom?: boolean;
  showBottomBlur?: boolean;
  frameClassName?: string;
  showPreview?: boolean;
  showClear?: boolean;
  uploading?: boolean;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  urlPlaceholder?: string;
  className?: string;
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

export function ImageUploadCrop({
  label,
  value,
  onChange,
  onUploaded,
  folder,
  frame,
  onFrameChange,
  frameSrc,
  hint,
  aspectRatio = '10 / 16.5',
  fit = 'cover',
  pos = 'center top',
  allowWheelZoom = true,
  showBottomBlur = true,
  frameClassName = '',
  showPreview = false,
  showClear = false,
  uploading: uploadingProp,
  onUploadStart,
  onUploadEnd,
  urlPlaceholder = '또는 URL',
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localUploading, setLocalUploading] = useState(false);
  const uploading = uploadingProp ?? localUploading;
  const editorSrc = (frameSrc ?? value)?.trim() || '';
  const showFrame = Boolean(editorSrc && onFrameChange);

  async function pick(file: File | undefined) {
    if (!file) return;
    const normalized = normalizeUploadFile(file);
    onUploadStart?.();
    setLocalUploading(true);
    try {
      const url = await uploadWithFallback(normalized, folder);
      onChange(url);
      onUploaded?.(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '이미지 업로드 실패');
    } finally {
      setLocalUploading(false);
      onUploadEnd?.();
    }
  }

  return (
    <div className={`lh-upload-crop${className ? ` ${className}` : ''}`}>
      {label ? <span className="lh-upload-crop__label">{label}</span> : null}
      <div className="lh-upload-crop__row">
        <button
          type="button"
          className="file-input-label"
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
          className="lh-upload-crop__file"
          disabled={uploading}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          className="form-input lh-upload-crop__url"
          placeholder={urlPlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint ? <p className="lh-upload-crop__hint">{hint}</p> : null}
      {showFrame ? (
        <ImageFrameEditor
          className={frameClassName}
          src={editorSrc}
          value={frame}
          onChange={onFrameChange!}
          fit={fit}
          pos={pos}
          aspectRatio={aspectRatio}
          allowWheelZoom={allowWheelZoom}
          showBottomBlur={showBottomBlur}
        />
      ) : null}
      {!showFrame && showPreview && value?.trim() ? (
        <img src={value} alt="" className="lh-upload-crop__preview" referrerPolicy="no-referrer" />
      ) : null}
      {showClear && value?.trim() ? (
        <button
          type="button"
          className="lh-upload-crop__clear"
          onClick={() => onChange('')}
        >
          이미지 제거
        </button>
      ) : null}
    </div>
  );
}
