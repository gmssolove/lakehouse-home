'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import {
  HOME_RECORDS_LABELS,
  HOME_RECORDS_TABS,
  type HomeRecordsTabId,
} from '@/lib/records/sections';
import { updateNickname, type UserProfile } from '@/lib/auth/userProfile';
import { lakeNavigate, clearLakeRouteClasses, getLakePortalRoot } from '@/lib/lake/routeTransition';

export type HomePageId =
  | 'main'
  | 'notice'
  | 'charArchive'
  | 'universe'
  | 'trpg'
  | 'guest'
  | 'banner'
  | HomeRecordsTabId
  | 'admin';

type Props = {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  activePage: HomePageId;
  onPageChange: (page: HomePageId) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onNicknameUpdated?: () => void | Promise<void>;
};

type PageEntry = {
  kind: 'page';
  id: Exclude<HomePageId, 'admin' | HomeRecordsTabId>;
  label: string;
};

type GroupEntry = {
  kind: 'group';
  id: 'character' | 'records';
  label: string;
};

type NavEntry = PageEntry | GroupEntry;

const NAV_ENTRIES: NavEntry[] = [
  { kind: 'page', id: 'main', label: 'Home' },
  { kind: 'page', id: 'notice', label: 'Notice' },
  { kind: 'group', id: 'records', label: 'Records' },
  { kind: 'group', id: 'character', label: 'Character' },
  { kind: 'page', id: 'universe', label: 'Universe' },
  { kind: 'page', id: 'trpg', label: 'TRPG' },
  { kind: 'page', id: 'guest', label: 'Guest' },
  { kind: 'page', id: 'banner', label: 'Banner' },
];

const SUB_CLOSE_MS = 320;

function useSubmenu() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const subRef = useRef<HTMLDivElement>(null);
  const mounted = open || closing;

  useLayoutEffect(() => {
    if (!open || closing) {
      setEntered(false);
      return;
    }
    setEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open, closing]);

  useEffect(() => {
    if (!closing) return;
    const el = subRef.current;
    if (!el) {
      setOpen(false);
      setClosing(false);
      return;
    }

    let done = false;
    const finishClose = () => {
      if (done) return;
      done = true;
      setOpen(false);
      setClosing(false);
      setEntered(false);
    };

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'grid-template-rows') return;
      finishClose();
    };

    el.addEventListener('transitionend', onTransitionEnd);
    const fallback = window.setTimeout(finishClose, SUB_CLOSE_MS + 80);

    return () => {
      el.removeEventListener('transitionend', onTransitionEnd);
      window.clearTimeout(fallback);
    };
  }, [closing]);

  function toggle() {
    if (open && !closing) {
      setEntered(false);
      setClosing(true);
      return;
    }
    if (!open && !closing) {
      setClosing(false);
      setOpen(true);
    }
  }

  function subClass(base: string) {
    const parts = [base];
    if (open || closing) parts.push('is-open');
    if (closing) parts.push('is-closing');
    else if (entered) parts.push('is-entered');
    return parts.join(' ');
  }

  return { open, expanded: mounted, closing, mounted, toggle, subClass, subRef };
}

function isRecordsTab(id: string): id is HomeRecordsTabId {
  return (HOME_RECORDS_TABS as readonly string[]).includes(id);
}

