import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  addLabel: string;
  onAdd: () => void;
  addDisabled?: boolean;
  className?: string;
};

export function RepeatableList({
  children,
  addLabel,
  onAdd,
  addDisabled = false,
  className = '',
}: Props) {
  return (
    <div className={`lh-repeatable${className ? ` ${className}` : ''}`}>
      <div className="lh-repeatable__items">{children}</div>
      <button type="button" className="lh-repeatable__add" onClick={onAdd} disabled={addDisabled}>
        {addLabel}
      </button>
    </div>
  );
}
