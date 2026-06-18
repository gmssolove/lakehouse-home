'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { User } from 'firebase/auth';

export type HomePageId =
  | 'main'
  | 'notice'
  | 'diary'
  | 'gallery'
  | 'universe'
  | 'trpg'
  | 'guest'
  | 'banner'
  | 'admin';

type Props = {
  user: User | null;
  isAdmin: boolean;
  activePage: HomePageId;
  onPageChange: (page: HomePageId) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
};

type PageEntry = {
  kind: 'page';
  id: HomePageId;
  roman: string;
  label: string;
};

type GroupEntry = {
  kind: 'group';
  id: 'character' | 'archive';
  roman: string;
  label: string;
};

type NavEntry = PageEntry | GroupEntry;

const NAV_ENTRIES: NavEntry[] = [
  { kind: 'page', id: 'main', roman: 'I', label: 'Main' },
  { kind: 'page', id: 'notice', roman: 'II', label: 'Notice' },
  { kind: 'page', id: 'diary', roman: 'III', label: 'Diary' },
  { kind: 'page', id: 'gallery', roman: 'IV', label: 'Gallery' },
  { kind: 'group', id: 'character', roman: 'V', label: 'Character' },
  { kind: 'page', id: 'universe', roman: 'VI', label: 'Universe' },
  { kind: 'page', id: 'trpg', roman: 'VII', label: 'TRPG' },
  { kind: 'group', id: 'archive', roman: 'VIII', label: 'Archive' },
  { kind: 'page', id: 'guest', roman: 'IX', label: 'Guest' },
  { kind: 'page', id: 'banner', roman: 'X', label: 'Banner' },
];

/** reversed arc: center pulls left, top/bottom swing right */
const NAV_SHIFT_X = 36;
const SUB_CLOSE_MS = 680;

function useSubmenu(initial: boolean) {
  const [open, setOpen] = useState(initial);
  const [closing, setClosing] = useState(false);
  const subRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!closing) return;
    const el = subRef.current;
    if (!el) return;

    let done = false;
    const finishClose = () => {
      if (done) return;
      done = true;
      setOpen(false);
      setClosing(false);
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
      setClosing(true);
      return;
    }
    if (!open && !closing) setOpen(true);
  }

  function subClass(base: string) {
    if (closing && open) return `${base} open closing`;
    if (open) return `${base} open`;
    return base;
  }

  const expanded = open || closing;

  return { open, expanded, closing, toggle, subClass, subRef };
}

function arcOffset(index: number, total: number, maxBulge = 56): number {
  if (total <= 1) return 6 + NAV_SHIFT_X;
  const t = index / (total - 1);
  const centerBulge = maxBulge * 4 * t * (1 - t);
  return Math.round(maxBulge + 6 - centerBulge + NAV_SHIFT_X);
}

