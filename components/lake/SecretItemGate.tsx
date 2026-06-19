'use client';

import { useState } from 'react';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import {
  isLakeItemUnlocked,
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
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isLakeItemUnlocked(scope, item.id));

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
        loggedIn={loggedIn}
        onClose={() => setOpen(false)}
        onRequestLogin={onRequestLogin}
        onSuccess={() => {
          setUnlocked(true);
          setOpen(false);
        }}
        verifyOverride={(input) => {
          if (!verifyLakeAccessPassword(scope, input, accessSettings, item)) return false;
          unlockLakeItem(scope, item.id);
          return true;
        }}
      />
    </>
  );
}