export function LeftNav({
  user,
  profile,
  isAdmin,
  activePage,
  onPageChange,
  onOpenAuth,
  onLogout,
  onNicknameUpdated,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const onHome = pathname === '/';
  const charMenu = useSubmenu();
  const recordsMenu = useSubmenu();
  const [ready, setReady] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const [nickError, setNickError] = useState<string | null>(null);
  const [nickSaving, setNickSaving] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName =
    profile?.nickname || user?.displayName || user?.email?.split('@')[0] || 'Guest';

  useEffect(() => {
    if (!editingNick) setNickDraft(displayName === 'Guest' ? '' : displayName);
  }, [displayName, editingNick]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = '';
    };
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [activePage, pathname]);

  function closeMobile() {
    setMobileOpen(false);
  }

  async function saveNickname() {
    if (!user || nickSaving) return;
    setNickSaving(true);
    setNickError(null);
    try {
      const err = await updateNickname(user, nickDraft);
      if (err) {
        setNickError(err);
        return;
      }
      setEditingNick(false);
      await onNicknameUpdated?.();
    } catch {
      setNickError('닉네임 저장에 실패했습니다.');
    } finally {
      setNickSaving(false);
    }
  }

  useLayoutEffect(() => {
    setPortalEl(getLakePortalRoot());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setReady(true);
      /* 잔여 lh-route-leaving 이 메뉴 pointer-events를 잠그는 경우 복구 */
      if (onHome) clearLakeRouteClasses();
    }, 20);
    return () => window.clearTimeout(t);
  }, [onHome]);

  useEffect(() => {
    router.prefetch('/oc');
    router.prefetch('/pair');
    router.prefetch('/');
  }, [router]);

  function isRecordsGroupActive() {
    return isRecordsTab(activePage) && onHome;
  }

  function isPageActive(id: HomePageId) {
    return activePage === id && onHome;
  }

  function goHomeTab(page: HomePageId) {
    if (!onHome) {
      lakeNavigate(router, `/?p=${page}`, pathname);
      return;
    }
    onPageChange(page);
  }

  function renderPage(entry: PageEntry) {
    const active = isPageActive(entry.id);
    return (
      <li key={entry.id} className={`rq-nav-row${active ? ' is-active' : ''}`}>
        <button
          type="button"
          className="rq-nav-item"
          aria-label={entry.label}
          onClick={() => {
            closeMobile();
            goHomeTab(entry.id);
          }}
        >
          <span className="rq-nav-label">{entry.label}</span>
        </button>
      </li>
    );
  }

  function renderGroup(entry: GroupEntry) {
    const isChar = entry.id === 'character';
    const menu = isChar ? charMenu : recordsMenu;
    const groupActive = isChar
      ? menu.open || (onHome && activePage === 'charArchive')
      : menu.open || isRecordsGroupActive();

    let subs: ReactNode = null;
    if (isChar) {
      subs = (
        <>
          <button
            type="button"
            className={`rq-nav-sub${pathname === '/oc' ? ' is-active' : ''}`}
            onClick={() => {
              closeMobile();
              lakeNavigate(router, '/oc', pathname);
            }}
          >
            OC
          </button>
          <button
            type="button"
            className={`rq-nav-sub${pathname === '/pair' ? ' is-active' : ''}`}
            onClick={() => {
              closeMobile();
              lakeNavigate(router, '/pair', pathname);
            }}
          >
            Pair
          </button>
          <button
            type="button"
            className={`rq-nav-sub${isPageActive('charArchive') ? ' is-active' : ''}`}
            onClick={() => {
              closeMobile();
              goHomeTab('charArchive');
            }}
          >
            Archive
          </button>
        </>
      );
    } else {
      subs = HOME_RECORDS_TABS.map((id) => (
        <button
          key={id}
          type="button"
          className={`rq-nav-sub${isPageActive(id) ? ' is-active' : ''}`}
          onClick={() => {
            closeMobile();
            goHomeTab(id);
          }}
        >
          {HOME_RECORDS_LABELS[id]}
        </button>
      ));
    }

    return (
      <li key={entry.id} className={`rq-nav-row rq-nav-row--group${groupActive ? ' is-open' : ''}`}>
        <button
          type="button"
          className="rq-nav-item"
          aria-label={entry.label}
          aria-expanded={menu.expanded}
          onClick={menu.toggle}
        >
          <span className="rq-nav-label">{entry.label}</span>
        </button>
        {menu.mounted ? (
          <div ref={menu.subRef} className={menu.subClass('rq-nav-subs')}>
            <div className="rq-nav-subs-inner">{subs}</div>
          </div>
        ) : null}
      </li>
    );
  }

  const panel = (
    <aside
      className={`rq-menu-panel${ready ? ' is-ready' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}
      aria-label="Site menu"
      id="lh-site-menu"
    >
      <button type="button" className="rq-menu-close" aria-label="메뉴 닫기" onClick={closeMobile}>
        ×
      </button>
      <div className="rq-menu-auth">
        {user && editingNick ? (
          <form
            className="rq-menu-auth__edit"
            onSubmit={(e) => {
              e.preventDefault();
              void saveNickname();
            }}
          >
            <input
              className="rq-menu-auth__input"
              value={nickDraft}
              onChange={(e) => setNickDraft(e.target.value)}
              placeholder="닉네임"
              maxLength={24}
              autoFocus
              disabled={nickSaving}
              aria-label="닉네임"
            />
            <button type="submit" className="rq-menu-auth__btn" disabled={nickSaving}>
              저장
            </button>
            <button
              type="button"
              className="rq-menu-auth__btn"
              disabled={nickSaving}
              onClick={() => {
                setEditingNick(false);
                setNickError(null);
              }}
            >
              취소
            </button>
            {nickError ? <span className="rq-menu-auth__err">{nickError}</span> : null}
          </form>
        ) : (
          <>
            {user ? (
              <button
                type="button"
                className="rq-menu-auth__user rq-menu-auth__user--btn"
                title="닉네임 수정"
                onClick={() => {
                  setNickDraft(displayName);
                  setNickError(null);
                  setEditingNick(true);
                }}
              >
                {displayName}
              </button>
            ) : (
              <span className="rq-menu-auth__user">Guest</span>
            )}
            {user ? (
              <button type="button" className="rq-menu-auth__btn" onClick={onLogout}>
                Logout
              </button>
            ) : (
              <button type="button" className="rq-menu-auth__btn" onClick={onOpenAuth}>
                Login
              </button>
            )}
          </>
        )}
      </div>

      <div className="rq-nav" role="navigation" aria-label="Main menu">
        <ul className="rq-nav-list">
          {NAV_ENTRIES.map((entry) =>
            entry.kind === 'page' ? renderPage(entry) : renderGroup(entry),
          )}
          {isAdmin ? (
            <li className={`rq-nav-row${activePage === 'admin' ? ' is-active' : ''}`}>
              <button
                type="button"
                className="rq-nav-item"
                aria-label="Admin"
                onClick={() => {
                  closeMobile();
                  onPageChange('admin');
                }}
              >
                <span className="rq-nav-label">Admin</span>
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </aside>
  );

  if (!portalEl) return null;
  return createPortal(
    <>
      <button
        type="button"
        className={`rq-menu-burger${mobileOpen ? ' is-open' : ''}`}
        aria-label="메뉴 열기"
        aria-expanded={mobileOpen}
        aria-controls="lh-site-menu"
        onClick={() => setMobileOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>
      <button
        type="button"
        className={`rq-menu-backdrop${mobileOpen ? ' is-open' : ''}`}
        aria-label="메뉴 닫기"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={closeMobile}
      />
      {panel}
    </>,
    portalEl,
  );
}