export function LeftNav({
  user,
  isAdmin,
  activePage,
  onPageChange,
  onOpenAuth,
  onLogout,
}: Props) {
  const pathname = usePathname();
  const charMenu = useSubmenu(pathname.startsWith('/oc') || pathname.startsWith('/pair'));
  const archiveMenu = useSubmenu(false);
  const [unfolded, setUnfolded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollFade, setScrollFade] = useState(false);
  const submenuExpanded = charMenu.expanded || archiveMenu.expanded;

  const navCount = NAV_ENTRIES.length + (isAdmin ? 1 : 0);
  const stackX = useMemo(() => arcOffset(0, navCount), [navCount]);

  useEffect(() => {
    const t = window.setTimeout(() => setUnfolded(true), 100);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateFade() {
      if (!submenuExpanded) {
        setScrollFade(false);
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = el!;
      const overflow = scrollHeight - clientHeight > 4;
      setScrollFade(
        overflow && scrollTop + clientHeight < scrollHeight - 4,
      );
    }

    updateFade();
    el.addEventListener('scroll', updateFade, { passive: true });
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', updateFade);
      ro.disconnect();
    };
  }, [isAdmin, charMenu.expanded, archiveMenu.expanded, unfolded, submenuExpanded]);

  function arcStyle(index: number): CSSProperties {
    const x = arcOffset(index, navCount);
    return {
      ['--arc-x' as string]: `${x}px`,
      ['--arc-stack-x' as string]: `${stackX}px`,
      ['--arc-i' as string]: String(index),
      ['--arc-stack-y' as string]: String(-index),
    };
  }

  function isPageActive(id: HomePageId) {
    return activePage === id && pathname === '/';
  }

  function renderSubmenu(
    entry: GroupEntry,
    menu: ReturnType<typeof useSubmenu>,
    active: boolean,
    isChar: boolean,
  ) {
    return (
      <li
        key={entry.id}
        className={`nav-arc-slot nav-arc-slot--group${menu.expanded ? ' is-open' : ''}${menu.closing ? ' is-closing' : ''}`}
        style={arcStyle(NAV_ENTRIES.indexOf(entry))}
      >
        <div
          className={`nav-arc-item nav-item nav-group-head${active ? ' active' : ''}`}
          onClick={menu.toggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && menu.toggle()}
          aria-expanded={menu.expanded}
        >
          <span className="nav-arc-roman" aria-hidden="true">
            {entry.roman}
          </span>
          <span className="nav-item-inner">
            <span className="nav-label">{entry.label}</span>
          </span>
        </div>

        {isChar ? (
          <div ref={menu.subRef} className={menu.subClass('nav-sub nav-sub--arc')} id="char-sub">
            <div className="nav-sub-inner">
              <Link href="/oc" className={`nav-sub-item${pathname === '/oc' ? ' active' : ''}`}>
                OC
              </Link>
              <Link href="/pair" className={`nav-sub-item${pathname === '/pair' ? ' active' : ''}`}>
                Pair
              </Link>
            </div>
          </div>
        ) : (
          <div ref={menu.subRef} className={menu.subClass('nav-sub nav-sub--arc')} id="archive-sub">
            <div className="nav-sub-inner">
              <span className="nav-sub-item">Review</span>
              <span className="nav-sub-item">Scrap</span>
              <span className="nav-sub-item">Music</span>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="left-panel">
      <div
        className="site-title-wrap site-title-wrap--clickable"
        role="button"
        tabIndex={0}
        onClick={() => onPageChange('main')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPageChange('main');
          }
        }}
        aria-label="메인 메뉴로 이동"
      >
        <div className="site-title">
          lake<span>house</span>
        </div>
        <div className="site-subtitle">archive &amp; stories</div>
      </div>

      <div className="auth-area">
        <div className="auth-user-info">
          <span>{user ? user.displayName || user.email?.split('@')[0] : 'Guest'}</span>
        </div>
        {user ? (
          <button type="button" className="btn-auth" onClick={onLogout}>
            Logout
          </button>
        ) : (
          <button type="button" className="btn-auth" onClick={onOpenAuth}>
            Login
          </button>
        )}
      </div>

      <nav
        id="main-nav"
        className={`nav-arc${unfolded ? ' nav-arc--unfolded' : ''}`}
        aria-label="Main menu"
        style={{ ['--lh-nav-visible-rows' as string]: String(navCount) }}
      >
        <div
          ref={scrollRef}
          className={`nav-arc-scroll${submenuExpanded && scrollFade ? ' nav-arc-scroll--fade' : ''}${submenuExpanded ? ' nav-arc-scroll--clip' : ''}`}
        >
          <ul className="nav-arc-list">
            {NAV_ENTRIES.map((entry, index) => {
              const style = arcStyle(index);

              if (entry.kind === 'page') {
                const active = isPageActive(entry.id);
                return (
                  <li key={entry.id} className="nav-arc-slot" style={style}>
                    <div
                      className={`nav-arc-item nav-item${active ? ' active' : ''}`}
                      onClick={() => onPageChange(entry.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onPageChange(entry.id)}
                    >
                      <span className="nav-arc-roman" aria-hidden="true">
                        {entry.roman}
                      </span>
                      <span className="nav-item-inner">
                        <span className="nav-label">{entry.label}</span>
                      </span>
                    </div>
                  </li>
                );
              }

              const isChar = entry.id === 'character';
              const menu = isChar ? charMenu : archiveMenu;
              const active = isChar
                ? menu.expanded || pathname.startsWith('/oc') || pathname.startsWith('/pair')
                : menu.expanded;

              return renderSubmenu(entry, menu, active, isChar);
            })}
          </ul>

          {isAdmin ? (
            <ul className="nav-arc-list nav-arc-list--admin">
              <li
                className="nav-arc-slot nav-arc-slot--admin nav-arc-slot--static"
                style={arcStyle(NAV_ENTRIES.length)}
              >
                <div
                  className={`nav-arc-item nav-item${activePage === 'admin' ? ' active' : ''}`}
                  id="admin-nav-item"
                  onClick={() => onPageChange('admin')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onPageChange('admin')}
                >
                  <span className="nav-arc-roman nav-arc-roman--admin" aria-hidden="true">
                    XI
                  </span>
                  <span className="nav-item-inner">
                    <span className="nav-label" style={{ color: 'var(--pink-dim)' }}>
                      Admin
                    </span>
                  </span>
                </div>
              </li>
            </ul>
          ) : null}
        </div>
      </nav>

      <div className="left-bottom">© lakehouse All rights reserved.</div>
    </div>
  );
}
