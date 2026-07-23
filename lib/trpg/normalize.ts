import { mergePlayerInfoFields } from '@/lib/trpg/defaultPlayerInfo';
import { normalizeImageFrame, type ImageFrame } from '@/lib/shared/imageFrame';
import type {
  TrpgDiceHighlight,
  TrpgGalleryItem,
  TrpgHandout,
  TrpgPlayerItem,
  TrpgPlayerProfile,
  TrpgRelationship,
  TrpgScenario,
  TrpgSessionLog,
} from '@/lib/types/site-content';
import { isDialogueFx, isDialogueMotion } from '@/lib/vn/motions';
import { collapseStickyVignette, normalizeVnMaxOnStage, parseLineMaxOnStage } from '@/lib/vn/parseCcfoliaLog';
import { normalizeHandoutLayout } from '@/lib/vn/handoutLayout';
import { normalizeMenuTheme } from '@/lib/vn/menuTheme';
import {
  normalizeStandPosBySlot,
  normalizeStandPosField,
} from '@/lib/vn/standPosBySlot';

function normalizeImageFrameField(raw: unknown): ImageFrame | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const frame = normalizeImageFrame({
    scale: row.scale != null ? Number(row.scale) : undefined,
    x: row.x != null ? Number(row.x) : undefined,
    y: row.y != null ? Number(row.y) : undefined,
  });
  if (frame.scale === 1 && frame.x === 0 && frame.y === 0) return undefined;
  return frame;
}

function normalizeQuotePos(raw: unknown): { x?: number; y?: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const x = row.x != null ? Number(row.x) : NaN;
  const y = row.y != null ? Number(row.y) : NaN;
  const pos: { x?: number; y?: number } = {};
  if (Number.isFinite(x)) pos.x = Math.min(95, Math.max(5, x));
  if (Number.isFinite(y)) pos.y = Math.min(95, Math.max(5, y));
  return pos.x != null || pos.y != null ? pos : undefined;
}

function normalizeQuoteAlign(raw: unknown): 'left' | 'center' | 'right' | undefined {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'left' || v === 'center' || v === 'right') return v;
  return undefined;
}

/** Firebase RTDB: 구멍 난 배열은 객체({0:…,2:…})로 돌아오므로 배열로 복원 */
function coerceFirebaseList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (!keys.length) return [];
  if (keys.every((k) => /^\d+$/.test(k))) {
    return keys
      .map((k) => Number(k))
      .sort((a, b) => a - b)
      .map((i) => obj[String(i)]);
  }
  return Object.values(obj);
}

function asArray<T>(raw: unknown, map: (v: Record<string, unknown>) => T): T[] {
  return coerceFirebaseList(raw).map((item) => map((item ?? {}) as Record<string, unknown>));
}

function normalizeLog(raw: Record<string, unknown>): TrpgSessionLog {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '세션 로그').trim(),
    subtitle: String(raw.subtitle || '').trim() || undefined,
    date: String(raw.date || '').trim() || undefined,
    body: String(raw.body || '').trim(),
    html: String(raw.html || '').trim() || undefined,
    thumbnail: String(raw.thumbnail || '').trim() || undefined,
    thumbnailSpoiler: Boolean(raw.thumbnailSpoiler),
    summary: String(raw.summary || '').trim() || undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined,
    playerIds: Array.isArray(raw.playerIds) ? raw.playerIds.map(String).filter(Boolean) : undefined,
    logFontSize: raw.logFontSize != null ? Number(raw.logFontSize) || undefined : undefined,
    logLineHeight: raw.logLineHeight != null ? Number(raw.logLineHeight) || undefined : undefined,
    secret: Boolean(raw.secret),
    secretPassword: String(raw.secretPassword || '').trim() || undefined,
  };
}

