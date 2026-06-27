'use client';

import type { WithSecret } from '@/lib/types/secret-content';
import { LakeToggle } from '@/components/ui/LakeToggle';

type Props = {
  value: WithSecret;
  onChange: (patch: Partial<WithSecret>) => void;
};

export function SecretPostFields({ value, onChange }: Props) {
  return (
    <div className="lh-secret-fields">
      <LakeToggle checked={!!value.secret} onChange={(secret) => onChange({ secret })} label="비밀글" />
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
