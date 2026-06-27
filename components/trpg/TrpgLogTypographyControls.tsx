type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
};

function TypographyStepper({ label, value, min, max, step, onChange }: StepperProps) {
  function clamp(n: number) {
    return Math.min(max, Math.max(min, n));
  }

  return (
    <div className="trpg-edit-field">
      <label>{label}</label>
      <div className="trpg-edit-stepper">
        <button
          type="button"
          className="trpg-edit-stepper__btn"
          aria-label={`${label} 감소`}
          onClick={() => onChange(clamp(Number((value - step).toFixed(2))))}
        >
          −
        </button>
        <input
          className="trpg-edit-stepper__value"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        />
        <button
          type="button"
          className="trpg-edit-stepper__btn"
          aria-label={`${label} 증가`}
          onClick={() => onChange(clamp(Number((value + step).toFixed(2))))}
        >
          +
        </button>
      </div>
    </div>
  );
}

type Props = {
  fontSize: number;
  lineHeight: number;
  onChange: (patch: { logFontSize?: number; logLineHeight?: number }) => void;
  className?: string;
};

export function TrpgLogTypographyControls({ fontSize, lineHeight, onChange, className }: Props) {
  return (
    <div className={`trpg-log-typography trpg-edit-typography${className ? ` ${className}` : ''}`}>
      <TypographyStepper
        label="글자 크기 (px)"
        min={10}
        max={24}
        step={1}
        value={fontSize}
        onChange={(logFontSize) => onChange({ logFontSize })}
      />
      <TypographyStepper
        label="줄간격"
        min={1}
        max={3}
        step={0.05}
        value={lineHeight}
        onChange={(logLineHeight) => onChange({ logLineHeight })}
      />
    </div>
  );
}
