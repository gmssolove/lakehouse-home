'use client';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id?: string;
};

export function LakeToggle({ checked, onChange, label, id }: Props) {
  return (
    <div className="lake-toggle">
      <button
        type="button"
        id={id}
        className={`lake-toggle__track${checked ? ' is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className="lake-toggle__thumb" />
      </button>
      <span className="lake-toggle__label">{label}</span>
    </div>
  );
}