function normalizePlayer(raw: Record<string, unknown>): TrpgPlayerProfile {
  const infoFields = Array.isArray(raw.infoFields)
    ? raw.infoFields
        .map((f) => {
          const row = f as Record<string, unknown>;
          const key = String(row.key || '').trim();
          const value = String(row.value || '').trim();
          return key ? { key, value } : null;
        })
        .filter((f): f is { key: string; value: string } => !!f)
    : undefined;

  const stats = Array.isArray(raw.stats)
    ? raw.stats
        .map((s) => {
          const row = s as Record<string, unknown>;
          const label = String(row.label || '').trim();
          if (!label) return null;
          return {
            label,
            value: Number(row.value) || 0,
            max: row.max != null ? Number(row.max) || undefined : undefined,
          };
        })
        .filter((s): s is NonNullable<typeof s> => !!s)
    : undefined;

  const relations = Array.isArray(raw.relations)
    ? raw.relations
        .map((r) => {
          const row = r as Record<string, unknown>;
          const id = String(row.id || '').trim();
          const name = String(row.name || '').trim();
          const playerId = String(row.playerId || '').trim();
          if (!id || (!name && !playerId)) return null;
          return {
            id,
            playerId: playerId || undefined,
            name,
            desc: String(row.desc || '').trim() || undefined,
          };
        })
        .filter((r): r is NonNullable<typeof r> => !!r)
    : undefined;

  const expressions = Array.isArray(raw.expressions)
    ? raw.expressions
        .map((ex) => {
          const row = ex as Record<string, unknown>;
          const id = String(row.id || '').trim();
          const img = String(row.img || '').trim();
          if (!id || !img) return null;
          const kindRaw = String(row.kind || '').trim().toLowerCase();
          const kind = kindRaw === 'version' ? ('version' as const) : ('expression' as const);
          return {
            id,
            label: String(row.label || '').trim() || undefined,
            kind,
            img,
            imgFrame: normalizeImageFrameField(row.imgFrame),
            imgFit: String(row.imgFit || '').trim() || undefined,
            imgPos: String(row.imgPos || '').trim() || undefined,
          };
        })
        .filter((ex): ex is NonNullable<typeof ex> => !!ex)
    : undefined;

  const personalColorRaw = String(raw.personalColor || '').trim();
  const personalColor = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(personalColorRaw)
    ? personalColorRaw.startsWith('#')
      ? personalColorRaw
      : `#${personalColorRaw}`
    : undefined;

  return {
    id: String(raw.id || ''),
    name: String(raw.name || '').trim(),
    nameEn: String(raw.nameEn || '').trim() || undefined,
    role: String(raw.role || '').trim() || undefined,
    img: String(raw.img || '').trim() || undefined,
    imgFrame: normalizeImageFrameField(raw.imgFrame),
    imgFit: String(raw.imgFit || '').trim() || undefined,
    imgPos: String(raw.imgPos || '').trim() || undefined,
    stageImg: String(raw.stageImg || '').trim() || undefined,
    // 예전 데이터: stage 필드가 없으면 imgFrame을 스테이지 프레임으로 이관
    stageImgFrame: normalizeImageFrameField(
      Object.prototype.hasOwnProperty.call(raw, 'stageImgFrame') ||
        Object.prototype.hasOwnProperty.call(raw, 'stageImg')
        ? raw.stageImgFrame
        : raw.imgFrame,
    ),
    stageImgFit: String(raw.stageImgFit || '').trim() || undefined,
    stageImgPos: String(raw.stageImgPos || '').trim() || undefined,
    personalColor,
    quote: String(raw.quote || '').trim() || undefined,
    quotePos: normalizeQuotePos(raw.quotePos),
    quoteAlign: normalizeQuoteAlign(raw.quoteAlign),
    expressions: expressions?.length ? expressions : undefined,
    bio: String(raw.bio || '').trim() || undefined,
    appearance: String(raw.appearance || '').trim() || undefined,
    personality: String(raw.personality || '').trim() || undefined,
    traits: String(raw.traits || '').trim() || undefined,
    likes: String(raw.likes || '').trim() || undefined,
    dislikes: String(raw.dislikes || '').trim() || undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined,
    infoFields: mergePlayerInfoFields(infoFields),
    stats: stats?.length ? stats : undefined,
    relations: relations?.length ? relations : undefined,
    money: String(raw.money || '').trim() || undefined,
    itemNote: String(raw.itemNote || '').trim() || undefined,
    items: normalizePlayerItems(raw.items),
    playerName: String(raw.playerName || '').trim() || undefined,
    ocId: String(raw.ocId || '').trim() || undefined,
    handwritingNotes: (() => {
      if (!Array.isArray(raw.handwritingNotes)) return undefined;
      const notes = raw.handwritingNotes.map(String).map((u) => u.trim()).filter(Boolean);
      return notes.length ? notes : undefined;
    })(),
    handwritingNoteSfx: String(raw.handwritingNoteSfx || '').trim() || undefined,
    handwritingNoteCloseSfx: String(raw.handwritingNoteCloseSfx || '').trim() || undefined,
  };
}

