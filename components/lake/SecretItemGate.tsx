'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
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
  children: ReactNode;
  lockedLabel?: string;
  /**
   * true: 잠겨 있어도 children(제목 등)을 그대로 보여주고, 클릭 시 게이트.
   * TRPG 세션로그 목록처럼 가리지 않을 때 사용.
   */
  showWhenLocked?: boolean;
  /** showWhenLocked + 잠금 해제 직후 (패널 이동 등) */
  onUnlocked?: () => void;
};

export function SecretItemGate({
  scope,
  item,
  isAdmin,
  loggedIn,
  onRequestLogin,
  children,
  lockedLabel = '비밀글 — 탭하여 열람',
  showWhenLocked = false,
  onUnlocked,
}: Props) {
  const { accessSettings } = useSiteContent();
  const expectedPw = resolveItemPassword(scope, item, accessSettings);
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(() =>
    isLakeItemUnlocked(scope, item.id, expectedPw),
  );

  useEffect(() => {
    setUnlocked(isLakeItemUnlocked(scope, item.id, expectedPw));
  }, [scope, item.id, loggedIn, expectedPw]);

  const gateModal = (
    <LakeAccessGateModal
      open={open}
      scope={scope}
      item={item}
      accessSettings={accessSettings}
      backdrop="popup"
      loggedIn={loggedIn}
      onClose={() => setOpen(false)}
      onRequestLogin={() => {
        setOpen(false);
        onRequestLogin();
      }}
      onSuccess={() => {
        setUnlocked(true);
        setOpen(false);
        onUnlocked?.();
      }}
      verifyOverride={(input) => {
        if (!verifyLakeAccessPassword(scope, input, accessSettings, item)) return false;
        unlockLakeItem(scope, item.id, expectedPw);
        return true;
      }}
    />
  );

  if (isAdmin || !item.secret || unlocked) return <>{children}</>;

  if (showWhenLocked) {
    const child = Children.only(children);
    const gated = isValidElement(child)
      ? cloneElement(child as ReactElement<{ onClick?: (e: MouseEvent) => void }>, {
          onClick: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          },
        })
      : (
          <button type="button" className="lh-secret-lock" onClick={() => setOpen(true)}>
            {children}
          </button>
        );
    return (
      <>
        {gated}
        {gateModal}
      </>
    );
  }

  return (
    <>
      <button type="button" className="lh-secret-lock" onClick={() => setOpen(true)}>
        <SecretLockBadge />
        <span className="lh-secret-lock__hint">{lockedLabel}</span>
      </button>
      {gateModal}
    </>
  );
}
