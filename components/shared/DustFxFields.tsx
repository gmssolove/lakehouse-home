'use client';

import { LakeToggle } from '@/components/ui/LakeToggle';
import { SliderField } from '@/components/ui/form/SliderField';
import {
  DEFAULT_DUST_INTENSITY,
  dustFxIntensity,
  type DustFxConfig,
} from '@/lib/shared/dustFx';

type Props = {
  value?: DustFxConfig;
  onChange: (next: DustFxConfig) => void;
  /** 섹션 제목 클래스 (기본 lake-edit-section-title) */
  titleClassName?: string;
  hintClassName?: string;
};

export function DustFxFields({
  value,
  onChange,
  titleClassName = 'lake-edit-section-title',
  hintClassName = 'pair-edit-hint',
}: Props) {
  const intensity = dustFxIntensity(value);
  const enabled = Boolean(value?.enabled);

  return (
    <>
      <div className={titleClassName} style={{ marginTop: 18 }}>
        먼지 효과
      </div>
      <p className={hintClassName} style={{ marginTop: -4 }}>
        상세 화면에서 먼지가 천천히 공중에 떠다닙니다. 기본 꺼짐.
      </p>
      <div className="form-group">
        <LakeToggle
          checked={enabled}
          onChange={(on) => onChange({ ...(value ?? {}), enabled: on })}
          label="먼지 효과 사용"
        />
      </div>
      {enabled ? (
        <div className="form-group">
          <SliderField
            label="감도"
            min={1}
            max={100}
            step={1}
            value={intensity}
            displayValue={`${intensity}%`}
            onChange={(n) =>
              onChange({
                ...(value ?? {}),
                enabled: true,
                intensity: n || DEFAULT_DUST_INTENSITY,
              })
            }
            aria-label="먼지 효과 감도"
            hint="낮을수록 은은하게, 높을수록 입자·밝기가 늘어납니다."
          />
        </div>
      ) : null}
    </>
  );
}