function normalizePlayerItems(raw: unknown): TrpgPlayerItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: TrpgPlayerItem[] = [];
  for (const row of raw) {
    const item = (row ?? {}) as Record<string, unknown>;
    const id = String(item.id || '').trim();
    if (!id) continue;
    if (item.empty) {
      items.push({ id, name: String(item.name || '—').trim() || '—', empty: true });
      continue;
    }
    const name = String(item.name || '').trim();
    if (!name) continue;
    items.push({
      id,
      name,
      icon: String(item.icon || '').trim() || undefined,
      count: String(item.count || '').trim() || undefined,
      key: Boolean(item.key),
    });
  }
  return items.length ? items : undefined;
}

function normalizeRelation(raw: Record<string, unknown>): TrpgRelationship {
  return {
    id: String(raw.id || ''),
    fromId: String(raw.fromId || '').trim(),
    toId: String(raw.toId || '').trim(),
    label: String(raw.label || '').trim() || undefined,
  };
}

function normalizeGallery(raw: Record<string, unknown>): TrpgGalleryItem {
  const imgSingle = String(raw.img || '').trim();
  const fromImgs = Array.isArray(raw.imgs)
    ? raw.imgs.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const imgs = fromImgs.length > 0 ? fromImgs : imgSingle ? [imgSingle] : [];
  const viewModeRaw = String(raw.viewMode || '').trim();
  const viewMode = viewModeRaw === 'scroll' ? 'scroll' : viewModeRaw === 'slider' ? 'slider' : undefined;
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '').trim() || undefined,
    img: imgs[0] || '',
    imgs: imgs.length ? imgs : undefined,
    viewMode: imgs.length > 1 ? viewMode || 'slider' : undefined,
    caption: String(raw.caption || '').trim() || undefined,
    artist: formatTrpgGalleryCredit(String(raw.artist || '').trim()) || undefined,
  };
}

/** 갤러리 박스에 들어 있는 이미지 URL 목록 */
export function trpgGalleryImages(item: TrpgGalleryItem): string[] {
  if (item.imgs?.length) return item.imgs.map((s) => String(s || '').trim()).filter(Boolean);
  const single = String(item.img || '').trim();
  return single ? [single] : [];
}

/** 작가/출처 표시 — © 자동 부착 */
export function formatTrpgGalleryCredit(artist?: string): string {
  const raw = String(artist || '').trim();
  if (!raw) return '';
  const bare = raw.replace(/^©+\s*/g, '').trim();
  return bare ? `© ${bare}` : '';
}

function normalizeDice(raw: Record<string, unknown>): TrpgDiceHighlight {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '').trim(),
    roll: String(raw.roll || '').trim() || undefined,
    result: String(raw.result || '').trim() || undefined,
    note: String(raw.note || '').trim() || undefined,
    session: String(raw.session || '').trim() || undefined,
  };
}

function normalizeHandout(raw: Record<string, unknown>): TrpgHandout {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '').trim(),
    body: String(raw.body || '').trim() || undefined,
    img: String(raw.img || '').trim() || undefined,
    spoiler: Boolean(raw.spoiler),
  };
}

