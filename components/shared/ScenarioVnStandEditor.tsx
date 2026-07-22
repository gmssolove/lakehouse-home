'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  useStagePixelSize,
  useStandPoseDrag,
  type StageSize,
  type StandPose,
} from '@/lib/vn/useStandPoseDrag';
import { VN_STAND_DBOX } from '@/lib/vn/standLayout';
import {
  anchorPoseToSlot,
  ALL_STAND_SLOTS,
  CROWD_SLOTS,
  defaultPoseForSlot,
  isCrowdSlot,
  mergeStandPosBySlot,
  parseStandSlotPoseKey,
  resolveStandPoseForSlot,
  TRIO_SLOTS,
  type ScenarioVnStandPosBySlot,
  type StandSlot,
} from '@/lib/vn/standPosBySlot';
import type { ScenarioVnSpeaker } from '@/lib/vn/parseCcfoliaLog';
import '@/styles/shared/scenario-vn-stand-editor.css';

type StandAnim = NonNullable<ScenarioVnSpeaker['standAnimation']>;

const ANIM_OPTIONS: { value: StandAnim; label: string }[] = [
  { value: 'fade', label: '페이드' },
  { value: 'slide-left', label: '왼쪽에서' },
  { value: 'slide-right', label: '오른쪽에서' },
  { value: 'slide-up', label: '아래에서' },
  { value: 'pop', label: '팝업' },
];

const SLOT_LABEL: Record<StandSlot, string> = {
  left: '왼쪽',
  center: '중앙',
  right: '오른쪽',
  crowd0: '군중1',
  crowd1: '군중2',
  crowd2: '군중3',
  crowd3: '군중4',
  crowd4: '군중5',
};

/** flush 결과: 화자키 → 슬롯별 포즈(머지된 전체 bySlot) */
export type StandSlotPoseFlush = Record<string, ScenarioVnStandPosBySlot>;

export type ScenarioVnStandEditorHandle = {
  flush: () => StandSlotPoseFlush;
  peekPending: () => Record<string, StandPose>;
};

type Props = {
  speakers: ScenarioVnSpeaker[];
  onUpdateSpeaker: (key: string, patch: Partial<ScenarioVnSpeaker>) => void;
  /** 화자별 standPosBySlot 일괄 반영 */
  onCommitStandPoses: (byKey: StandSlotPoseFlush) => void;
};

type FigureProps = {
  speakerKey: string;
  sprite: string;
  anim: StandAnim;
  pose: StandPose;
  slot: StandSlot;
  isSelected: boolean;
  editMode: boolean;
  stageSize: StageSize;
  playKey: number;
  onSelect: () => void;
  onPoseLocal: (next: StandPose) => void;
};

