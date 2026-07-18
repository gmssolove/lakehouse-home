'use client';

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
};

export function LakeEditTabs({ tabs, active, onChange, className = '', ariaLabel = '수정 탭' }: Props) {
  return (
    <div className={`lake-edit-shell__tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const isAdd = t.id === '__add__';
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={!isAdd && active === t.id}
            className={`lake-edit-shell__tab${active === t.id && !isAdd ? ' is-active' : ''}${isAdd ? ' is-add' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
