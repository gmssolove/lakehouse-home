'use client';

import { useEffect, useRef, useState } from 'react';
import {
  resolveScopePassword,
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

const EXIT_MS = 240;

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
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const mountedRef = useRef(open);
  mountedRef.current = mounted;
  const inputRef = useRef<HTMLInputElement>(null);

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
      setPassword('');
      setError('');
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted || leaving) return;
    if (loggedIn) {
      inputRef.current?.focus();
    }
  }, [loggedIn, open, mounted, leaving]);

  useEffect(() => {
    if (!mounted || leaving) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mounted, leaving]);

  if (!mounted) return null;

  const rawDesc = description ?? '로그인 후 비밀번호를 입력해야 열람할 수 있습니다.';
  const shownDesc = loggedIn ? rawDesc.replace(/로그인\s*후\s*/g, '') : rawDesc;

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
    if (!verifyOverride) unlockLakeAccess(scope, resolveScopePassword(scope, accessSettings));
    setPassword('');
    setError('');
    onSuccess();
  }

  function handleLogin() {
    onRequestLogin();
  }

  const modal = (
    <div
      className={`oc-profile-gate oc-profile-gate--${backdrop}${leaving ? ' is-leaving' : ' is-entering'}`}
      role="dialog"
      aria-modal="true"
      aria-label="접근 잠금"
    >
      {backdrop !== 'clear' ? (
        <button type="button" className="oc-profile-gate-backdrop" aria-label="닫기" onClick={onClose} />
      ) : null}
      <div className="oc-profile-gate-box">
        <div className="oc-profile-gate-title">{title ?? 'Archive Access'}</div>
        <p className="oc-profile-gate-desc">{shownDesc}</p>
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

  return modal;
}
