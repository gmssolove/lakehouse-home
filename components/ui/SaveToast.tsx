'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type SaveToastContextValue = {
  showSaveToast: (message?: string) => void;
  showDeleteToast: (message?: string) => void;
};

const SaveToastContext = createContext<SaveToastContextValue | null>(null);

export function SaveToastProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('저장되었습니다');
  const timerRef = useRef<number | undefined>(undefined);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), 1800);
  }, []);

  const showSaveToast = useCallback((msg = '저장되었습니다') => show(msg), [show]);
  const showDeleteToast = useCallback((msg = '삭제되었습니다') => show(msg), [show]);

  return (
    <SaveToastContext.Provider value={{ showSaveToast, showDeleteToast }}>
      {children}
      <div
        className={`lh-save-toast${visible ? ' is-visible' : ''}`}
        role="status"
        aria-live="polite"
        aria-hidden={!visible}
      >
        {message}
      </div>
    </SaveToastContext.Provider>
  );
}

export function useSaveToast() {
  const ctx = useContext(SaveToastContext);
  if (!ctx) throw new Error('useSaveToast must be used within SaveToastProvider');
  return ctx;
}
