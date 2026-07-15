'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

const EXIT_MS = 260;

export function LakeEditModal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  actions,
  className,
  bodyClassName,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const mountedRef = useRef(open);
  mountedRef.current = mounted;

  useEffect(() => {
    if (open) {
      mountedRef.current = true;
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mountedRef.current) return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      mountedRef.current = false;
      setMounted(false);
      setLeaving(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`lake-edit-modal${leaving ? ' is-leaving' : ' is-entering'}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" className="lake-edit-modal__backdrop" aria-label="닫기" onClick={onClose} />
      <div className="lake-edit-modal__dialog">
        <header className="lake-edit-modal__head">
          <div className="lake-edit-modal__head-left">
            {eyebrow ? <p className="lake-edit-modal__eyebrow">{eyebrow}</p> : null}
            <h2 className="lake-edit-modal__title">{title}</h2>
          </div>
          <div className="lake-edit-modal__head-actions">
            {actions}
            <button type="button" className="lake-edit-modal__close" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          </div>
        </header>
        <div ref={bodyRef} className={`lake-edit-modal__body lh-scroll${bodyClassName ? ` ${bodyClassName}` : ''}`}>
          {children}
        </div>
        <button
          type="button"
          className="oc-edit-scroll-top"
          aria-label="맨 위로"
          onClick={() => bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
