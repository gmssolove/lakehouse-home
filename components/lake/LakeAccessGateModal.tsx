'use client';

import { useEffect, useRef, useState } from 'react';
import {
  unlockLakeAccess,
  verifyLakeAccessPassword,
  type LakeAccessScope,
} from '@/lib/lake/accessGate';
import type { SiteAccessSettings, WithSecret } from '@/lib/types/secret-content';

type Props = {
  open: boolean;
  scope: LakeAccessScope;
  title?: string;
  description?: string;
  loggedIn: boolean;
  accessSettings?: Partial<SiteAccessSettings>;
  item?: WithSecret;
  /** dim = 어두운 전체 배경, clear = 배경 없음(박스만), popup = 가벼운 스크림 + 팝업 */
  backdrop?: 'dim' | 'clear' | 'popup';
  onClose: () => void;
  onSuccess: () => void;
  onRequestLogin: () => void;
  /** 항목별 잠금 해제 등 커스텀 처리 */
  verifyOverride?: (input: string) => boolean;
};

export function LakeAccessGateModal({
  open,
  scope,
  title,
  description,
  loggedIn,
  accessSettings,
  item,
  backdrop = 'popup',
  onClose,
  onSuccess,
  onRequestLogin,
  verifyOverride,
}: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError('');
      return;
    }
    if (loggedIn) {
      inputRef.current?.focus();
    }
  }, [loggedIn, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  function submit() {
    if (!loggedIn) {
      onRequestLogin();
      return;
    }
    const ok = verifyOverride
      ? verifyOverride(password)
      : verifyLakeAccessPassword(scope, password, accessSettings, item);
    if (!ok) {
      setError('비밀번호가 올바르지 않습니다.');
      return;
    }
    if (!verifyOverride) unlockLakeAccess(scope);
    setPassword('');
    setError('');
    onSuccess();
  }

  function handleLogin() {
    onRequestLogin();
  }

  return (
    <div
      className={`oc-profile-gate oc-profile-gate--${backdrop}`}
      role="dialog"
      aria-modal="true"
      aria-label="접근 잠금"
    >
      {backdrop !== 'clear' ? (
        <button type="button" className="oc-profile-gate-backdrop" aria-label="닫기" onClick={onClose} />
      ) : null}
      <div className="oc-profile-gate-box">
        <div className="oc-profile-gate-title">{title ?? 'Archive Access'}</div>
        <p className="oc-profile-gate-desc">
          {description ?? '로그인 후 비밀번호를 입력해야 열람할 수 있습니다.'}
        </p>
        {!loggedIn ? (
          <>
            <p className="oc-profile-gate-error" style={{ marginBottom: 12 }}>
              로그인이 필요합니다.
            </p>
            <div className="oc-profile-gate-actions">
              <button type="button" className="oc-profile-gate-cancel" onClick={onClose}>
                취소
              </button>
              <button type="button" className="oc-profile-gate-submit" onClick={handleLogin}>
                로그인
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              className="form-input oc-profile-gate-input"
              type="password"
              autoComplete="off"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            {error ? <p className="oc-profile-gate-error">{error}</p> : null}
            <div className="oc-profile-gate-actions">
              <button type="button" className="oc-profile-gate-cancel" onClick={onClose}>
                취소
              </button>
              <button type="button" className="oc-profile-gate-submit" onClick={submit}>
                확인
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
