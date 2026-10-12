'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { lakeNavigate } from '@/lib/lake/routeTransition';

type Props = {
  title: string;
  active: 'oc' | 'pair';
  back?: ReactNode;
};

export function LakeArchiveTopbar({ title, active, back }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    router.prefetch('/oc');
    router.prefetch('/pair');
    router.prefetch('/');
  }, [router]);

  function go(href: string) {
    lakeNavigate(router, href, pathname || '/');
  }

  return (
    <nav className="oc-topbar lh-archive-topbar">
      {back ?? (
        <button type="button" className="nav-back" onClick={() => go('/')}>
          ← back
        </button>
      )}
      <div className="nav-title">{title}</div>
      <ul className="nav-links">
        <li className={active === 'oc' ? 'active' : undefined}>
          <button type="button" onClick={() => go('/oc')}>
            OC
          </button>
        </li>
        <li className={active === 'pair' ? 'active' : undefined}>
          <button type="button" onClick={() => go('/pair')}>
            Pair
          </button>
        </li>
      </ul>
    </nav>
  );
}