/** Firebase·레거시 SitePost 필드 호환 */
export function normalizeTrpgScenario(raw: Partial<TrpgScenario> & Record<string, unknown>): TrpgScenario {
  const legacy = raw as Record<string, unknown>;
  const title = String(raw.title || legacy.scenario || legacy.name || '시나리오').trim();
  const legacyBody = String(raw.body || legacy.desc || legacy.character || raw.players || '').trim();
  const legacyDate = String(legacy.date || '').trim();
  const rawIds = raw.characterIds ?? legacy.characterIds;
  const characterIds = Array.isArray(rawIds)
    ? rawIds.map((id) => String(id)).filter(Boolean)
    : typeof rawIds === 'string'
      ? rawIds.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    id: String(raw.id || ''),
    title,
    subtitle: String(raw.subtitle || '').trim() || undefined,
    titleFont: raw.titleFont,
    subtitleFont: raw.subtitleFont,
    thumbnail: String(raw.thumbnail || legacy.img || '').trim(),
    thumbnailFrame: raw.thumbnailFrame ?? normalizeImageFrameField(legacy.thumbnailFrame),
    thumbnailFit: String(raw.thumbnailFit || 'cover').trim() || 'cover',
    thumbnailPos: String(raw.thumbnailPos || 'center center').trim() || 'center center',
    categoryId: String(raw.categoryId || '').trim() || undefined,
    cardHoverTitle: String(raw.cardHoverTitle || '').trim() || undefined,
    cardHoverPcName: String(raw.cardHoverPcName || '').trim() || undefined,
    cardHoverImg: String(raw.cardHoverImg || '').trim() || undefined,
    cardHoverImgFrame: (() => {
      const frame =
        raw.cardHoverImgFrame ?? normalizeImageFrameField(legacy.cardHoverImgFrame);
      const fit = String(raw.cardHoverImgFit || '').trim();
      /* cover 시절 고배율은 contain에서도 네모 크롭 → scale 완화 */
      if (frame && (fit === 'cover' || !fit) && (frame.scale ?? 1) > 1) {
        return { ...frame, scale: 1 };
      }
      return frame;
    })(),
    cardHoverImgFit: 'contain',
    cardHoverImgPos:
      String(raw.cardHoverImgPos || '').trim() ||
      (raw.cardHoverImg ? 'right bottom' : undefined),
    author: String(raw.author || legacy.writer || '').trim(),
    kp: String(raw.kp || '').trim(),
    system: String(raw.system || '').trim(),
    dateStart: String(raw.dateStart || legacyDate || '').trim(),
    dateEnd: String(raw.dateEnd || '').trim(),
    players: String(raw.players || legacyBody || '').trim(),
    cleared: Boolean(raw.cleared),
    secret: Boolean(raw.secret),
    secretPassword: String(raw.secretPassword || '').trim() || undefined,
    summary: String(raw.summary || '').trim() || undefined,
    review: String(raw.review || '').trim() || undefined,
    sessionUrl: String(raw.sessionUrl || '').trim() || undefined,
    pageBackground: String(raw.pageBackground || '').trim() || undefined,
    pageBgm: raw.pageBgm && typeof raw.pageBgm === 'object'
      ? {
          title: String((raw.pageBgm as Record<string, unknown>).title || '').trim() || undefined,
          artist: String((raw.pageBgm as Record<string, unknown>).artist || '').trim() || undefined,
          fileUrl: String((raw.pageBgm as Record<string, unknown>).fileUrl || '').trim() || undefined,
          url: String((raw.pageBgm as Record<string, unknown>).url || '').trim() || undefined,
        }
      : undefined,
    body: String(raw.body || legacy.desc || '').trim(),
    playerProfiles: asArray(raw.playerProfiles, normalizePlayer).filter((p) => p.id && p.name),
    relationships: asArray(raw.relationships, normalizeRelation).filter((r) => r.id && r.fromId && r.toId),
    gallery: asArray(raw.gallery, normalizeGallery).filter((g) => g.id && trpgGalleryImages(g).length > 0),
    diceHighlights: asArray(raw.diceHighlights, normalizeDice).filter((d) => d.id && d.title),
    handouts: asArray(raw.handouts, normalizeHandout).filter((h) => h.id && h.title),
    relationshipNotes: String(raw.relationshipNotes || '').trim() || undefined,
    characterIds,
    logs: (() => {
      const legacyFontSize = raw.logFontSize != null ? Number(raw.logFontSize) || undefined : undefined;
      const legacyLineHeight = raw.logLineHeight != null ? Number(raw.logLineHeight) || undefined : undefined;
      return asArray(raw.logs, normalizeLog)
        .filter((l) => l.id)
        .map((l) => ({
          ...l,
          logFontSize: l.logFontSize ?? legacyFontSize,
          logLineHeight: l.logLineHeight ?? legacyLineHeight,
        }));
    })(),
    vnEditable: normalizeVnEditable(raw.vnEditable ?? legacy.vnEditable),
    vnScene: normalizeVnScene(raw.vnScene ?? legacy.vnScene, String(raw.id || '')),
    vnPlayBtnColor: (() => {
      const c = String(raw.vnPlayBtnColor || '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(c) ? c : undefined;
    })(),
  };
}

