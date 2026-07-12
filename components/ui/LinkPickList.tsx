'use client';

type Option = {
  id: string;
  label: string;
};

type Props = {
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel?: string;
  selectPlaceholder?: string;
};

/** 다수 항목을 select로 추가 · 목록에서 제거 */
export function LinkPickList({
  options,
  selectedIds,
  onChange,
  emptyLabel = '선택된 항목이 없습니다.',
  selectPlaceholder = '선택해서 추가…',
}: Props) {
  const selected = new Set(selectedIds);
  const picked = options.filter((o) => selected.has(o.id));
  const available = options.filter((o) => !selected.has(o.id));

  return (
    <div className="lh-link-pick">
      {picked.length > 0 ? (
        <ul className="lh-link-pick__list">
          {picked.map((o) => (
            <li key={o.id} className="lh-link-pick__item">
              <span className="lh-link-pick__label">{o.label}</span>
              <button
                type="button"
                className="lh-link-pick__remove"
                aria-label={`${o.label} 제거`}
                onClick={() => onChange(selectedIds.filter((id) => id !== o.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lh-link-pick__empty">{emptyLabel}</p>
      )}

      {available.length > 0 ? (
        <select
          className="form-input lh-link-pick__select"
          value=""
          aria-label={selectPlaceholder}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onChange([...selectedIds, id]);
          }}
        >
          <option value="">{selectPlaceholder}</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : options.length > 0 ? (
        <p className="lh-link-pick__done">모두 추가되었습니다.</p>
      ) : null}
    </div>
  );
}
