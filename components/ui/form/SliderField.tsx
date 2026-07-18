'use client';

type Props = {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 값 표시 문자열. 미지정 시 value 그대로 */
  displayValue?: string;
  hint?: string;
  className?: string;
  'aria-label'?: string;
};

export function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  displayValue,
  hint,
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const span = max - min || 1;
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));

  return (
    <div className={`lh-slider-field${className ? ` ${className}` : ''}`}>
      {label || displayValue !== undefined ? (
        <div className="lh-slider-field__head">
          {label ? <span className="lh-slider-field__label">{label}</span> : <span />}
          {displayValue !== undefined ? (
            <span className="lh-slider-field__value">{displayValue}</span>
          ) : null}
        </div>
      ) : null}
      <div className="lh-slider-field__row">
        <input
          type="range"
          className="lh-slider-field__input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          style={{ ['--lh-slider-pct' as string]: `${pct}%` }}
        />
      </div>
      {hint ? <p className="lh-field-label">{hint}</p> : null}
    </div>
  );
}
