'use client';

import type { AuVersion, OcCharacter } from '@/lib/types/character';

type Props = {
  character: OcCharacter;
  auIdx: number;
  onAuChange: (au: number) => void;
  disabled?: boolean;
};

function thumbSrc(character: OcCharacter, au?: AuVersion) {
  return (au?.img || character.img || '').trim();
}

export function OcAuPicker({ character, auIdx, onAuChange, disabled = false }: Props) {
  const versions = character.auVersions ?? [];
  if (!versions.length) return null;

  const defaultSrc = thumbSrc(character);

  return (
    <div
      className={`oc-au-picker${disabled ? ' is-disabled' : ''}`}
      role="toolbar"
      aria-label="AU 버전"
      aria-disabled={disabled || undefined}
    >
      <button
        type="button"
        className={`oc-au-picker-btn${auIdx === -1 ? ' active' : ''}`}
        aria-label="기본 이미지"
        aria-pressed={auIdx === -1}
        title="Default"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          onAuChange(-1);
        }}
      >
        {defaultSrc ? <img src={defaultSrc} alt="" /> : <span className="oc-au-picker-fallback">D</span>}
      </button>
      {versions.map((au, i) => {
        const src = thumbSrc(character, au);
        return (
          <button
            key={i}
            type="button"
            className={`oc-au-picker-btn${auIdx === i ? ' active' : ''}`}
            aria-label={au.label || `AU ${i + 1}`}
            aria-pressed={auIdx === i}
            title={au.label || `Ver.${i + 1}`}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              onAuChange(i);
            }}
          >
            {src ? (
              <img src={src} alt="" style={{ objectPosition: au.imgPos || 'center top' }} />
            ) : (
              <span className="oc-au-picker-fallback">{(au.label || 'A').slice(0, 1)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
