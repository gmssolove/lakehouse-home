'use client';

import { useEffect, useState } from 'react';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import {
  isLakeItemUnlocked,
  resolveItemPassword,
  unlockLakeItem,
  verifyLakeAccessPassword,
  type LakeAccessScope,
} from '@/lib/lake/accessGate';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { WithSecret } from '@/lib/types/secret-content';

type Props = {
  scope: LakeAccessScope;
  item: WithSecret & { id: string };
  isAdmin: boolean;
  loggedIn: boolean;
  onRequestLogin: () => void;
  children: React.ReactNode;
  lockedLabel?: string;
};

export function SecretItemGate({
  scope,
  item,
  isAdmin,
  loggedIn,
  onRequestLogin,
  children,
  lockedLabel = '비밀글 — 탭하여 열람',
}: Props) {
  const { accessSettings } = useSiteContent();
  const expectedPw = resolveItemPassword(scope, item, accessSettings);
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(() =>
    isLakeItemUnlocked(scope, item.id, expectedPw),
  );

  /* 저장된 unlock 재확인 (비번 변경 시 재잠금) */
  useEffect(() => {
    setUnlocked(isLakeItemUnlocked(scope, item.id, expectedPw));
  }, [scope, item.id, loggedIn, expectedPw]);

  if (isAdmin || !item.secret || unlocked) return <>{children}</>;

  return (
    <>
      <button type="button" className="lh-secret-lock" onClick={() => setOpen(true)}>
        <SecretLockBadge />
        <span className="lh-secret-lock__hint">{lockedLabel}</span>
      </button>
      <LakeAccessGateModal
        open={open}
        scope={scope}
        item={item}
        accessSettings={accessSettings}
        backdrop="clear"
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
          if (!verifyLakeAccessPassword(scope, input, accessSettings, item)) return false;
          unlockLakeItem(scope, item.id, expectedPw);
          return true;
        }}
      />
    </>
  );
}
