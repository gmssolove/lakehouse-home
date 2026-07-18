'use client';

import { useId, useState, type ReactNode } from 'react';

type Props = {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  className?: string;
};

export function AccordionSection({
  title,
  children,
  defaultOpen = true,
  open: openProp,
  onToggle,
  className = '',
}: Props) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? Boolean(openProp) : uncontrolled;
  const panelId = useId();

  function handleToggle() {
    if (controlled) onToggle?.();
    else setUncontrolled((v) => !v);
  }

  return (
    <section className={`lh-form-accord${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="lh-form-accord__head"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{title}</span>
        <span className="lh-form-accord__chev" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="lh-form-accord__body" role="region">
          {children}
        </div>
      ) : null}
    </section>
  );
}
