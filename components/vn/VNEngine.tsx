'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundLayer } from './BackgroundLayer';
import { SpriteLayer } from './CharacterSprite';
import { DialogueBox } from './DialogueBox';
import { VnChoicePanel } from './VnChoicePanel';
import { VnFxLayer } from './VnFxLayer';
import { VnMissionBanner } from './VnMissionBanner';
import { VnMissionJournal } from './VnMissionJournal';
import { VnSystemMenu, type VnLogEntry } from './VnSystemMenu';
import { useVNEngine } from './useVNEngine';
import { useVnBgm } from './useVnBgm';
import { useVnSfx } from './useVnSfx';
import type { VNAnyScene, VNAssetResolvers, VNScene } from './types';
import { isExplorationScene } from './types';
import type { VNSaveData } from '@/lib/vn/vnSave';
import styles from './vn-engine.module.css';

type Props = {
  scene: VNScene;
  scenes?: Record<string, VNAnyScene>;
  loadScene?: (sceneId: string) => Promise<VNAnyScene | null> | VNAnyScene | null;
  resolvers?: VNAssetResolvers;
  active?: boolean;
  leaving?: boolean;
  onEnd?: () => void;
  onClose?: () => void;
  /** 시스템 메뉴「메인으로」 */
  onMainMenu?: () => void;
  /** exploration 등 외부 라우팅 */
  onNavigateScene?: (sceneId: string) => void;
  onLoadSaveNavigate?: (data: VNSaveData) => void;
  className?: string;
  startLineId?: string;
};

const defaultResolvers: Required<
  Pick<VNAssetResolvers, 'backgroundUrl' | 'spriteUrl' | 'bgmUrl' | 'sfxUrl'>
> = {
  backgroundUrl: (key) => `/vn/backgrounds/${key}.png`,
  spriteUrl: (character, expression) => `/vn/characters/${character}_${expression}.png`,
  bgmUrl: (key) => `/vn/bgm/${key}.mp3`,
  sfxUrl: (key) => `/vn/sfx/${key}.mp3`,
};

function mergeResolvers(resolvers?: VNAssetResolvers): VNAssetResolvers {
  return {
    backgroundUrl: resolvers?.backgroundUrl ?? defaultResolvers.backgroundUrl,
    spriteUrl: resolvers?.spriteUrl ?? defaultResolvers.spriteUrl,
    bgmUrl: resolvers?.bgmUrl ?? defaultResolvers.bgmUrl,
    sfxUrl: resolvers?.sfxUrl ?? defaultResolvers.sfxUrl,
  };
}

