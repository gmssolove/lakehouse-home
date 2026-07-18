'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import {
  isLakeAccessUnlocked,
  resolveScopePassword,
  unlockLakeAccess,
  verifyLakeAccessPassword,
  type LakeAccessScope,
} from '@/lib/lake/accessGate';
import { useSiteContent } from '@/lib/hooks/useSiteContent';

type Props = {
  scope: LakeAccessScope;
  isAdmin: boolean;
  loggedIn: boolean;
  onRequestLogin: () => void;
  /** 이 메뉴가 현재 열려 있는가 — 열릴 때 잠겨 있으면 자동으로 비번을 묻는다 */
  active?: boolean;
  children: ReactNode;
  label?: string;
};

/**
 * 스코프(메뉴) 단위 잠금. 관리자 「접근·비밀번호」에서 해당 섹션에 비밀번호를
 * 지정(=잠금)하면, 비로그인/미해제 사용자는 메뉴 내용 자체를 볼 수 없고
 * 비밀번호를 입력해야 열람할 수 있다. (비밀번호가 없으면 공개 메뉴)
 */
export function LakeScopeGate({
  scope,
  isAdmin,
  loggedIn,
  onRequestLogin,
  active = true,
  children,
  label = '잠긴 메뉴 — 비밀번호를 입력하세요',
}: Props) {
  const { accessSettings } = useSiteContent();
  const scopePw = resolveScopePassword(scope, accessSettings);
  const locked = !!scopePw;
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isLakeAccessUnlocked(scope, scopePw));

  useEffect(() => {
    setUnlocked(isLakeAccessUnlocked(scope, scopePw));
  }, [scope, scopePw, loggedIn]);

  // 메뉴가 열릴 때 잠겨 있으면 바로 비번 프롬프트를 띄운다.
  useEffect(() => {
    if (active && locked && !isAdmin && !unlocked) setOpen(true);
    else if (!active) setOpen(false);
  }, [active, locked, isAdmin, unlocked]);

  if (isAdmin || !locked || unlocked) return <>{children}</>;

  return (
    <div className="lh-scope-gate">
      <button
        type="button"
        className="lh-secret-lock lh-scope-gate__lock"
        onClick={() => setOpen(true)}
      >
        <SecretLockBadge />
        <span className="lh-secret-lock__hint">{label}</span>
      </button>
      <LakeAccessGateModal
        open={open}
        scope={scope}
        accessSettings={accessSettings}
        loggedIn={loggedIn}
        onClose={() => setOpen(false)}
        onRequestLogin={() => {
          setOpen(false);
          onRequestLogin();
        }}
        onSuccess={() => {
          setUnlocked(true);
          setOpen(false);
        }}
        verifyOverride={(input) => {
          if (!verifyLakeAccessPassword(scope, input, accessSettings)) return false;
          unlockLakeAccess(scope, scopePw);
          return true;
        }}
      />
    </div>
  );
}
