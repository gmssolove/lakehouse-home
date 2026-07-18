'use client';

import { ImageUploadCrop } from '@/components/ui/form/ImageUploadCrop';
import type { ImageFrame } from '@/lib/types/character';

const ASPECT_OPTIONS = [
  { value: '1 / 1', label: '1:1' },
  { value: '4 / 3', label: '4:3' },
  { value: '3 / 4', label: '3:4' },
  { value: '16 / 9', label: '16:9' },
  { value: '9 / 16', label: '9:16' },
  { value: '3 / 2', label: '3:2' },
  { value: '2 / 3', label: '2:3' },
] as const;

export const INTRO_DEFAULT_ASPECT = '1 / 1';
export const INTRO_DEFAULT_SIZE = 100;

function clampSize(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return INTRO_DEFAULT_SIZE;
  return Math.min(140, Math.max(60, Math.round(n)));
}

type Props = {
  label?: string;
  src?: string;
  frame?: ImageFrame;
  /** CSS aspect-ratio 문자열 — 예: "1 / 1" */
  aspectRatio?: string;
  /** 표시 크기 % (60~140) */
  size?: number;
  folder?: string;
  onChange: (next: {
    src?: string;
    frame?: ImageFrame;
    aspectRatio?: string;
    size?: number;
  }) => void;
};

export function IntroSectionImageField({
  label = '일러스트',
  src = '',
  frame,
  aspectRatio = INTRO_DEFAULT_ASPECT,
  size = INTRO_DEFAULT_SIZE,
  folder = 'pair/intro',
  onChange,
}: Props) {
  const ratio = aspectRatio.trim() || INTRO_DEFAULT_ASPECT;
  const sizePct = clampSize(size);
  const aspectLabel = ASPECT_OPTIONS.find((o) => o.value === ratio)?.label ?? ratio.replace(/\s/g, '');
  const selectValue = ASPECT_OPTIONS.some((o) => o.value === ratio) ? ratio : INTRO_DEFAULT_ASPECT;

  const emit = (patch: {
    src?: string;
    frame?: ImageFrame;
    aspectRatio?: string;
    size?: number;
  }) => {
    onChange({
      src: patch.src !== undefined ? patch.src : src || undefined,
      frame: patch.frame !== undefined ? patch.frame : frame,
      aspectRatio: patch.aspectRatio ?? ratio,
      size: patch.size ?? sizePct,
    });
  };

  return (
    <div
      className="pair-intro-img-field"
      style={{ ['--intro-edit-aspect' as string]: ratio }}
    >
      <div className="pair-intro-img-field__row">
        <div className="pair-intro-img-field__aspect">
          <label className="form-label" htmlFor={`intro-aspect-${label}`}>
            비율
          </label>
          <select
            id={`intro-aspect-${label}`}
            className="form-input"
            style={{ width: 100, fontSize: 12 }}
            value={selectValue}
            onChange={(e) => {
              /* 비율 바뀌면 크롭 리셋 — 편집 박스와 표시가 어긋나지 않게 */
              emit({ aspectRatio: e.target.value, frame: undefined });
            }}
          >
            {ASPECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="pair-intro-img-field__size">
          <label className="form-label" htmlFor={`intro-size-${label}`}>
            크기 {sizePct}%
          </label>
          <input
            id={`intro-size-${label}`}
            type="range"
            min={60}
            max={140}
            step={1}
            value={sizePct}
            onChange={(e) => emit({ size: Number(e.target.value) })}
          />
        </div>
      </div>
      <ImageUploadCrop
        label={label}
        value={src || ''}
        folder={folder}
        frame={frame}
        onFrameChange={(next) => emit({ frame: next })}
        onChange={(url) => emit({ src: url || undefined, frame: undefined })}
        aspectRatio={ratio}
        fit="cover"
        pos="center center"
        allowWheelZoom
        showBottomBlur={false}
        showClear
        frameClassName="pair-intro-img-field__frame"
        urlPlaceholder="또는 URL (선택)"
        hint={`선택 사항 · 비율 ${aspectLabel} · 크기 ${sizePct}%`}
      />
    </div>
  );
}