function normalizeVnEditable(raw: unknown): TrpgScenario['vnEditable'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const speakers = coerceFirebaseList(row.speakers);
  const lines = coerceFirebaseList(row.lines);
  if (!speakers.length && !lines.length) return undefined;
  const maxRaw = row.maxOnStage;
  return {
    speakers: speakers.map((s) => {
      const sp = (s ?? {}) as Record<string, unknown>;
      const pos = String(sp.position || 'left');
      return {
        key: String(sp.key || '').trim(),
        displayName: String(sp.displayName || sp.key || '').trim(),
        color: String(sp.color || '').trim() || undefined,
        position: (pos === 'center' || pos === 'right' ? pos : 'left') as 'left' | 'center' | 'right',
        sprite: String(sp.sprite || '').trim() || undefined,
        treatAsNarration: Boolean(sp.treatAsNarration),
        standPos: (() => {
          const bySlot = normalizeStandPosBySlot(
            sp.standPosBySlot,
            sp.standPos ?? sp.standPose,
          );
          return bySlot?.center ?? normalizeStandPosField(sp.standPos ?? sp.standPose);
        })(),
        standPosBySlot: normalizeStandPosBySlot(
          sp.standPosBySlot,
          sp.standPos ?? sp.standPose,
        ),
        standAnimation: (() => {
          const a = String(sp.standAnimation || '');
          if (
            a === 'fade' ||
            a === 'slide-left' ||
            a === 'slide-right' ||
            a === 'slide-up' ||
            a === 'pop'
          ) {
            return a as import('@/lib/vn/parseCcfoliaLog').ScenarioVnStandAnim;
          }
          return undefined;
        })(),
      };
    }).filter((s) => s.key),
    lines: (() => {
      const mapped = collapseStickyVignette(
        lines
          .map((l) => {
      const line = (l ?? {}) as Record<string, unknown>;
      const dice = line.diceRoll && typeof line.diceRoll === 'object'
        ? (line.diceRoll as Record<string, unknown>)
        : null;
      const mu = line.missionUpdate && typeof line.missionUpdate === 'object'
        ? (line.missionUpdate as Record<string, unknown>)
        : null;
      const isTitlecard = line.effect === 'titlecard';
      return {
        id: String(line.id || '').trim(),
        speakerKey: String(line.speakerKey || '').trim(),
        text: String(line.text || ''),
        narrationOnly: line.narrationOnly ? true : undefined,
        effect: isTitlecard
          ? ('titlecard' as const)
          : line.effect === 'diceRoll'
            ? ('diceRoll' as const)
            : undefined,
        titleText: isTitlecard ? String(line.titleText || '').trim() || undefined : undefined,
        titleSubtext: isTitlecard ? String(line.titleSubtext || '').trim() || undefined : undefined,
        chapterLoadingBefore: isTitlecard && line.chapterLoadingBefore ? true : undefined,
        chapterLoadingAfter: isTitlecard && line.chapterLoadingAfter ? true : undefined,
        diceRoll: dice
          ? {
              actor: String(dice.actor || ''),
              skill: String(dice.skill || ''),
              target: Number(dice.target) || 0,
              roll: Number(dice.roll) || 0,
              result: String(dice.result || ''),
              sfx: String(dice.sfx || '').trim() || undefined,
              resultSfx: String(dice.resultSfx || '').trim() || undefined,
            }
          : undefined,
        background: String(line.background || '').trim() || undefined,
        bgm: (() => {
          /* null 은 RTDB 에서 삭제됨 → handout 과 같이 'none' 으로 영속화 */
          if (line.bgm === null || line.bgm === 'none' || line.bgm === '__none__') {
            return 'none';
          }
          if (line.bgm === undefined || line.bgm === '') return undefined;
          return String(line.bgm);
        })(),
        ambient: (() => {
          if (
            line.ambient === null ||
            line.ambient === 'none' ||
            line.ambient === '__none__'
          ) {
            return 'none';
          }
          if (line.ambient === undefined || line.ambient === '') return undefined;
          return String(line.ambient);
        })(),
        handout: (() => {
          /* null 은 Firebase RTDB 에서 키가 삭제됨 → 'none' 으로 영속화 */
          if (
            line.handout === null ||
            line.handout === 'none' ||
            line.handout === '__none__'
          ) {
            return 'none';
          }
          if (line.handout === undefined || line.handout === '') return undefined;
          return String(line.handout);
        })(),
        sfx: String(line.sfx || '').trim() || undefined,
        motion: isDialogueMotion(line.motion) ? line.motion : undefined,
        fx: isDialogueFx(line.fx) ? line.fx : undefined,
        expression: String(line.expression || '').trim() || undefined,
        expressionPersist: (() => {
          if (!String(line.expression || '').trim()) return undefined;
          if (line.expressionPersist === false) return false;
          return true;
        })(),
        expressionUntilLineId: (() => {
          if (!String(line.expression || '').trim()) return undefined;
          if (line.expressionPersist === false) return undefined;
          const id = String(line.expressionUntilLineId || '').trim();
          return id || undefined;
        })(),
        voice: String(line.voice || '').trim() || undefined,
        location: String(line.location || '').trim() || undefined,
        hideLocation:
          line.hideLocation === true
            ? true
            : line.hideLocation === false
              ? false
              : undefined,
        vignette: line.vignette === true ? true : line.vignette === false ? false : undefined,
        visionBlur:
          line.visionBlur === true ? true : line.visionBlur === false ? false : undefined,
        hideStandings:
          line.hideStandings === true
            ? true
            : line.hideStandings === false
              ? false
              : undefined,
        maxOnStage: parseLineMaxOnStage(line.maxOnStage),
        stageOrder: (() => {
          if (!Array.isArray(line.stageOrder) || !line.stageOrder.length) return undefined;
          const seen = new Set<string>();
          const out = line.stageOrder.map((item) => {
            const k = String(item || '').trim();
            if (!k) return '';
            if (seen.has(k)) return '';
            seen.add(k);
            return k;
          });
          return out.some((k) => k) ? out : undefined;
        })(),
        stageEnterOrder: (() => {
          if (!Array.isArray(line.stageEnterOrder) || !line.stageEnterOrder.length) {
            return undefined;
          }
          const seen = new Set<string>();
          const out = line.stageEnterOrder.map((item) => {
            const k = String(item || '').trim();
            if (!k) return '';
            if (seen.has(k)) return '';
            seen.add(k);
            return k;
          });
          return out.some((k) => k) ? out : undefined;
        })(),
        resetStage: line.resetStage === true ? true : undefined,
        missionUpdate: mu?.id
          ? {
              id: String(mu.id),
              title: String(mu.title || mu.id),
              status: mu.status === 'complete' ? ('complete' as const) : ('start' as const),
            }
          : undefined,
      };
    })
          .filter((l) => l.id),
      );
      return mapped.map((l, i) => {
        const until = l.expressionUntilLineId;
        if (!until) return l;
        const sk = (l.speakerKey || '').trim();
        const ok = mapped.slice(i + 1).some(
          (x) =>
            x.id === until &&
            x.effect !== 'titlecard' &&
            (x.speakerKey || '').trim() === sk &&
            !x.narrationOnly,
        );
        return ok ? l : { ...l, expressionUntilLineId: undefined };
      });
    })(),
    backgrounds: normalizeVnBackgrounds(row.backgrounds),
    bgms: normalizeVnBgms(row.bgms),
    ambients: normalizeVnAmbients(row.ambients),
    handouts: normalizeVnHandouts(row.handouts),
    diceSfxList: normalizeVnDiceSfxList(row.diceSfxList),
    diceRollSfx: String(row.diceRollSfx || '').trim() || undefined,
    diceResultSfx: String(row.diceResultSfx || '').trim() || undefined,
    diceResultSfxByTone: normalizeVnDiceResultSfxByTone(row.diceResultSfxByTone),
    maxOnStage: normalizeVnMaxOnStage(maxRaw),
    tutorialSteps: normalizeTutorialSteps(row.tutorialSteps),
    menuTheme: normalizeMenuTheme(row.menuTheme),
    chapterLoading: Boolean(row.chapterLoading) || undefined,
  };
}

