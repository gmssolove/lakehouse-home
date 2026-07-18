'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  createEmptyRiskStage,
  createRiskStageFromPreset,
  DEFAULT_RISK_COLOR,
  getRiskPreset,
  isRiskRankId,
  isUnknownRisk,
  RISK_PRESETS,
  RISK_UNKNOWN,
  RISK_UNKNOWN_COLORS,
  riskBadgeStyleForStage,
  riskBadgeText,
} from '@/lib/oc/riskStages';
import { normalizeHex } from '@/lib/oc/characterTheme';
import type { RiskPresetId, RiskStage } from '@/lib/types/character';

type Props = {
  stages: RiskStage[];
  onChange: (stages: RiskStage[]) => void;
};

function presetButtonLabel(s: RiskStage): string {
  if (isUnknownRisk(s)) return `미상 · ${s.label || RISK_UNKNOWN.label}`;
  if (isRiskRankId(s.preset)) {
    return `${s.preset}단계 · ${s.label || getRiskPreset(s.preset)?.label || ''}`;
  }
  return '프리셋에서 선택…';
}

/** 위험도 단계 편집 — 등급 프리셋 + 구분선 아래 미상 */
export function RiskStagesEditor({ stages, onChange }: Props) {
  const list = stages;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (openIndex === null) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenIndex(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openIndex]);

  function patch(i: number, next: Partial<RiskStage>) {
    const copy = [...list];
    copy[i] = { ...copy[i], ...next };
    onChange(copy);
  }

  function applyPreset(i: number, presetId: RiskPresetId) {
    const p = getRiskPreset(presetId);
    if (!p) return;
    patch(i, {
      preset: p.id,
      label: p.label,
      notice: p.notice,
      color: p.color,
    });
    setOpenIndex(null);
  }

  function remove(i: number) {
    onChange(list.filter((_, j) => j !== i));
    setOpenIndex(null);
  }

  function addFromPreset(presetId: RiskPresetId) {
    onChange([...list, createRiskStageFromPreset(presetId)]);
    setOpenIndex(null);
  }

  return (
    <div className="lh-risk-edit" ref={rootRef}>
      {list.length === 0 ? (
        <p className="lh-color-hint" style={{ margin: '0 0 8px' }}>
          1~7단계는 등급 체계입니다. 「미상」은 등급 밖(판단 불가) 분류로, 목록 하단에서 고릅니다.
        </p>
      ) : null}

      {list.map((s, i) => {
        const color =
          normalizeHex(s.color) ||
          (isUnknownRisk(s) ? RISK_UNKNOWN.color : DEFAULT_RISK_COLOR);
        const open = openIndex === i;
        const preview = riskBadgeText(s) || '미리보기';
        const unknown = isUnknownRisk(s);
        return (
          <div key={s.id || `risk-${i}`} className="lh-risk-edit__card">
            <div className="lh-risk-edit__pick-row">
              <span
                className={[
                  'lh-risk-badge',
                  'lh-risk-edit__preview',
                  unknown ? 'lh-risk-badge--unknown' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={riskBadgeStyleForStage(s)}
                aria-hidden="true"
              >
                {preview}
              </span>
              <div className="lh-risk-edit__select-wrap">
                <button
                  type="button"
                  className="form-input lh-risk-edit__select-btn"
                  aria-expanded={open}
                  aria-controls={`${listId}-${i}`}
                  onClick={() => setOpenIndex(open ? null : i)}
                >
                  {presetButtonLabel(s)}
                  <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                </button>
                {open ? (
                  <ul
                    id={`${listId}-${i}`}
                    className="lh-risk-edit__menu"
                    role="listbox"
                    aria-label="위험도 선택"
                  >
                    <li className="lh-risk-edit__menu-group" aria-hidden="true">
                      등급 (1~7)
                    </li>
                    {RISK_PRESETS.map((p) => (
                      <li key={p.id} role="option" aria-selected={s.preset === p.id}>
                        <button
                          type="button"
                          className={`lh-risk-edit__menu-item${s.preset === p.id ? ' is-active' : ''}`}
                          onClick={() => applyPreset(i, p.id)}
                        >
                          <span
                            className="lh-risk-edit__swatch"
                            style={{ background: p.color }}
                            aria-hidden="true"
                          />
                          <span className="lh-risk-edit__menu-main">
                            <strong>
                              {p.id}. {p.label}
                            </strong>
                            <span>{p.notice}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    <li className="lh-risk-edit__menu-sep" role="separator" />
                    <li className="lh-risk-edit__menu-group" aria-hidden="true">
                      등급 외
                    </li>
                    <li role="option" aria-selected={s.preset === 'unknown'}>
                      <button
                        type="button"
                        className={`lh-risk-edit__menu-item lh-risk-edit__menu-item--unknown${
                          s.preset === 'unknown' ? ' is-active' : ''
                        }`}
                        onClick={() => applyPreset(i, 'unknown')}
                      >
                        <span
                          className="lh-risk-edit__swatch"
                          style={{ background: RISK_UNKNOWN_COLORS.fg }}
                          aria-hidden="true"
                        />
                        <span className="lh-risk-edit__menu-main">
                          <strong>{RISK_UNKNOWN.label}</strong>
                          <span>{RISK_UNKNOWN.notice}</span>
                        </span>
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                className="btn-del"
                style={{ padding: '4px 8px' }}
                onClick={() => remove(i)}
                aria-label={`위험도 ${i + 1} 삭제`}
              >
                삭제
              </button>
            </div>

            <div className="lh-risk-edit__fields">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">라벨</label>
                <input
                  className="form-input"
                  value={s.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  placeholder={unknown ? '미상' : '예: 매우 높음'}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">주의 문구</label>
                <input
                  className="form-input"
                  value={s.notice || ''}
                  onChange={(e) => patch(i, { notice: e.target.value })}
                  placeholder={unknown ? '기록 없음, 접촉 이력 전무' : '예: 접촉 주의'}
                />
              </div>
              <div className="form-group lh-risk-edit__color" style={{ margin: 0 }}>
                <label className="form-label">색상</label>
                <div className="lh-color-personal-row">
                  <input
                    type="color"
                    className="lh-color-picker"
                    value={color}
                    onChange={(e) => patch(i, { color: e.target.value })}
                    aria-label={`위험도 ${i + 1} 색상`}
                  />
                  <input
                    className="form-input lh-color-hex-input"
                    value={s.color || ''}
                    onChange={(e) => patch(i, { color: e.target.value })}
                    onBlur={() => {
                      const hex = normalizeHex(s.color);
                      if (hex) patch(i, { color: hex });
                    }}
                    placeholder={unknown ? '#a48ed6' : '#e05555'}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="lh-risk-edit__add">
        <span className="form-label" style={{ margin: 0 }}>
          + 단계 추가
        </span>
        <div className="lh-risk-edit__add-presets">
          {RISK_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="lh-risk-edit__chip"
              title={`${p.label} · ${p.notice}`}
              onClick={() => addFromPreset(p.id)}
            >
              <span className="lh-risk-edit__swatch" style={{ background: p.color }} />
              {p.id}
            </button>
          ))}
          <button
            type="button"
            className="lh-risk-edit__chip lh-risk-edit__chip--unknown"
            title={`${RISK_UNKNOWN.label} · ${RISK_UNKNOWN.notice}`}
            onClick={() => addFromPreset('unknown')}
          >
            <span
              className="lh-risk-edit__swatch"
              style={{ background: RISK_UNKNOWN_COLORS.fg }}
            />
            미상
          </button>
          <button
            type="button"
            className="lh-risk-edit__chip lh-risk-edit__chip--custom"
            onClick={() => onChange([...list, createEmptyRiskStage()])}
          >
            직접
          </button>
        </div>
      </div>
    </div>
  );
}
