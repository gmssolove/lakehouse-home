'use client';

import { useEffect, useRef, useState } from 'react';
import { verifyOcProfilePassword, unlockOcProfile } from '@/lib/oc/profileAccess';

type Props = {
  open: boolean;
  characterName?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function OcProfilePasswordModal({ open, characterName, onClose, onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError('');
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

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
    if (!verifyOcProfilePassword(password)) {
      setError('비밀번호가 올바르지 않습니다.');
      return;
    }
    unlockOcProfile();
    setPassword('');
    setError('');
    onSuccess();
  }

  return (
    <div className="oc-profile-gate" role="dialog" aria-modal="true" aria-label="프로필 잠금">
      <button type="button" className="oc-profile-gate-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="oc-profile-gate-box">
        <div className="oc-profile-gate-title">Profile Access</div>
        <p className="oc-profile-gate-desc">
          {characterName ? (
            <>
              <strong>{characterName}</strong> 프로필을 보려면 비밀번호를 입력하세요.
            </>
          ) : (
            <>프로필을 보려면 비밀번호를 입력하세요.</>
          )}
        </p>
        <input
          ref={inputRef}
          className="form-input oc-profile-gate-input"
          type="password"
          inputMode="numeric"
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
      </div>
    </div>
  );
}