function normalizeTutorialSteps(raw: unknown): import('@/components/vn/VnTutorial').VnTutorialStep[] | undefined {
  const list = coerceFirebaseList(raw);
  if (!list.length) return undefined;
  const steps = list
    .map((s, i) => {
      const row = (s ?? {}) as Record<string, unknown>;
      const id = String(row.id || `step-${i}`).trim();
      const title = String(row.title || '').trim();
      const body = String(row.body || '').trim();
      if (!id || (!title && !body)) return null;
      return {
        id,
        title,
        body,
        gifUrl: String(row.gifUrl || '').trim() || undefined,
      };
    })
    .filter(Boolean) as import('@/components/vn/VnTutorial').VnTutorialStep[];
  return steps.length ? steps : undefined;
}

function normalizeVnBackgrounds(raw: unknown): import('@/lib/vn/parseCcfoliaLog').ScenarioVnBackground[] {
  return coerceFirebaseList(raw)
    .map((b) => {
      const row = (b ?? {}) as Record<string, unknown>;
      const key = String(row.key || '').trim();
      if (!key) return null;
      return {
        key,
        label: String(row.label || '').trim(),
        image: String(row.image || '').trim() || undefined,
        /* false만 명시 저장 — true/미지정은 기본(배너 표시) */
        announceLocation: row.announceLocation === false ? false : undefined,
      };
    })
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
}

