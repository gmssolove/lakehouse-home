'use client';

import { useMemo, useRef, useState } from 'react';
import { uploadImageFile, uploadMediaFile } from '@/lib/r2/client';
import { normalizeUploadFile } from '@/lib/r2/mime';

type AcceptKind = 'image' | 'audio' | 'any';

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  accept?: AcceptKind;
  /** accept 오버라이드 (예: image/*,.ico) */
  acceptAttr?: string;
  folder?: string;
  /** R2 대신 data URL로 저장 (파비콘 등 소용량) */
  asDataUrl?: boolean;
  changeLabel?: string;
  emptyLabel?: string;
  className?: string;
};

function isDataUrl(v: string) {
  return /^data:/i.test(v.trim());
}

function summarizeValue(value: string, accept: AcceptKind): string {
  const v = value.trim();
  if (!v) return '';
  if (isDataUrl(v)) {
    const mime = v.slice(5, v.indexOf(';')) || (accept === 'audio' ? 'audio' : 'image');
    const b64 = v.includes(',') ? v.split(',')[1] || '' : '';
    const bytes = Math.round((b64.length * 3) / 4);
    const size =
      bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const kind = mime.includes('audio') ? '오디오' : mime.includes('image') || mime.includes('icon') ? '이미지' : '파일';
    return `업로드됨 · ${kind} · ${size}`;
  }
  try {
    const u = new URL(v, typeof window !== 'undefined' ? window.location.origin : 'https://local');
    const name = u.pathname.split('/').filter(Boolean).pop() || '파일';
    return `업로드됨 · ${decodeURIComponent(name)}`;
  } catch {
    return '업로드됨 · 파일';
  }
}

function defaultAccept(accept: AcceptKind) {
  if (accept === 'audio') return 'audio/*';
  if (accept === 'image') return 'image/*';
  return '*/*';
}

export function FileUploadField({
  label,
  value,
  onChange,
  accept = 'image',
  acceptAttr,
  folder = 'site/uploads',
  asDataUrl = false,
  changeLabel = '파일 변경',
  emptyLabel = '📁 파일 선택',
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const summary = useMemo(() => summarizeValue(value, accept), [value, accept]);
  const hasValue = Boolean(value?.trim());
  const isImage = accept === 'image' || /^data:image/i.test(value) || /\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(value);
  const isAudio = accept === 'audio' || /^data:audio/i.test(value) || /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(value);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      if (asDataUrl) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('파일 읽기 실패'));
          reader.readAsDataURL(file);
        });
        onChange(dataUrl);
        return;
      }
      if (accept === 'audio') {
        const normalized = normalizeUploadFile(file, 'audio/mpeg');
        onChange(await uploadMediaFile(normalized, folder));
      } else {
        const normalized = normalizeUploadFile(file);
        onChange(await uploadImageFile(normalized, folder));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`lh-file-upload${className ? ` ${className}` : ''}`}>
      {label ? <span className="lh-file-upload__label">{label}</span> : null}

      {hasValue ? (
        <div className="lh-file-upload__card">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="lh-file-upload__thumb" referrerPolicy="no-referrer" />
          ) : isAudio ? (
            <div className="lh-file-upload__audio">
              <span className="lh-file-upload__audio-icon" aria-hidden>
                ▶
              </span>
              <audio controls src={value} className="lh-file-upload__audio-el" />
            </div>
          ) : null}
          <div className="lh-file-upload__meta">
            <span className="lh-file-upload__summary">{summary}</span>
            <div className="lh-file-upload__actions">
              <button
                type="button"
                className="btn-edit"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? '업로드 중…' : changeLabel}
              </button>
              <button type="button" className="btn-del" disabled={busy} onClick={() => onChange('')}>
                제거
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="file-input-label lh-file-upload__pick"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? '업로드 중…' : emptyLabel}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr || defaultAccept(accept)}
        className="lh-file-upload__file"
        disabled={busy}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        className="lh-file-upload__url-toggle"
        onClick={() => {
          setUrlOpen((v) => !v);
          if (!urlOpen) setUrlDraft(isDataUrl(value) ? '' : value);
        }}
      >
        {urlOpen ? 'URL 입력 닫기' : 'URL로 입력하기'}
      </button>
      {urlOpen ? (
        <div className="lh-file-upload__url-row">
          <input
            className="form-input"
            placeholder="https://…"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
          />
          <button
            type="button"
            className="btn-save"
            style={{ padding: '6px 10px' }}
            onClick={() => {
              onChange(urlDraft.trim());
              setUrlOpen(false);
            }}
          >
            적용
          </button>
        </div>
      ) : null}
    </div>
  );
}
