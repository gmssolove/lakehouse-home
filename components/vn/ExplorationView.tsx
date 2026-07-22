'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DialogueBox } from './DialogueBox';
import { VnLocationBanner } from './VnLocationBanner';
import { useVnBgm } from './useVnBgm';
import type { ExplorationScene, Hotspot, VNLine } from './types';
import { saveVnSlot, type VNSaveData } from '@/lib/vn/vnSave';
import styles from './exploration.module.css';

type Props = {
  scene: ExplorationScene;
  active?: boolean;
  leaving?: boolean;
  initialChecked?: string[];
  missionsActive?: string[];
  onClose?: () => void;
  onNext?: (nextSceneId: string) => void;
  backgroundUrl?: (key: string) => string | undefined;
  bgmUrl?: (key: string) => string | undefined;
};

function lineVisibleText(line: VNLine) {
  return (line.text || '').trim() || '……';
}

export function ExplorationView({
  scene,
  active = true,
  leaving = false,
  initialChecked = [],
  missionsActive = [],
  onClose,
  onNext,
  backgroundUrl = (key) => `/vn/backgrounds/${key}.png`,
  bgmUrl = (key) => `/vn/bgm/${key}.mp3`,
}: Props) {
  const [checked, setChecked] = useState<string[]>(() => {
    if (initialChecked.length) return [...initialChecked];
    try {
      const raw = sessionStorage.getItem(`vn-hotspots:${scene.id}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [saveMsg, setSaveMsg] = useState('');

  const resolveBgm = useCallback(
    (key: string) => {
      if (!key || key === 'none') return undefined;
      return bgmUrl(key) ?? undefined;
    },
    [bgmUrl],
  );

  useVnBgm(active && !leaving ? scene.bgm ?? null : null, resolveBgm);

  const bgUrl = backgroundUrl(scene.background) ?? `/vn/backgrounds/${scene.background}.png`;

  const visibleHotspots = useMemo(
    () =>
      scene.hotspots.filter((h) => {
        if (!h.requiresMission) return true;
        return missionsActive.includes(h.requiresMission);
      }),
    [scene.hotspots, missionsActive],
  );

  const uncheckedOptional = visibleHotspots.filter(
    (h) => !h.oneTime && !checked.includes(h.id),
  );

  const dialogueLines = activeHotspot?.lines ?? [];
  const currentLine = dialogueLines[lineIndex] ?? null;
  const fullText = currentLine ? lineVisibleText(currentLine) : '';
  const isTyping = Boolean(currentLine) && typedLen < fullText.length;
  const displayText = typedLen > 0 ? fullText.slice(0, typedLen) : '';

  useEffect(() => {
    if (!currentLine) return;
    setTypedLen(0);
  }, [activeHotspot?.id, lineIndex]);

  useEffect(() => {
    if (!currentLine || typedLen >= fullText.length) return;
    const t = window.setTimeout(() => setTypedLen((n) => n + 1), 42);
    return () => window.clearTimeout(t);
  }, [currentLine, fullText.length, typedLen]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`vn-hotspots:${scene.id}`, JSON.stringify(checked));
    } catch {
      /* ignore */
    }
  }, [checked, scene.id]);

  const closeDialogue = useCallback(() => {
    if (activeHotspot) {
      setChecked((prev) =>
        prev.includes(activeHotspot.id) ? prev : [...prev, activeHotspot.id],
      );
    }
    setActiveHotspot(null);
    setLineIndex(0);
    setTypedLen(0);
  }, [activeHotspot]);

  const advanceDialogue = useCallback(() => {
    if (!activeHotspot) return;
    if (isTyping) {
      setTypedLen(fullText.length);
      return;
    }
    if (lineIndex >= dialogueLines.length - 1) {
      closeDialogue();
      return;
    }
    setLineIndex((i) => i + 1);
  }, [activeHotspot, isTyping, fullText.length, lineIndex, dialogueLines.length, closeDialogue]);

  const openHotspot = (h: Hotspot) => {
    if (leaving) return;
    if (h.oneTime && checked.includes(h.id)) return;
    setActiveHotspot(h);
    setLineIndex(0);
    setTypedLen(0);
  };

  const handleNext = () => {
    if (leaving) return;
    if (scene.nextSceneId) onNext?.(scene.nextSceneId);
    else onClose?.();
  };

  const quickSave = async () => {
    try {
      await saveVnSlot('save_1', {
        sceneId: scene.id,
        lineId: '__explore__',
        hotspotsChecked: checked,
        missionsActive,
      });
      setSaveMsg('저장됨');
      window.setTimeout(() => setSaveMsg(''), 1200);
    } catch {
      setSaveMsg('저장 실패');
    }
  };

  const applyLoad = (data: VNSaveData) => {
    if (data.sceneId !== scene.id) {
      onNext?.(data.sceneId);
      return;
    }
    setChecked(data.hotspotsChecked ?? []);
    setActiveHotspot(null);
  };

  if (!active && !leaving) return null;

  return (
    <div
      className={`${styles.root}${leaving ? ` ${styles.leaving}` : ''}`}
      role="presentation"
    >
      <div className={styles.bg} style={{ backgroundImage: `url(${bgUrl})` }} aria-hidden />
      <div className={styles.vignette} aria-hidden />

      <div className={styles.hotspotLayer}>
        {visibleHotspots.map((h) => {
          const seen = checked.includes(h.id);
          return (
            <button
              key={h.id}
              type="button"
              className={`${styles.hotspot}${!seen ? ` ${styles.hotspotPulse}` : ''}${
                seen ? ` ${styles.hotspotChecked}` : ''
              }${hoverId === h.id ? ` ${styles.hotspotHover}` : ''}`}
              style={{
                left: `${h.x}%`,
                top: `${h.y}%`,
                width: `${h.width}%`,
                height: `${h.height}%`,
              }}
              aria-label={h.label}
              disabled={Boolean(activeHotspot) || leaving}
              onMouseEnter={() => setHoverId(h.id)}
              onMouseLeave={() => setHoverId((id) => (id === h.id ? null : id))}
              onFocus={() => setHoverId(h.id)}
              onBlur={() => setHoverId((id) => (id === h.id ? null : id))}
              onClick={(e) => {
                e.stopPropagation();
                openHotspot(h);
              }}
            >
              {hoverId === h.id ? <span className={styles.tooltip}>{h.label}</span> : null}
              {seen ? (
                <span className={styles.check} aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        {uncheckedOptional.length > 0 ? (
          <p className={styles.hint}>아직 둘러보지 않은 곳이 있어요</p>
        ) : (
          <span />
        )}
        <div className={styles.footerActions}>
          <button
            type="button"
            className={styles.saveBtn}
            disabled={leaving || Boolean(activeHotspot)}
            onClick={() => void quickSave()}
          >
            {saveMsg || '세이브'}
          </button>
          <button
            type="button"
            className={styles.nextBtn}
            disabled={leaving || Boolean(activeHotspot)}
            onClick={handleNext}
          >
            다음으로
          </button>
        </div>
      </div>

      {activeHotspot && currentLine ? (
        <>
          <VnLocationBanner location={currentLine.location || scene.location} />
          <DialogueBox
            speaker={currentLine.speaker}
            text={isTyping ? displayText : displayText || fullText}
            isTyping={isTyping}
            hasNext={lineIndex < dialogueLines.length - 1}
            isNarration={!currentLine.speaker?.trim() || Boolean(currentLine.narrationOnly)}
            leaving={leaving}
            choices={[]}
            sceneId={scene.id}
            lineId={currentLine.id}
            missionsActive={missionsActive}
            missionsCompleted={[]}
            hotspotsChecked={checked}
            onClose={closeDialogue}
            onBoxClick={advanceDialogue}
            onLoadSave={applyLoad}
          />
        </>
      ) : scene.location ? (
        <VnLocationBanner location={scene.location} />
      ) : null}
    </div>
  );
}