function normalizeVnBgms(raw: unknown): import('@/lib/vn/parseCcfoliaLog').ScenarioVnBgm[] {
  return coerceFirebaseList(raw)
    .map((b) => {
      const row = (b ?? {}) as Record<string, unknown>;
      const key = String(row.key || '').trim();
      if (!key) return null;
      return {
        key,
        label: String(row.label || '').trim(),
        audio: String(row.audio || '').trim() || undefined,
      };
    })
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
}

function normalizeVnAmbients(raw: unknown): import('@/lib/vn/parseCcfoliaLog').ScenarioVnAmbient[] {
  return coerceFirebaseList(raw)
    .map((b) => {
      const row = (b ?? {}) as Record<string, unknown>;
      const key = String(row.key || '').trim();
      if (!key) return null;
      return {
        key,
        label: String(row.label || '').trim(),
        audio: String(row.audio || '').trim() || undefined,
      };
    })
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
}

function normalizeVnHandouts(raw: unknown): import('@/lib/vn/parseCcfoliaLog').ScenarioVnHandout[] {
  return coerceFirebaseList(raw)
    .map((b) => {
      const row = (b ?? {}) as Record<string, unknown>;
      const key = String(row.key || '').trim();
      if (!key) return null;
      const layout = normalizeHandoutLayout(row.layout);
      return {
        key,
        label: String(row.label || '').trim(),
        image: String(row.image || '').trim() || undefined,
        layout: layout || undefined,
      };
    })
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
}

function normalizeVnDiceSfxList(
  raw: unknown,
): import('@/lib/vn/parseCcfoliaLog').ScenarioVnDiceSfx[] {
  return coerceFirebaseList(raw)
    .map((b) => {
      const row = (b ?? {}) as Record<string, unknown>;
      const key = String(row.key || '').trim();
      if (!key) return null;
      return {
        key,
        label: String(row.label || '').trim(),
        audio: String(row.audio || '').trim() || undefined,
      };
    })
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
}

