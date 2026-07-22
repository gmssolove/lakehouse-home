'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './vn-engine.module.css';
import type { VNSpriteAnim } from './types';
import {
  spriteSlotToStandPose,
  useStandPoseDrag,
  useStagePixelSize,
  type StandPose,
} from '@/lib/vn/useStandPoseDrag';
import {
  isVnImageReady,
  markVnImageReady,
  preloadVnImage,
  subscribeVnImageReady,
} from '@/lib/vn/preloadVnImages';
import { VN_STAND_LAYOUT } from '@/lib/vn/standLayout';
import {
  DIALOGUE_FX_MS,
  DIALOGUE_MOTION_MS,
  normalizeMotion,
  ocMotionClass,
  type DialogueFx,
  type DialogueMotion,
} from '@/lib/vn/motions';
import { VnCharBloom, VnCharFx } from '@/components/shared/VnCharFx';

const POS_CLASS = {
  left: styles.pos_left,
  center: styles.pos_center,
  right: styles.pos_right,
} as const;

/** 글로벌 키프레임 클래스 (CSS module 트리셰이크/해시 이슈 회피) */
const ENTER_GLOBAL: Record<string, string> = {
  fade: 'vn-spr-enter-fade',
  slide_left: 'vn-spr-enter-slide-left',
  slide_right: 'vn-spr-enter-slide-right',
  slide_up: 'vn-spr-enter-slide-up',
  pop: 'vn-spr-enter-pop',
};

export type CharacterSpriteProps = {
  character: string;
  expression: string;
  position: 'left' | 'center' | 'right';
  src: string;
  dimmed?: boolean;
  offsetX?: number;
  offsetY?: number;
  x?: number;
  y?: number;
  scale?: number;
  anim?: VNSpriteAnim;
  phase: 'enter' | 'expression' | 'idle' | 'exit';
  /** 등장 리마운트용 — 바뀔 때마다 애니 재시작 */
  enterToken?: number;
  onExitDone?: () => void;
  /** 화자 몸 움직임 (통통 등) */
  motion?: import('@/lib/vn/motions').DialogueMotion | null;
  /** 머리 위 기호 */
  fx?: import('@/lib/vn/motions').DialogueFx | null;
  /** 줄 id — 같은 motion 이라도 줄마다 재생 */
  motionKey?: string | null;
  /** 등장 연출 지연 (ms) */
  enterDelayMs?: number;
};

/**
 * 단일 캐릭터 슬롯.
 * 등장/퇴장 애니는 스택(래퍼)에 걸어 표정 교체와 분리.
 * 표정은 더블 버퍼로 이전 프레임을 유지한 채 즉시 교체(딜레이·공백 없음).
 */
