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
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
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

  return (
    <div className="oc-profile-gate" role="dialog" aria-modal="true" aria-label="접근 잠금">
      <button type="button" className="oc-profile-gate-backdrop" aria-label="닫기" onClick={onClose} />
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
              <button type="button" className="oc-profile-gate-submit" onClick={onRequestLogin}>
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