function normalizeVnDiceResultSfxByTone(
  raw: unknown,
): import('@/lib/vn/parseCcfoliaLog').ScenarioVnDiceResultSfxByTone | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const tones = ['extreme', 'great', 'ok', 'fail', 'fumble'] as const;
  const out: import('@/lib/vn/parseCcfoliaLog').ScenarioVnDiceResultSfxByTone = {};
  let any = false;
  for (const t of tones) {
    const v = String(row[t] || '').trim();
    if (v) {
      out[t] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

function normalizeVnScene(raw: unknown, fallbackId: string): TrpgScenario['vnScene'] {
  const editable = normalizeVnEditable(raw);
  if (!editable) return undefined;
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: String(row.id || fallbackId).trim() || fallbackId,
    title: String(row.title || '').trim() || '시나리오 VN',
    speakers: editable.speakers,
    lines: editable.lines,
    backgrounds: editable.backgrounds,
    bgms: editable.bgms,
    ambients: editable.ambients,
    handouts: editable.handouts,
    diceSfxList: editable.diceSfxList,
    diceRollSfx: editable.diceRollSfx,
    diceResultSfx: editable.diceResultSfx,
    diceResultSfxByTone: editable.diceResultSfxByTone,
    maxOnStage: normalizeVnMaxOnStage(row.maxOnStage ?? editable.maxOnStage),
    menuTheme: editable.menuTheme,
    chapterLoading: editable.chapterLoading ? true : undefined,
  };
}

export function formatTrpgDateRange(item: TrpgScenario) {
  if (item.dateStart && item.dateEnd) return `${item.dateStart} ~ ${item.dateEnd}`;
  if (item.dateStart) return item.dateStart;
  return '';
}

export function playerNameMap(profiles: TrpgPlayerProfile[]) {
  return new Map(profiles.map((p) => [p.id, p.name]));
}

export function trpgSystemBadgeClass(system: string) {
  const s = system.toLowerCase();
  if (s.includes('coc') || s.includes('call of cthulhu') || s.includes('크툴루')) {
    return 'trpg-card__badge--coc';
  }
  if (s.includes('insane')) {
    return 'trpg-card__badge--insane';
  }
  return 'trpg-card__badge--default';
}

/** categoryId 우선, 없으면 system 라벨/키워드로 느슨 매칭 */
export function scenarioMatchesTrpgCategory(
  item: TrpgScenario,
  categoryId: string,
  categories: { id: string; label: string }[],
) {
  if (!categoryId || categoryId === 'all') return true;
  if (item.categoryId && item.categoryId === categoryId) return true;
  if (item.categoryId) return false;
  const cat = categories.find((c) => c.id === categoryId);
  const needle = (cat?.label || categoryId).toLowerCase();
  const system = (item.system || '').toLowerCase();
  if (!system || !needle) return false;
  if (system.includes(needle) || needle.includes(system)) return true;
  if (categoryId === 'coc') {
    return system.includes('coc') || system.includes('cthulhu') || system.includes('크툴루');
  }
  if (categoryId === 'insane') return system.includes('insane');
  return false;
}

/** 호버 초상 — 항상 contain (미리보기·실카드 동일 프레임) */
export function trpgCardHoverPortrait(
  item: TrpgScenario,
  ocImgById?: Map<string, { src: string; fit?: string; pos?: string }>,
) {
  const hoverFit = 'contain' as const;
  const hoverPos = 'right bottom' as const;

  if (item.cardHoverImg?.trim()) {
    return {
      src: item.cardHoverImg.trim(),
      frame: item.cardHoverImgFrame,
      fit: hoverFit,
      pos: item.cardHoverImgPos?.includes('bottom')
        ? item.cardHoverImgPos.includes('right')
          ? item.cardHoverImgPos
          : 'right bottom'
        : hoverPos,
    };
  }

  for (const id of item.characterIds ?? []) {
    const oc = ocImgById?.get(String(id));
    if (oc?.src) {
      return { src: oc.src, fit: hoverFit, pos: hoverPos };
    }
  }

  const linked = (item.playerProfiles ?? []).find((p) => p.ocId && p.img?.trim());
  if (linked?.img) {
    return {
      src: linked.img.trim(),
      fit: hoverFit,
      pos: hoverPos,
    };
  }

  const profile = (item.playerProfiles ?? []).find((p) => p.img?.trim());
  if (!profile?.img) return null;
  return {
    src: profile.img.trim(),
    fit: hoverFit,
    pos: hoverPos,
  };
}

export function trpgCardCharacterNames(item: TrpgScenario) {
  const fromProfiles = (item.playerProfiles ?? []).map((p) => p.name.trim()).filter(Boolean);
  if (fromProfiles.length) return fromProfiles;
  return [];
}

/** 호버 표시 제목 — cardHoverTitle 우선 (줄바꿈 유지) */
export function trpgCardHoverTitle(item: TrpgScenario) {
  const override = item.cardHoverTitle?.trim();
  if (override) return override;
  return item.title?.trim() || '';
}

/** 호버 PC 한 명 — 수동 지정 → 연결 OC → ocId 탐사자 → 첫 탐사자 */
export function trpgCardPrimaryPcName(
  item: TrpgScenario,
  ocNameById?: Map<string, string> | Record<string, string>,
) {
  if (item.cardHoverPcName?.trim()) return item.cardHoverPcName.trim();

  const lookup = (id: string) => {
    if (!id) return '';
    if (ocNameById instanceof Map) return ocNameById.get(id)?.trim() || '';
    return ocNameById?.[id]?.trim() || '';
  };

  for (const id of item.characterIds ?? []) {
    const name = lookup(String(id));
    if (name) return name;
  }

  const linked = (item.playerProfiles ?? []).find(
    (p) => p.ocId && (p.name?.trim() || lookup(String(p.ocId))),
  );
  if (linked) {
    return linked.name?.trim() || lookup(String(linked.ocId)) || '';
  }

  const first = (item.playerProfiles ?? []).find((p) => p.name?.trim());
  if (first?.name?.trim()) return first.name.trim();

  const players = item.players?.trim() || '';
  if (!players) return '';
  const pl = players.match(/(?:PL|PC)\s*[:：]?\s*([^\n,/|]+)/i);
  if (pl?.[1]) return pl[1].trim();
  return players.split(/[,/|·]/)[0]?.trim() || '';
}