export function CharacterSprite({
  character,
  expression,
  position,
  src,
  dimmed = false,
  offsetX,
  offsetY,
  x,
  y,
  scale,
  anim,
  phase,
  enterToken = 0,
  onExitDone,
  motion = null,
  fx = null,
  motionKey = null,
  enterDelayMs = 0,
}: CharacterSpriteProps) {
  /* 더블 버퍼 — 보이는 레이어는 절대 비우지 않음 */
  const [bufA, setBufA] = useState(src);
  const [bufB, setBufB] = useState(src);
  const [front, setFront] = useState<'a' | 'b'>('a');
  const [livePhase, setLivePhase] = useState(phase);
  const [enterPlay, setEnterPlay] = useState(false);
  const [liveFx, setLiveFx] = useState<DialogueFx | null>(null);
  const [liveMotion, setLiveMotion] = useState<DialogueMotion | null>(null);
  const [pulseOn, setPulseOn] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);
  const motionHostRef = useRef<HTMLDivElement | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fxClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionPlayedKey = useRef<string | null>(null);
  const fxGen = useRef(0);
  const onExitRef = useRef(onExitDone);
  onExitRef.current = onExitDone;
  const srcRef = useRef(src);
  srcRef.current = src;
  const frontRef = useRef(front);
  frontRef.current = front;

  const px = x ?? offsetX;
  const py = y ?? offsetY;
  const wantMotion = normalizeMotion(motion);
  const shownSrc = front === 'a' ? bufA : bufB;

  useLayoutEffect(() => {
    setLivePhase(phase);
  }, [phase]);

  const tryStartEnter = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalHeight > 0) {
      markVnImageReady(srcRef.current);
      setEnterPlay(true);
    }
  }, []);

  useLayoutEffect(() => {
    if (phase !== 'enter') {
      setEnterPlay(false);
      return;
    }
    /* src(표정)는 deps에 넣지 않음 — 표정만 바뀌어도 등장 연출을 리셋하지 않음 */
    setEnterPlay(false);
    let raf = 0;
    const delay = Math.max(0, enterDelayMs || 0);
    const t = window.setTimeout(() => {
      raf = requestAnimationFrame(() => tryStartEnter());
    }, delay);
    return () => {
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [phase, enterToken, tryStartEnter, enterDelayMs]);

  useEffect(() => {
    if (phase !== 'enter') return;
    return subscribeVnImageReady(src, () => {
      requestAnimationFrame(() => tryStartEnter());
    });
  }, [phase, enterToken, src, tryStartEnter]);

  /* 표정 전환: 백 버퍼에 올린 뒤 decode 완료 후 전면 교체 (빈 프레임 방지) */
  useLayoutEffect(() => {
    if (!src) return;
    const visible = frontRef.current === 'a' ? bufA : bufB;
    if (src === visible) return;

    const back: 'a' | 'b' = frontRef.current === 'a' ? 'b' : 'a';
    if (back === 'a') setBufA(src);
    else setBufB(src);

    let cancelled = false;
    const token = src;

    const reveal = () => {
      if (cancelled || srcRef.current !== token) return;
      setFront(back);
    };

    const run = async () => {
      /* 캐시 hit 이면 바로 한 프레임 뒤 교체 */
      if (isVnImageReady(token)) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        reveal();
        return;
      }

      await preloadVnImage(token);
      if (cancelled || srcRef.current !== token) return;

      /* 백 버퍼 img 가 새 src 로 붙은 뒤 decode */
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      if (cancelled || srcRef.current !== token) return;

      const el = back === 'a' ? imgARef.current : imgBRef.current;
      try {
        if (el && typeof el.decode === 'function') await el.decode();
      } catch {
        /* ignore */
      }
      reveal();
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (phase !== 'exit') return;
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => onExitRef.current?.(), 380);
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [phase]);

  /*
   * 몸 움직임 — OC와 동일: CSS 클래스만 (WAAPI 병행 시 두 번 튐).
   * motionKey당 1회. 등장 중이면 보일 때까지 기다렸다가 한 번만.
   */
  useEffect(() => {
    if (motionClearRef.current) clearTimeout(motionClearRef.current);

    if (!wantMotion) {
      setLiveMotion(null);
      setPulseOn(false);
      motionPlayedKey.current = null;
      return;
    }
    if (livePhase === 'exit') return;
    if (livePhase === 'enter' && !enterPlay) return;

    const playKey = `${motionKey ?? ''}:${wantMotion}`;
    if (motionPlayedKey.current === playKey) return;

    let cancelled = false;
    let raf2 = 0;
    setLiveMotion(null);
    setPulseOn(false);
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        motionPlayedKey.current = playKey;
        setLiveMotion(wantMotion);
        setPulseOn(wantMotion === 'pulse');
        motionClearRef.current = setTimeout(() => {
          setLiveMotion(null);
          setPulseOn(false);
        }, DIALOGUE_MOTION_MS[wantMotion]);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (motionClearRef.current) clearTimeout(motionClearRef.current);
    };
  }, [wantMotion, motionKey, character, livePhase, enterPlay]);

  useEffect(() => {
    const gen = ++fxGen.current;
    if (fxClearRef.current) clearTimeout(fxClearRef.current);
    if (!fx) {
      setLiveFx(null);
      return;
    }
    setLiveFx(null);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (gen !== fxGen.current) return;
        setLiveFx(fx);
        fxClearRef.current = setTimeout(() => setLiveFx(null), DIALOGUE_FX_MS);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (fxClearRef.current) clearTimeout(fxClearRef.current);
    };
  }, [fx, motionKey, character]);

  const posClass = POS_CLASS[position] ?? '';
  const slotPhaseClass = livePhase === 'exit' ? styles.spriteExit : '';
  const animKey = (anim ?? 'fade').replace(/-/g, '_');
  const waitingEnter = livePhase === 'enter' && !enterPlay;
  const enterClass =
    livePhase === 'enter' && enterPlay
      ? ENTER_GLOBAL[animKey] ?? ENTER_GLOBAL.fade
      : '';
  const exitClass = livePhase === 'exit' ? 'vn-spr-exit' : '';
  const dimClass = dimmed ? styles.spriteDimmed : styles.spriteSpeaking;
  const motionClass = ocMotionClass(liveMotion);

  const customStyle: CSSProperties = {};
  if (px != null) {
    customStyle.left = `calc(50% + ${px}%)`;
    customStyle.right = 'auto';
    customStyle.transform = 'translateX(-50%)';
  } else if (position === 'center') {
    customStyle.transform = 'translateX(-50%)';
  }
  if (py != null) customStyle.bottom = `calc(0% - ${py}%)`;
  if (waitingEnter) customStyle.opacity = 0;

  const standScale = scale != null && scale > 0 ? scale : 1;

  const onBufLoad = (_layer: 'a' | 'b', url: string) => {
    markVnImageReady(url);
    /* 표정 교체는 decode 후 layout effect 에서만 setFront — onLoad 즉시 스왑은 디코드 전 끊김 유발 */
    if (srcRef.current !== url) return;
    if (livePhase === 'enter' || phase === 'enter') setEnterPlay(true);
  };

  return (
    <div
      className={`${styles.spriteSlot} ${posClass} ${slotPhaseClass} ${dimClass}`}
      style={Object.keys(customStyle).length ? customStyle : undefined}
      data-character={character}
      data-expression={expression}
      data-motion={liveMotion || wantMotion || undefined}
    >
      {/* 스케일은 편집기와 동일 — 안쪽 scaler + 발끝(origin bottom). 슬롯에 scale 쓰면 작아 보임 */}
      <div
        className={styles.spriteScaler}
        style={{
          transform: `scale(${standScale})`,
          transformOrigin: 'center bottom',
        }}
      >
        <div
          ref={motionHostRef}
          className={`oc-char-motion-host${motionClass}`}
          style={{
            height: '100%',
            width: 'auto',
            position: 'relative',
            transformOrigin: 'center bottom',
          }}
        >
          <VnCharFx fx={liveFx} className={liveFx ? ` is-${liveFx}` : ''} />
          {pulseOn ? <VnCharBloom src={shownSrc} /> : null}
          <div
            className={`${styles.spriteStack}${enterClass ? ` ${enterClass}` : ''}${
              exitClass ? ` ${exitClass}` : ''
            }`}
          >
            <img
              ref={(el) => {
                imgARef.current = el;
                if (front === 'a') imgRef.current = el;
              }}
              className={`${styles.sprite}${front === 'a' ? '' : ` ${styles.spriteBuf}`}`}
              src={bufA}
              alt=""
              draggable={false}
              decoding={front === 'a' ? 'async' : 'sync'}
              fetchPriority={livePhase === 'enter' && front === 'a' ? 'high' : 'auto'}
              style={{ opacity: front === 'a' ? 1 : 0 }}
              onLoad={() => onBufLoad('a', bufA)}
            />
            <img
              ref={(el) => {
                imgBRef.current = el;
                if (front === 'b') imgRef.current = el;
              }}
              className={`${styles.sprite}${front === 'b' ? '' : ` ${styles.spriteBuf}`}`}
              src={bufB}
              alt=""
              draggable={false}
              decoding={front === 'b' ? 'async' : 'sync'}
              fetchPriority={livePhase === 'enter' && front === 'b' ? 'high' : 'auto'}
              style={{ opacity: front === 'b' ? 1 : 0 }}
              onLoad={() => onBufLoad('b', bufB)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type SpriteInput = {
  character: string;
  expression: string;
  position: 'left' | 'center' | 'right';
  standSlot?: import('@/lib/vn/standPosBySlot').StandSlot;
  crowdLayout?: boolean;
  dimmed?: boolean;
  offsetX?: number;
  offsetY?: number;
  x?: number;
  y?: number;
  scale?: number;
  anim?: VNSpriteAnim;
  enterDelayMs?: number;
};

type SlotState = SpriteInput & {
  key: string;
  src: string;
  phase: 'enter' | 'expression' | 'idle' | 'exit';
  enterToken: number;
};

export type SpriteLayerProps = {
  sprites: SpriteInput[];
  resolveUrl: (character: string, expression: string) => string | undefined;
  /** 관리자 위치 조정 모드 */
  poseEditMode?: boolean;
  selectedKey?: string | null;
  onSelectKey?: (key: string) => void;
  onPoseChange?: (
    key: string,
    pose: StandPose,
    slot?: import('@/lib/vn/standPosBySlot').StandSlot,
  ) => void;
  /** 현재 줄 화자 키 — motion/fx 적용 대상 */
  speakingKey?: string | null;
  motion?: DialogueMotion | null;
  fx?: DialogueFx | null;
  motionKey?: string | null;
};

function slotKey(s: { character: string }) {
  return s.character;
}

/** 같은 자리 판별 — 퇴장·등장이 겹칠 때 즉시 제거용 */
function slotPosKey(s: { x?: number; offsetX?: number; position: string }) {
  const x = s.x ?? s.offsetX;
  if (x != null && Number.isFinite(x)) return `x:${Math.round(x)}`;
  return `p:${s.position}`;
}

function poseFromSprite(s: SpriteInput): StandPose {
  return spriteSlotToStandPose(s);
}

function EditableStandSlot({
  slot,
  selected,
  stageSize,
  onSelect,
  onPoseChange,
}: {
  slot: SlotState;
  selected: boolean;
  stageSize: { w: number; h: number };
  onSelect: () => void;
  onPoseChange?: (pose: StandPose) => void;
}) {
  const pose = poseFromSprite(slot);
  const { figureRef, scalerRef, dragging, figureStyle, handlers } = useStandPoseDrag(
    pose,
    onPoseChange,
    /* 전원 드래그 가능 — 클릭한 캐릭터가 선택됨 */
    Boolean(onPoseChange),
    stageSize,
    'center',
  );

  return (
    <div
      ref={figureRef}
      className={`${styles.spriteSlot} ${styles.pos_center}${
        slot.dimmed && !selected ? ` ${styles.spriteDimmed}` : ` ${styles.spriteSpeaking}`
      }${selected ? ` ${styles.spritePoseSelected}` : ''}${
        dragging ? ` ${styles.spritePoseDragging}` : ''
      }`}
      style={{
        ...figureStyle,
        height: 'min(88%, 920px)',
      }}
      data-character={slot.character}
      data-expression={slot.expression}
      onClick={(e) => {
        e.stopPropagation();
        if (dragging) return;
        onSelect();
      }}
      onPointerDown={(e) => {
        onSelect();
        handlers.onPointerDown?.(e);
      }}
      onPointerMove={handlers.onPointerMove}
    >
      <div
        ref={scalerRef}
        className={styles.spriteScaler}
        /* scale 은 useStandPoseDrag writeScale 이 DOM에 직접 씀 — React style 덮어쓰기 금지 */
      >
        <img className={styles.sprite} src={slot.src} alt="" draggable={false} />
      </div>
    </div>
  );
}

/** 등장·표정·퇴장 전환을 관리하는 스프라이트 레이어 */
export function SpriteLayer({
  sprites,
  resolveUrl,
  poseEditMode = false,
  selectedKey = null,
  onSelectKey,
  onPoseChange,
  speakingKey = null,
  motion = null,
  fx = null,
  motionKey = null,
}: SpriteLayerProps) {
  const [slots, setSlots] = useState<SlotState[]>([]);
  const prevJson = useRef('');
  const prevResolve = useRef(resolveUrl);
  const tokenRef = useRef(0);
  const { stageRef, size } = useStagePixelSize();

  useEffect(() => {
    const json = JSON.stringify(sprites);
    const resolveChanged = prevResolve.current !== resolveUrl;
    if (json === prevJson.current && !resolveChanged) return;
    prevJson.current = json;
    prevResolve.current = resolveUrl;

    setSlots((prev) => {
      const nextKeys = new Set(sprites.map(slotKey));
      const prevMap = new Map(prev.map((s) => [s.key, s]));
      const out: SlotState[] = [];

      for (const sp of sprites) {
        const key = slotKey(sp);
        const src = resolveUrl(sp.character, sp.expression);
        if (!src) continue;
        void preloadVnImage(src);
        const old = prevMap.get(key);
        if (!old || old.phase === 'exit') {
          tokenRef.current += 1;
          out.push({ ...sp, key, src, phase: 'enter', enterToken: tokenRef.current });
        } else if (old.expression !== sp.expression || old.src !== src) {
          /* 표정만 바뀜 — 등장 중이면 enter 유지(연출 끊김 방지), 그 외 idle에서 즉시 교체 */
          out.push({
            ...old,
            ...sp,
            key,
            src,
            phase: old.phase === 'enter' ? 'enter' : 'idle',
            enterToken: old.enterToken,
          });
        } else {
          out.push({
            ...old,
            ...sp,
            key,
            src,
            /* resolveUrl 참조만 바뀐 경우에도 등장 연출 유지 (이 분기에선 exit 없음) */
            phase: old.phase,
            enterToken: old.enterToken,
          });
        }
      }

      for (const old of prev) {
        if (!nextKeys.has(old.key) && old.phase !== 'exit') {
          out.push({ ...old, phase: 'exit' });
        } else if (!nextKeys.has(old.key) && old.phase === 'exit') {
          out.push(old);
        }
      }

      /* 같은 자리에 새 스탠딩이 있으면 퇴장 애니 없이 즉시 제거 — 겹침 방지 */
      const taken = new Set(
        out.filter((s) => s.phase !== 'exit').map((s) => slotPosKey(s)),
      );
      return out.filter((s) => s.phase !== 'exit' || !taken.has(slotPosKey(s)));
    });
  }, [sprites, resolveUrl]);

  const enterSig = slots
    .filter((s) => s.phase === 'enter')
    .map((s) => `${s.key}:${s.enterToken}`)
    .join('|');
  const enterMaxDelay = slots
    .filter((s) => s.phase === 'enter')
    .reduce((m, s) => Math.max(m, s.enterDelayMs || 0), 0);

  useEffect(() => {
    if (poseEditMode) return;
    if (!enterSig) return;
    /* 표정/dim 갱신으로 slots가 바뀌어도 타이머를 리셋하지 않음 — 등장 연출 유지 */
    const t = window.setTimeout(() => {
      setSlots((prev) =>
        prev.map((s) => (s.phase === 'enter' ? { ...s, phase: 'idle' as const } : s)),
      );
    }, 1400 + enterMaxDelay);
    return () => clearTimeout(t);
  }, [enterSig, enterMaxDelay, poseEditMode]);

  const visible = poseEditMode ? slots.filter((s) => s.phase !== 'exit') : slots;
  const { left: guideLeft, center: guideCenter, right: guideRight } = VN_STAND_LAYOUT.slotBaseX;
  /* 화자가 무대에 있으면 그 캐릭터, 없으면 첫 스탠딩 */
  const motionTarget = (() => {
    if (!motion) return null;
    const speak =
      speakingKey || visible.find((s) => !s.dimmed)?.character || null;
    if (speak && visible.some((s) => s.character === speak)) return speak;
    return visible[0]?.character ?? null;
  })();

  return (
    <div
      ref={stageRef}
      className={`${styles.sprites}${poseEditMode ? ` ${styles.spritesPoseEdit}` : ''}`}
      aria-hidden={!poseEditMode}
    >
      {poseEditMode ? (
        <div className={styles.standGuides} aria-hidden="true">
          <span
            className={`${styles.standGuideV} ${styles.standGuideSlot}`}
            style={{ left: `calc(50% + ${guideLeft}%)` }}
          />
          <span
            className={`${styles.standGuideV} ${styles.standGuideCenter}`}
            style={{ left: `calc(50% + ${guideCenter}%)` }}
          />
          <span
            className={`${styles.standGuideV} ${styles.standGuideSlot}`}
            style={{ left: `calc(50% + ${guideRight}%)` }}
          />
          <span className={styles.standGuideH} />
          <span className={styles.standGuideLabelL}>LEFT</span>
          <span className={styles.standGuideLabelC}>CENTER</span>
          <span className={styles.standGuideLabelR}>RIGHT</span>
        </div>
      ) : null}
      {visible.map((s) =>
        poseEditMode ? (
          <EditableStandSlot
            key={s.key}
            slot={s}
            selected={selectedKey === s.key}
            stageSize={size}
            onSelect={() => onSelectKey?.(s.key)}
            onPoseChange={
              onPoseChange
                ? (pose) =>
                    onPoseChange(
                      s.key,
                      pose,
                      s.standSlot || (s.crowdLayout ? undefined : 'center'),
                    )
                : undefined
            }
          />
        ) : (
          <CharacterSprite
            key={s.key}
            character={s.character}
            expression={s.expression}
            position={s.position}
            src={s.src}
            dimmed={s.dimmed}
            offsetX={s.offsetX}
            offsetY={s.offsetY}
            x={s.x}
            y={s.y}
            scale={s.scale}
            anim={s.anim ?? 'fade'}
            phase={s.phase}
            enterToken={s.enterToken}
            enterDelayMs={s.enterDelayMs}
            onExitDone={() => setSlots((prev) => prev.filter((x) => x.key !== s.key))}
            motion={motionTarget && s.character === motionTarget ? motion : null}
            fx={motionTarget && s.character === motionTarget ? fx : null}
            motionKey={motionTarget && s.character === motionTarget ? motionKey : null}
          />
        ),
      )}
    </div>
  );
}