export function VNEngine({
  scene,
  scenes,
  loadScene,
  resolvers: resolversProp,
  active = true,
  leaving = false,
  onEnd,
  onClose,
  onMainMenu,
  onNavigateScene,
  onLoadSaveNavigate,
  className = '',
  startLineId,
}: Props) {
  const resolvers = useMemo(() => mergeResolvers(resolversProp), [resolversProp]);
  const eng = useVNEngine({
    scene,
    scenes,
    loadScene,
    onEnd,
    onNavigateScene,
    active: active && !leaving,
    startLineId,
  });

  const bgUrl =
    eng.background && eng.background !== 'black'
      ? resolvers.backgroundUrl?.(eng.background) ?? eng.background
      : undefined;

  const resolveSprite = useCallback(
    (character: string, expression: string) =>
      resolvers.spriteUrl?.(character, expression) ?? undefined,
    [resolvers],
  );

  const resolveBgm = useCallback(
    (key: string) => {
      if (!key || key === 'none') return undefined;
      return resolvers.bgmUrl?.(key) ?? undefined;
    },
    [resolvers],
  );

  const resolveSfx = useCallback(
    (key: string) => resolvers.sfxUrl?.(key) ?? undefined,
    [resolvers],
  );

  useVnBgm(active && !leaving ? eng.bgm : null, resolveBgm);
  useVnSfx(active && !leaving ? eng.sfx : null, resolveSfx);

  const effect = eng.line?.effect;
  const narrationOnly = Boolean(eng.line?.narrationOnly);
  const hideDialogue =
    narrationOnly || effect === 'blackout' || effect === 'titlecard';
  const isNarration = !eng.line?.speaker?.trim();
  const ghastly = effect === 'ghastly-dim';
  const shake =
    effect === 'shake' || effect === 'shake-advanced';

  const { advance, choices, jumpTo, skipTyping, pickChoice, clearMissionBanner } = eng;
  const handleClose = onClose ?? (() => undefined);
  const goMain = onMainMenu ?? handleClose;

  const [sysOpen, setSysOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [log, setLog] = useState<VnLogEntry[]>([]);
  const loggedKeyRef = useRef<string>('');

  /** titlecard 타임라인 중 클릭 잠금 */
  const [fxLocked, setFxLocked] = useState(false);
  const titleDoneRef = useRef(false);

  const applyLoadSave = useCallback(
    (data: VNSaveData) => {
      const target = scenes?.[data.sceneId];
      if (target && isExplorationScene(target)) {
        onLoadSaveNavigate?.(data);
        return;
      }
      if (data.sceneId !== eng.scene.id && onLoadSaveNavigate) {
        onLoadSaveNavigate(data);
        return;
      }
      void jumpTo(data.sceneId, data.lineId, {
        missionsActive: data.missionsActive ?? [],
        missionsCompleted: data.missionsCompleted ?? [],
      });
    },
    [scenes, onLoadSaveNavigate, eng.scene.id, jumpTo],
  );

  useEffect(() => {
    titleDoneRef.current = false;
    if (effect === 'titlecard') setFxLocked(true);
    else setFxLocked(false);
  }, [eng.line?.id, effect]);

  useEffect(() => {
    if (!active || leaving) return;
    if (effect === 'blackout' || effect === 'titlecard') {
      skipTyping();
    }
  }, [active, leaving, eng.line?.id, effect, skipTyping]);

  /* 지난 대사 로그 — 라인 전환 시 직전 풀텍스트 기록 */
  useEffect(() => {
    if (!active || leaving) return;
    const line = eng.line;
    if (!line) return;
    const raw = (line.text || '').trim();
    if (!raw) return;
    const key = `${eng.scene.id}:${line.id}`;
    if (loggedKeyRef.current === key) return;
    /* 타이핑 완료 후에만 로그 (선택지·전환 전 완성본) */
    if (eng.isTyping) return;
    loggedKeyRef.current = key;
    setLog((prev) => [
      ...prev,
      {
        speaker: line.speaker?.trim() || undefined,
        text: raw,
      },
    ]);
  }, [active, leaving, eng.scene.id, eng.line, eng.isTyping, eng.lineIndex]);

  const showChoices = choices.length > 0 && !eng.isTyping && !leaving;

  const tryAdvance = useCallback(() => {
    if (sysOpen || fxLocked) return;
    if (choices.length && !eng.isTyping) return;
    advance();
  }, [sysOpen, fxLocked, choices.length, eng.isTyping, advance]);

  const onTitlecardComplete = useCallback(() => {
    if (titleDoneRef.current) return;
    titleDoneRef.current = true;
    setFxLocked(false);
    advance();
  }, [advance]);

  const toggleSys = useCallback(() => {
    setSysOpen((o) => !o);
  }, []);

  useEffect(() => {
    if (!active || leaving) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleSys();
        return;
      }
      if (sysOpen) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        tryAdvance();
      }
    }
    function onContext(e: MouseEvent) {
      e.preventDefault();
      toggleSys();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onContext);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
    };
  }, [active, leaving, toggleSys, tryAdvance, sysOpen]);

  if (!active && !leaving) return null;

  const lineKey = `${eng.scene.id}:${eng.line?.id ?? eng.lineIndex}`;

  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ''}${leaving ? ` ${styles.leaving}` : ''}${shake ? ` ${styles.effectShakeAdvanced}` : ''}`}
      role="presentation"
      onClick={(e) => {
        if (leaving || sysOpen) return;
        if (
          (e.target as HTMLElement).closest(
            '.lh-vn-box, .lh-vn-choice, .lh-vn-close, .lh-vn-savebar, .lh-vn-slot-panel',
          )
        )
          return;
        if (
          (e.target as HTMLElement).closest(
            `[class*="choiceOverlay"], [class*="sysOverlay"], [class*="missionJournal"], [class*="missionFab"]`,
          )
        )
          return;
        tryAdvance();
      }}
    >
      <div
        className={`${styles.stage}${ghastly ? ` ${styles.ghastlyDim}` : ''}${eng.background === 'black' ? ` ${styles.stageBlack}` : ''}`}
        aria-hidden
      >
        <BackgroundLayer background={eng.background} url={bgUrl} />
        <SpriteLayer sprites={eng.sprites} resolveUrl={resolveSprite} />
      </div>

      <div className={styles.vignette} aria-hidden />

      <button
        type="button"
        className={styles.missionFab}
        aria-label="미션 수첩"
        title="미션 수첩"
        onClick={(e) => {
          e.stopPropagation();
          setJournalOpen((o) => !o);
        }}
      >
        ✦
      </button>

      <VnMissionJournal
        open={journalOpen}
        activeIds={eng.missionsActive}
        completedIds={eng.missionsCompleted}
        onClose={() => setJournalOpen(false)}
      />

      <VnMissionBanner missionId={eng.missionBannerId} onDone={clearMissionBanner} />

      <VnFxLayer
        lineKey={lineKey}
        caption={eng.line?.caption}
        narrationOnly={
          narrationOnly && effect !== 'blackout' && effect !== 'titlecard'
        }
        narrationText={
          narrationOnly && effect !== 'blackout' && effect !== 'titlecard'
            ? eng.isTyping
              ? eng.displayText
              : eng.displayText || eng.line?.text || ''
            : undefined
        }
        effect={effect}
        titleText={eng.line?.titleText}
        onTitlecardComplete={onTitlecardComplete}
      />

      {!hideDialogue ? (
        <DialogueBox
          speaker={eng.line?.speaker}
          text={eng.isTyping ? eng.displayText : eng.displayText || eng.line?.text || ''}
          isTyping={eng.isTyping}
          hasNext={!eng.atEnd && !choices.length}
          isNarration={isNarration}
          leaving={leaving}
          choices={[]}
          location={eng.scene.location}
          sceneId={eng.scene.id}
          lineId={eng.line?.id}
          missionsActive={eng.missionsActive}
          missionsCompleted={eng.missionsCompleted}
          onClose={handleClose}
          onBoxClick={() => tryAdvance()}
          onLoadSave={applyLoadSave}
        />
      ) : null}

      {showChoices ? (
        <VnChoicePanel
          choices={choices.map((c) => ({ text: c.text, nextSceneId: c.nextSceneId }))}
          onPick={(nextSceneId) => {
            pickChoice(nextSceneId);
          }}
        />
      ) : null}

      <VnSystemMenu
        open={sysOpen}
        sceneId={eng.scene.id}
        lineId={eng.line?.id}
        missionsActive={eng.missionsActive}
        missionsCompleted={eng.missionsCompleted}
        log={log}
        onClose={() => setSysOpen(false)}
        onMainMenu={goMain}
        onLoadSave={applyLoadSave}
      />
    </div>
  );
}
