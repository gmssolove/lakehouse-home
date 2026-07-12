'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function useRecordsComposer() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function openComposer() {
    setLeaving(false);
    setOpen(true);
  }

  function closeComposer() {
    if (!open || leaving) return;
    setLeaving(true);
  }

  function finishClose() {
    if (!leaving) return;
    setOpen(false);
    setLeaving(false);
  }

  useEffect(() => {
    if (!open || leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeComposer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close on Escape while open
  }, [open, leaving]);

  return { open, leaving, openComposer, closeComposer, finishClose };
}

type ShellProps = {
  heading: string;
  sub: string;
  isAdmin: boolean;
  modalLabel: string;
  modalTitle: string;
  open: boolean;
  leaving: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCloseFinished: () => void;
  children: ReactNode;
  footer: ReactNode;
  writeLabel?: string;
  /** 제목·글쓰기 버튼 숨기고 모달만 */
  headless?: boolean;
};

/** 일기와 동일한 글 쓰기 버튼 + 모달 셸 */
export function RecordsWriteShell({
  heading,
  sub,
  isAdmin,
  modalLabel,
  modalTitle,
  open,
  leaving,
  onOpen,
  onClose,
  onCloseFinished,
  children,
  footer,
  writeLabel = '+ 글 쓰기',
  headless = false,
}: ShellProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const modal =
    isAdmin && open ? (
      <div
        className={`lh-diary__modal${leaving ? ' is-out' : ' is-in'}`}
        role="dialog"
        aria-modal="true"
        aria-label={modalLabel}
      >
        <button type="button" className="lh-diary__modal-backdrop" aria-label="닫기" onClick={onClose} />
        <div
          className="lh-diary__modal-panel"
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (leaving) onCloseFinished();
          }}
        >
          <div className="lh-diary__modal-top">
            <strong>{modalTitle}</strong>
            <button type="button" className="lh-diary__modal-close" aria-label="닫기" onClick={onClose}>
              ×
            </button>
          </div>
          <section className="lh-diary__composer lh-rec-write__composer">
            <div className="lh-rec-write__fields">{children}</div>
            <div className="lh-diary__composer-bar">
              <div className="lh-diary__composer-tools" />
              <div className="lh-diary__composer-actions">{footer}</div>
            </div>
          </section>
        </div>
      </div>
    ) : null;

  return (
    <>
      {!headless ? (
        <div className="lh-diary__headbar">
          <div className="lh-diary__titles">
            <h2 className="page-heading">{heading}</h2>
            <div className="page-sub">{sub}</div>
          </div>
          {isAdmin ? (
            <button type="button" className="lh-diary__write-btn" onClick={onOpen}>
              {writeLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
