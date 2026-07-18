import type { ChangeEvent } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
};

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  className = '',
}: Props) {
  return (
    <div className={`form-group lh-textarea-field${className ? ` ${className}` : ''}`}>
      <label className="form-label">{label}</label>
      <textarea
        className="form-input"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        style={{ resize: 'vertical' }}
      />
    </div>
  );
}
