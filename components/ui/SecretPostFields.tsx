'use client';

import type { WithSecret } from '@/lib/types/secret-content';

type Props = {
  value: WithSecret;
  onChange: (patch: Partial<WithSecret>) => void;
};

export function SecretPostFields({ value, onChange }: Props) {
  return (
    <div className="lh-secret-fields">
      <label className="lh-secret-fields__check">
        <input
          type="checkbox"
          checked={!!value.secret}
          onChange={(e) => onChange({ secret: e.target.checked })}
        />
        비밀글
      </label>
      {value.secret ? (
        <input
          className="form-input"
          type="password"
          placeholder="항목 비밀번호 (비우면 섹션 기본값)"
          value={value.secretPassword || ''}
          onChange={(e) => onChange({ secretPassword: e.target.value })}
        />
      ) : null}
    </div>
  );
}
