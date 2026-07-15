'use client';

export type SectionNavItem = {
  id: string;
  label: string;
};

export type SectionNavGroup = {
  id: string;
  en?: string;
  ko?: string;
  /** 섹션 헤더 없이 단독 항목 (프리뷰 등) */
  solo?: boolean;
  items: SectionNavItem[];
};

type Props = {
  groups: SectionNavGroup[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
};

export function SectionedInfoNav({ groups, activeId, onSelect, className = '' }: Props) {
  return (
    <nav className={`lh-sec-nav ${className}`.trim()} aria-label="정보 메뉴">
      {groups.map((group) => (
        <div key={group.id} className="lh-sec-nav__block">
          {!group.solo && (group.en || group.ko) ? (
            <div className="lh-sec-nav__head">
              {group.en ? <span className="lh-sec-nav__en">{group.en}</span> : null}
              {group.ko ? <span className="lh-sec-nav__ko">{group.ko}</span> : null}
            </div>
          ) : null}
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lh-sec-nav__item${group.solo ? ' lh-sec-nav__solo' : ''}${
                activeId === item.id ? ' is-active' : ''
              }`}
              aria-current={activeId === item.id ? 'true' : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span className="lh-sec-nav__bar" aria-hidden>
                |
              </span>
              <span className="lh-sec-nav__label">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