function StandFigureItem({
  speakerKey,
  sprite,
  anim,
  pose,
  slot,
  isSelected,
  editMode,
  stageSize,
  playKey,
  onSelect,
  onPoseLocal,
}: FigureProps) {
  const { figureRef, scalerRef, dragging, figureStyle, handlers } = useStandPoseDrag(
    pose,
    isSelected ? onPoseLocal : undefined,
    isSelected && editMode,
    stageSize,
    slot,
  );

  return (
    <div
      ref={figureRef}
      className={`svn-stand__figure${isSelected ? ' is-selected' : ' is-dimmed'}${dragging ? ' is-dragging' : ''}`}
      style={figureStyle}
      onClick={(e) => {
        if (dragging) return;
        e.stopPropagation();
        onSelect();
      }}
      {...handlers}
    >
      <div ref={scalerRef} className="svn-stand__scaler">
        <div
          key={`${speakerKey}-${slot}-${playKey}`}
          className={`svn-stand__inner${editMode ? '' : ` svn-stand__inner--${anim}`}`}
        >
          <img src={sprite} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}

function localKey(speakerKey: string, slot: StandSlot) {
  return `${speakerKey}::${slot}`;
}

/** 캐릭터 × 왼/중/우 버전 포즈 편집 */
export const ScenarioVnStandEditor = forwardRef<ScenarioVnStandEditorHandle, Props>(
  function ScenarioVnStandEditor({ speakers, onUpdateSpeaker, onCommitStandPoses }, ref) {
    const withSprite = speakers.filter((s) => s.sprite);
    const [selectedKey, setSelectedKey] = useState(withSprite[0]?.key || '');
    const [editSlot, setEditSlot] = useState<StandSlot>('center');
    const [editMode, setEditMode] = useState(true);
    /** 미선택 캐릭터를 반투명으로 같이 표시해 대며 맞춤 */
    const [showOthers, setShowOthers] = useState(true);
    const [playKey, setPlayKey] = useState(0);
    /** `${speaker}::${slot}` → pose */
    const [localPoses, setLocalPoses] = useState<Record<string, StandPose>>({});
    const pendingRef = useRef<Record<string, StandPose>>({});
    const { stageRef, size } = useStagePixelSize();
    const onCommitRef = useRef(onCommitStandPoses);
    onCommitRef.current = onCommitStandPoses;

    const localPosesRef = useRef(localPoses);
    localPosesRef.current = localPoses;
    const speakersListRef = useRef(speakers);
    speakersListRef.current = speakers;

    const poseOf = useCallback(
      (s: ScenarioVnSpeaker, slot: StandSlot): StandPose => {
        const lk = localKey(s.key, slot);
        const raw = localPoses[lk] ?? pendingRef.current[lk];
        if (raw) return anchorPoseToSlot(raw, slot);
        return resolveStandPoseForSlot(s, slot);
      },
      [localPoses],
    );

    const setPoseLocal = useCallback((speakerKey: string, slot: StandSlot, next: StandPose) => {
      const lk = localKey(speakerKey, slot);
      /* 저장·표시 모두 레인에 앵커 — 드래그로 자리를 통째로 옮기지 않음 */
      const normalized = anchorPoseToSlot(next, slot);
      pendingRef.current[lk] = normalized;
      localPosesRef.current = { ...localPosesRef.current, [lk]: normalized };
      setLocalPoses((prev) => {
        const cur = prev[lk];
        if (
          cur &&
          cur.x === normalized.x &&
          cur.y === normalized.y &&
          cur.scale === normalized.scale
        ) {
          return prev;
        }
        return { ...prev, [lk]: normalized };
      });
    }, []);

    const flush = useCallback((): StandSlotPoseFlush => {
      const snapshot: StandSlotPoseFlush = {};
      const touched = new Set<string>();

      for (const lk of Object.keys(pendingRef.current)) {
        const parsed = parseStandSlotPoseKey(lk);
        if (parsed) touched.add(parsed.character);
      }
      for (const lk of Object.keys(localPosesRef.current)) {
        const parsed = parseStandSlotPoseKey(lk);
        if (parsed) touched.add(parsed.character);
      }

      for (const s of speakersListRef.current) {
        if (!s.sprite?.trim()) continue;
        if (!touched.has(s.key) && !s.standPosBySlot && !s.standPos) continue;

        let bySlot: ScenarioVnStandPosBySlot = { ...(s.standPosBySlot || {}) };
        let changed = touched.has(s.key);

        for (const slot of ALL_STAND_SLOTS) {
          const lk = localKey(s.key, slot);
          const pending = pendingRef.current[lk] ?? localPosesRef.current[lk];
          if (pending) {
            bySlot = mergeStandPosBySlot(bySlot, { [slot]: pending });
            changed = true;
          }
        }

        if (changed) {
          if (!bySlot.center && s.standPos) {
            bySlot = mergeStandPosBySlot(bySlot, { center: s.standPos });
          }
          snapshot[s.key] = bySlot;
        }
      }

      pendingRef.current = {};
      if (Object.keys(snapshot).length) onCommitRef.current(snapshot);
      return snapshot;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        flush,
        peekPending: () => ({ ...pendingRef.current }),
      }),
      [flush],
    );

    useEffect(() => {
      if (!editMode) return;
      if (!Object.keys(pendingRef.current).length) return;
      const t = window.setTimeout(() => flush(), 400);
      return () => window.clearTimeout(t);
    }, [localPoses, editMode, flush]);

    useEffect(() => {
      if (!editMode) flush();
    }, [editMode, flush]);

    useEffect(
      () => () => {
        flush();
      },
      [flush],
    );

    useEffect(() => {
      const el = stageRef.current;
      if (!el || !editMode) return;
      const blockScroll = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener('wheel', blockScroll, { passive: false });
      return () => el.removeEventListener('wheel', blockScroll);
    }, [editMode, stageRef]);

    if (!withSprite.length) {
      return (
        <p className="lh-dialogue-editor__hint">
          먼저 위에서 화자에게 캐릭터 이미지를 등록하면 여기서 스탠딩 위치·애니메이션을 조절할 수 있어요.
        </p>
      );
    }

    const selected = withSprite.find((s) => s.key === selectedKey) || withSprite[0];
    const anim: StandAnim = selected.standAnimation || 'fade';

    function selectTab(key: string) {
      flush();
      setSelectedKey(key);
    }

    function selectSlot(slot: StandSlot) {
      flush();
      setEditSlot(slot);
    }

    function resetSelectedVersion() {
      const next = defaultPoseForSlot(editSlot);
      setPoseLocal(selected.key, editSlot, next);
      const bySlot = mergeStandPosBySlot(selected.standPosBySlot, { [editSlot]: next });
      onCommitStandPoses({ [selected.key]: bySlot });
      onUpdateSpeaker(selected.key, {
        standPosBySlot: bySlot,
        standPos: bySlot.center ?? selected.standPos,
      });
    }

    /** 선택 캐릭터는 편집 중 버전 슬롯, 나머지는 남은 왼/중/우에 각자 버전으로 */
    function previewSlotFor(s: ScenarioVnSpeaker): StandSlot {
      if (s.key === selected.key) return editSlot;
      const others = withSprite.filter((x) => x.key !== selected.key);
      if (isCrowdSlot(editSlot)) {
        const remaining = CROWD_SLOTS.filter((x) => x !== editSlot);
        const idx = others.findIndex((x) => x.key === s.key);
        return remaining[Math.max(0, idx) % Math.max(1, remaining.length)] ?? 'crowd0';
      }
      const remaining = TRIO_SLOTS.filter((x) => x !== editSlot);
      const idx = others.findIndex((x) => x.key === s.key);
      return remaining[Math.max(0, idx) % Math.max(1, remaining.length)] ?? 'center';
    }

    const stageFigures = showOthers ? withSprite : withSprite.filter((s) => s.key === selected.key);

    return (
      <div className="svn-stand">
        <div className="svn-stand__toolbar">
          <div className="svn-stand__tabs">
            {withSprite.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`svn-stand__tab${s.key === selected.key ? ' is-active' : ''}`}
                onClick={() => selectTab(s.key)}
              >
                {s.displayName}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`svn-stand__edit-btn${editMode ? ' is-active' : ''}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '✓ 조정 중' : '잠금'}
          </button>
          <button
            type="button"
            className={`svn-stand__edit-btn${showOthers ? ' is-active' : ''}`}
            onClick={() => setShowOthers((v) => !v)}
            title="미선택 캐릭터를 반투명으로 같이 표시"
          >
            {showOthers ? '✓ 다른 캐릭터' : '다른 캐릭터'}
          </button>
          <button type="button" className="lh-dialogue-editor__tool" onClick={resetSelectedVersion}>
            이 버전 초기화
          </button>
        </div>

        <p className="svn-stand__hint">
          {editMode
            ? `「${selected.displayName}」${SLOT_LABEL[editSlot]}${
                isCrowdSlot(editSlot)
                  ? ' — 4~5명 장면용. 왼·중·오 버전과 따로 저장됩니다.'
                  : ' — 3명 이하 자리용. 말할 때마다 자리 안 옮김.'
              } 버전은 크기·세로·좌우. ${
                showOthers
                  ? '다른 캐릭터는 반투명으로 보이니 대며 맞추세요.'
                  : '「다른 캐릭터」를 켜면 반투명으로 같이 보입니다.'
              }`
            : '잠금 중 — 「조정 중」을 켜면 버전 포즈를 수정할 수 있어요.'}
        </p>

        <div className="svn-stand__anims" style={{ marginBottom: 8 }}>
          <span className="svn-stand__hint" style={{ margin: 0, marginRight: 6 }}>
            3인:
          </span>
          {TRIO_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              className={`lh-dialogue-chip${editSlot === slot ? ' is-active' : ''}`}
              onClick={() => selectSlot(slot)}
            >
              {SLOT_LABEL[slot]}
            </button>
          ))}
        </div>
        <div className="svn-stand__anims" style={{ marginBottom: 8 }}>
          <span className="svn-stand__hint" style={{ margin: 0, marginRight: 6 }}>
            군중:
          </span>
          {CROWD_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              className={`lh-dialogue-chip${editSlot === slot ? ' is-active' : ''}`}
              onClick={() => selectSlot(slot)}
            >
              {SLOT_LABEL[slot]}
            </button>
          ))}
        </div>

        <div
          ref={stageRef}
          className={`svn-stand__stage${editMode ? ' is-editable' : ''}`}
          style={
            {
              '--svn-dbox-bottom': `${VN_STAND_DBOX.bottomPct}%`,
              '--svn-dbox-width': `${VN_STAND_DBOX.widthPct}%`,
              '--svn-dbox-height': `${VN_STAND_DBOX.heightPct}%`,
              '--svn-dbox-pad-t': `${VN_STAND_DBOX.padTopPctOfWidth}%`,
              '--svn-dbox-pad-x': `${VN_STAND_DBOX.padXPctOfWidth}%`,
              '--svn-dbox-pad-b': `${VN_STAND_DBOX.padBottomPctOfWidth}%`,
            } as CSSProperties
          }
        >
          <div className="svn-stand__floor" />
          <div className="svn-stand__dbox" aria-hidden>
            <span className="svn-stand__dbox-label">화자</span>
            <span className="svn-stand__dbox-text">대사</span>
          </div>
          {stageFigures.map((s) => {
            const slot = previewSlotFor(s);
            const isSelected = s.key === selected.key;
            return (
              <StandFigureItem
                key={`${s.key}-${slot}-${isSelected ? 'sel' : 'ref'}`}
                speakerKey={s.key}
                sprite={s.sprite!}
                anim={(isSelected ? anim : s.standAnimation) || 'fade'}
                pose={poseOf(s, slot)}
                slot={slot}
                isSelected={isSelected}
                editMode={editMode}
                stageSize={size}
                playKey={playKey}
                onSelect={() => selectTab(s.key)}
                onPoseLocal={(next) => setPoseLocal(s.key, editSlot, next)}
              />
            );
          })}
        </div>

        <div className="svn-stand__anims">
          {ANIM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`lh-dialogue-chip${anim === opt.value ? ' is-active' : ''}`}
              onClick={() => onUpdateSpeaker(selected.key, { standAnimation: opt.value })}
            >
              {opt.label}
            </button>
          ))}
          <button type="button" className="lh-dialogue-editor__tool" onClick={() => setPlayKey((k) => k + 1)}>
            ▶ 등장 미리보기
          </button>
        </div>
      </div>
    );
  },
);
