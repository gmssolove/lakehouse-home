'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type DialogButton = {
  label: string;
  value: boolean;
  danger?: boolean;
};

type DialogOptions = {
  title?: string;
  message: string;
  buttons?: DialogButton[];
};

type LakeDialogContextValue = {
  confirm: (message: string, title?: string) => Promise<boolean>;
  alert: (message: string, title?: string) => Promise<void>;
};

const LakeDialogContext = createContext<LakeDialogContextValue | null>(null);

export function LakeDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(DialogOptions & { resolve: (v: boolean) => void }) | null>(
    null,
  );

  const close = useCallback((value: boolean) => {
    setDialog((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const openDialog = useCallback((opts: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...opts, resolve });
    });
  }, []);

  const confirm = useCallback(
    (message: string, title = '확인') =>
      openDialog({
        title,
        message,
        buttons: [
          { label: '취소', value: false },
          { label: '확인', value: true, danger: true },
        ],
      }),
    [openDialog],
  );

  const alert = useCallback(
    async (message: string, title = '알림') => {
      await openDialog({
        title,
        message,
        buttons: [{ label: '확인', value: true }],
      });
    },
    [openDialog],
  );

  const buttons = dialog?.buttons ?? [{ label: '확인', value: true }];

  return (
    <LakeDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && (
        <div
          className="lh-dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div className="lh-dialog-box" role="dialog" aria-modal="true">
            <div className="lh-dialog-title">{dialog.title || '확인'}</div>
            <div className="lh-dialog-message">{dialog.message}</div>
            <div className="lh-dialog-actions">
              {buttons.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  className={btn.danger ? 'danger' : undefined}
                  onClick={() => close(btn.value)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </LakeDialogContext.Provider>
  );
}

export function useLakeDialog() {
  const ctx = useContext(LakeDialogContext);
  if (!ctx) throw new Error('useLakeDialog must be used within LakeDialogProvider');
  return ctx;
}
