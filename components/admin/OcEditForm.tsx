'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { DialogueNodesEditor } from '@/components/shared/DialogueNodesEditor';
import { LineVoiceVolumeControl } from '@/components/shared/LineVoiceVolumeControl';
import { GalleryCreditInput } from '@/components/ui/GalleryCreditInput';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { LakeEditTabs } from '@/components/ui/LakeEditTabs';
import { LakeToggle } from '@/components/ui/LakeToggle';
import { AudioFileField } from '@/components/ui/AudioFileField';
import { OcEditSortRows } from '@/components/admin/OcEditSortRows';
import { usePortalListReorder } from '@/components/ui/form/usePortalListReorder';
import { ImageUploadCrop } from '@/components/ui/form/ImageUploadCrop';
import { LinkPickList } from '@/components/ui/LinkPickList';
import { SecretPostFields } from '@/components/ui/SecretPostFields';
import { useSaveToast } from '@/components/ui/SaveToast';
import {
  applyCharacterTheme,
  deriveThemeFromPersonalColor,
  normalizeHex,
  resolveCharacterTheme,
  stripEmptyThemeFields,
} from '@/lib/oc/characterTheme';
import { normalizeGallery, normalizeGalleryItem } from '@/lib/oc/gallery';
import {
  CORE_PROFILE_FIELD_KEYS,
  finalizeCharacterProfile,
  mergeCharacterProfile,
  splitExtraProfileRows,
  type CoreProfileFieldKey,
} from '@/lib/oc/profile';
import { prepareCharacterForSave } from '@/lib/oc/prepareCharacterSave';
import {
  DEFAULT_OC_STAT_RADAR,
  hydrateStatPanel,
  OC_STAT_RADAR_HINTS,
} from '@/lib/oc/statPanel';
import { normalizeFloatingQuotes } from '@/lib/oc/floatingQuotes';
import { DustFxFields } from '@/components/shared/DustFxFields';
import { CREEPY_FX_KINDS, DEFAULT_VIGNETTE_COLOR } from '@/lib/oc/creepyFx';
import { isTrpgCategory } from '@/lib/oc/categories';
import { OC_CARD_ASPECT } from '@/lib/oc/pairDefaults';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { uploadImageFile, uploadMediaFile } from '@/lib/r2/client';
import { EntrySplashFormFields } from '@/components/shared/EntrySplash';
import { StoryEntriesEditor } from '@/components/shared/StoryEntriesEditor';
import { StoryRichTextarea, type StoryRichTextareaHandle } from '@/components/shared/StoryRichTextarea';
import { createPreviewItem, hydrateOcStories } from '@/lib/oc/storyEntries';
import {
  createEmptyTasteItem,
  createTasteDivider,
  resolveTasteItems,
  tasteItemsHaveContent,
} from '@/lib/oc/tasteItems';
import { finalizeRiskStages, resolveRiskStages } from '@/lib/oc/riskStages';
import { RiskStagesEditor } from '@/components/shared/RiskStagesEditor';
import type {
  AuVersion,
  CreepyFxKind,
  CustomProfileSection,
  DialogueNode,
  GalleryItem,
  OcCharacter,
  OcStatBar,
  OcStatPanel,
  OcStatRadarAxis,
  ProfileField,
  PreviewItem,
  CharacterRelation,
  TasteItem,
} from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';
import type { TrpgScenario } from '@/lib/types/site-content';

function emptyRelation(): CharacterRelation {
  return { id: newId(), name: '', relation: '' };
}

function linkedScenarioIds(scenarios: TrpgScenario[], ocId: string | number): Set<string> {
  const id = String(ocId);
  return new Set(
    scenarios
      .filter((s) => (s.characterIds ?? []).some((cid) => String(cid) === id))
      .map((s) => s.id),
  );
}

function applyOcTrpgLinks(
  scenarios: TrpgScenario[],
  ocId: string | number,
  linkedIds: Set<string>,
): TrpgScenario[] {
  const id = String(ocId);
  return scenarios.map((s) => {
    const prev = (s.characterIds ?? []).map(String);
    const shouldLink = linkedIds.has(s.id);
    const next = shouldLink
      ? prev.includes(id)
        ? prev
        : [...prev, id]
      : prev.filter((cid) => cid !== id);
    if (next.length === prev.length && next.every((v, i) => v === prev[i])) return s;
    return { ...s, characterIds: next };
  });
}

type OcEditTab =
  | 'basic'
  | 'profile'
  | 'story'
  | 'gallery'
  | 'preview'
  | 'versions'
  | 'relations'
  | 'color'
  | 'fx'
  | 'vn'
  | 'themeSong'
  | 'pv'
  | 'loading';

type OcProfileSub = string;

const OC_PROFILE_FIXED: { id: string; label: string }[] = [
  { id: 'image', label: '이미지' },
  { id: 'intro', label: '소개' },
  { id: 'appearance', label: '외관' },
  { id: 'taste', label: '특이사항' },
  { id: 'stats', label: '스탯' },
  { id: 'keywords', label: '키워드' },
  { id: 'flat', label: '캐해' },
  { id: 'notes', label: '쪽지' },
];

const PROFILE_ADD_ID = '__add__';
const PROFILE_ORDER_ID = 'order';

function newCustomSectionId() {
  return `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function customTabId(sectionId: string) {
  return `custom:${sectionId}`;
}

function parseCustomTabId(sub: string): string | null {
  return sub.startsWith('custom:') ? sub.slice(7) : null;
}

const OC_EDIT_TABS: { id: OcEditTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'profile', label: '프로필' },
  { id: 'story', label: '스토리' },
  { id: 'gallery', label: '갤러리' },
  { id: 'preview', label: '프리뷰' },
  { id: 'versions', label: '버전' },
  { id: 'relations', label: '관계' },
  { id: 'color', label: '컬러' },
  { id: 'fx', label: '연출' },
  { id: 'vn', label: 'VN' },
  { id: 'themeSong', label: '테마곡' },
  { id: 'pv', label: 'PV 대사' },
  { id: 'loading', label: '로딩' },
];

type Props = {
  character: OcCharacter;
  categories: string[];
  onSave: (c: OcCharacter) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  compact?: boolean;
  /** 열릴 때 바로 이동할 탭 */
  initialTab?: OcEditTab;
  /** 스토리 탭에서 스크롤·강조할 서사 id */
  focusEntryId?: string | null;
};

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="oc-edit-section-title">{children}</div>;
}

/** 키워드 콤마 분리 */
function parseCommaList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function CommaSeparatedInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="form-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function hydrateEditForm(character: OcCharacter): OcCharacter {
  const hydrated = hydrateOcStories(character);
  return {
    ...hydrated,
    gallery: normalizeGallery(hydrated.gallery),
    tasteItems: resolveTasteItems(hydrated),
    riskStages: resolveRiskStages(hydrated),
    statPanel: hydrateStatPanel(hydrated.statPanel),
  };
}

export function OcEditForm({
  character,
  categories,
  onSave,
  onDelete,
  compact,
  initialTab = 'basic',
  focusEntryId = null,
}: Props) {
  const { showSaveToast } = useSaveToast();
  const { confirm } = useLakeDialog();
  const { trpg, saveTrpg } = useSiteContent();
  const [form, setForm] = useState(() => hydrateEditForm(character));
  const [tab, setTab] = useState<OcEditTab>(initialTab);
  const [profileSub, setProfileSub] = useState<OcProfileSub>('image');
  const [busy, setBusy] = useState(false);
  const [handNoteDraft, setHandNoteDraft] = useState('');
  const [noteUploading, setNoteUploading] = useState(false);
  const [commaDraft, setCommaDraft] = useState({
    keywords: (character.keywords || []).join(', '),
  });
  const [personalHexDraft, setPersonalHexDraft] = useState(character.personalColor || '');
  const [linkedTrpgIds, setLinkedTrpgIds] = useState<Set<string>>(() => linkedScenarioIds(trpg, character.id));
  const [tasteDragIndex, setTasteDragIndex] = useState<number | null>(null);
  const [statBarDragIndex, setStatBarDragIndex] = useState<number | null>(null);
  const [galOpenIndex, setGalOpenIndex] = useState<number | null>(null);
  const [tabNamePrompt, setTabNamePrompt] = useState<{ value: string } | null>(null);
  const tabNameInputRef = useRef<HTMLInputElement | null>(null);
  const tasteEditorRefs = useRef<Record<string, StoryRichTextareaHandle | null>>({});
  const themePreview = useMemo(() => resolveCharacterTheme(form), [form]);
  const showTrpgLinks = isTrpgCategory(form.category);
  const set = <K extends keyof OcCharacter>(k: K, v: OcCharacter[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const profileTabs = useMemo(() => {
    const customs = (form.customSections ?? []).map((s) => ({
      id: customTabId(s.id),
      label: s.title?.trim() || '새 탭',
    }));
    return [
      ...OC_PROFILE_FIXED,
      ...customs,
      { id: PROFILE_ADD_ID, label: '+' },
      { id: PROFILE_ORDER_ID, label: '순서' },
    ];
  }, [form.customSections]);

  const activeCustomId = parseCustomTabId(profileSub);
  const activeCustomIndex = activeCustomId
    ? (form.customSections ?? []).findIndex((s) => s.id === activeCustomId)
    : -1;
  const activeCustom = activeCustomIndex >= 0 ? form.customSections![activeCustomIndex] : null;

  function patchCustomSection(index: number, patch: Partial<CustomProfileSection>) {
    const next = [...(form.customSections ?? [])];
    next[index] = { ...next[index], ...patch };
    set('customSections', next);
  }

  function addCustomTab() {
    setTabNamePrompt({ value: '' });
  }

  function commitCustomTab(raw: string) {
    const title = raw.trim();
    setTabNamePrompt(null);
    if (!title) return;
    const id = newCustomSectionId();
    const section: CustomProfileSection = { id, title, body: '' };
    const nextSections = [...(form.customSections ?? []), section];
    const orderId = `custom-${id}`;
    const nextOrder = [...(form.sectionOrder ?? [])];
    if (!nextOrder.includes(orderId)) nextOrder.push(orderId);
    setForm((f) => ({
      ...f,
      customSections: nextSections,
      sectionOrder: nextOrder,
    }));
    setProfileSub(customTabId(id));
  }

  async function removeCustomTab(index: number) {
    const sec = form.customSections?.[index];
    if (!sec) return;
    const ok = await confirm(`「${sec.title || '새 탭'}」 탭을 삭제할까요?`, '탭 삭제');
    if (!ok) return;
    const nextSections = (form.customSections ?? []).filter((_, j) => j !== index);
    const orderId = `custom-${sec.id}`;
    setForm((f) => ({
      ...f,
      customSections: nextSections,
      sectionOrder: (f.sectionOrder ?? []).filter((id) => id !== orderId),
    }));
    setProfileSub('image');
  }

  useEffect(() => {
    if (!tabNamePrompt) return;
    const id = window.requestAnimationFrame(() => tabNameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [tabNamePrompt]);

  function patchTasteItem(index: number, patch: Partial<TasteItem>) {
    const next = [...(form.tasteItems ?? [])];
    next[index] = { ...next[index], ...patch };
    set('tasteItems', next);
  }

  function insertTasteAt(index: number, item: TasteItem) {
    const next = [...(form.tasteItems ?? [])];
    next.splice(index, 0, item);
    set('tasteItems', next);
  }

  function moveTasteItem(from: number, to: number) {
    if (from === to) return;
    const next = [...(form.tasteItems ?? [])];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    set('tasteItems', next);
  }

  function onProfileSubChange(id: string) {
    if (id === PROFILE_ADD_ID) {
      addCustomTab();
      return;
    }
    setProfileSub(id);
  }

  function getCoreValue(key: CoreProfileFieldKey): string {
    if (key === '나이') return form.role || '';
    const row = (form.profile ?? []).find((p) => p.k?.trim() === key);
    return row?.v ?? '';
  }

  function getCoreTip(key: CoreProfileFieldKey): string {
    return (form.profile ?? []).find((p) => p.k?.trim() === key)?.tip ?? '';
  }

  function setCoreValue(key: CoreProfileFieldKey, value: string) {
    if (key === '나이') {
      set('role', value);
      return;
    }
    const rows = [...(form.profile || [])];
    const idx = rows.findIndex((p) => p.k?.trim() === key);
    if (idx >= 0) rows[idx] = { ...rows[idx], k: key, v: value };
    else rows.push({ k: key, v: value });
    set('profile', rows);
  }

  function setCoreTip(key: CoreProfileFieldKey, tip: string) {
    const rows = [...(form.profile || [])];
    const idx = rows.findIndex((p) => p.k?.trim() === key);
    if (idx >= 0) rows[idx] = { ...rows[idx], k: key, tip };
    else rows.push({ k: key, v: key === '나이' ? form.role || '' : '', tip });
    set('profile', rows);
  }

  const extraProfileRows = splitExtraProfileRows(form.profile);

  useEffect(() => {
    const extras = splitExtraProfileRows(character.profile);
    const hydrated = hydrateEditForm(character);
    setForm({
      ...hydrated,
      profile: mergeCharacterProfile(hydrated.profile, hydrated.role, extras),
    });
    setCommaDraft({
      keywords: (hydrated.keywords || []).join(', '),
    });
    setPersonalHexDraft(hydrated.personalColor || '');
    setLinkedTrpgIds(linkedScenarioIds(trpg, character.id));
    // 편집 중 원격 스냅샷으로 입력이 덮이지 않도록 id 변경 시에만 리셋
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id]);

  useEffect(() => {
    setLinkedTrpgIds(linkedScenarioIds(trpg, character.id));
  }, [trpg, character.id]);

  useEffect(() => {
    const el = document.getElementById('detail-screen');
    if (!el) return;
    applyCharacterTheme(el, form);
    return () => {
      applyCharacterTheme(el, character);
    };
  }, [character, form.accentColor, form.accentSoft, form.panelColor, form.personalColor, form.borderColor, form.vnColor, form.menuColor, form.themeAutoBackground]);

  function applyPersonalColor(raw: string) {
    setPersonalHexDraft(raw);
    const hex = normalizeHex(raw);
    if (!hex) {
      setForm((f) => ({ ...f, personalColor: raw.trim() || undefined }));
      return;
    }
    if (form.themeAutoBackground === false) {
      setForm((f) => ({ ...f, personalColor: hex }));
      setPersonalHexDraft(hex);
      return;
    }
    const derived = deriveThemeFromPersonalColor(hex);
    setForm((f) => ({
      ...f,
      personalColor: hex,
      accentColor: derived.accentColor,
      accentSoft: derived.accentSoft,
      panelColor: derived.panelColor,
      borderColor: derived.borderColor,
      vnColor: derived.vnColor,
      menuColor: derived.menuColor,
    }));
    setPersonalHexDraft(hex);
  }

  function setThemeAutoBackground(enabled: boolean) {
    setForm((f) => {
      const next = { ...f, themeAutoBackground: enabled ? undefined : false };
      if (enabled && f.personalColor) {
        const derived = deriveThemeFromPersonalColor(f.personalColor);
        Object.assign(next, {
          accentColor: derived.accentColor,
          accentSoft: derived.accentSoft,
          panelColor: derived.panelColor,
          borderColor: derived.borderColor,
          vnColor: derived.vnColor,
          menuColor: derived.menuColor,
        });
      }
      return next;
    });
  }

  function resetThemeColors() {
    setPersonalHexDraft('');
    setForm((f) => {
      const next = { ...f };
      delete next.personalColor;
      delete next.personalVignette;
      delete next.accentColor;
      delete next.accentSoft;
      delete next.panelColor;
      delete next.borderColor;
      delete next.vnColor;
      delete next.menuColor;
      delete next.themeAutoBackground;
      return next;
    });
  }

  async function handleSave() {
    setBusy(true);
    try {
      const tasteItems = resolveTasteItems(form);
      const riskFinal = finalizeRiskStages(form.riskStages);
      const merged: OcCharacter = stripEmptyThemeFields({
        ...form,
        keywords: parseCommaList(commaDraft.keywords),
        tasteItems,
        ...riskFinal,
        floatingQuotes: normalizeFloatingQuotes(form.floatingQuotes).slice(0, 2),
        profile: finalizeCharacterProfile(
          mergeCharacterProfile(form.profile, form.role, splitExtraProfileRows(form.profile)),
        ),
      });
      if (!riskFinal.riskStages) delete merged.riskStages;
      if (!riskFinal.riskLevel) delete merged.riskLevel;
      delete merged.hobby;
      delete merged.likes;
      delete merged.hates;
      delete merged.tasteExtra;
      const prepared = await prepareCharacterForSave(merged);
      await onSave(prepared);
      if (isTrpgCategory(prepared.category)) {
        const nextTrpg = applyOcTrpgLinks(trpg, prepared.id, linkedTrpgIds);
        const changed = nextTrpg.some((s, i) => s !== trpg[i]);
        if (changed) await saveTrpg(nextTrpg);
      }
      setForm(hydrateEditForm(prepared));
      setCommaDraft({
        keywords: (prepared.keywords || []).join(', '),
      });
      showSaveToast();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장에 실패했습니다.';
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function uploadMainImage(file: File) {
    setBusy(true);
    try {
      const url = await uploadImageFile(file, 'oc/main');
      set('img', url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function uploadGhostImage(file: File) {
    setBusy(true);
    try {
      const url = await uploadImageFile(file, 'oc/ghost');
      set('ghostImg', url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '고스트 이미지 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function uploadGalleryFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = await Promise.all(files.map((f) => uploadImageFile(f, 'oc/gallery')));
      const prev = galleryEditRows();
      set('gallery', [
        ...prev,
        ...uploaded.map((src) => ({ src, credit: '' } satisfies GalleryItem)),
      ]);
      setGalOpenIndex(prev.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '갤러리 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  function updateProfile(i: number, patch: Partial<ProfileField>) {
    const extras = splitExtraProfileRows(form.profile);
    extras[i] = { ...extras[i], ...patch };
    set('profile', mergeCharacterProfile(form.profile, form.role, extras));
  }

  function addProfileRow() {
    const extras = [...splitExtraProfileRows(form.profile), { k: '', v: '' }];
    set('profile', mergeCharacterProfile(form.profile, form.role, extras));
  }

  function removeProfileRow(i: number) {
    const extras = splitExtraProfileRows(form.profile).filter((_, idx) => idx !== i);
    set('profile', mergeCharacterProfile(form.profile, form.role, extras));
  }

  function galleryEditRows(): GalleryItem[] {
    return (form.gallery ?? []).map((item) => normalizeGalleryItem(item));
  }

  function updateGallery(i: number, patch: Partial<GalleryItem>) {
    const g = galleryEditRows();
    g[i] = { ...g[i], ...patch };
    set('gallery', g);
  }

  function addGallery(item: GalleryItem = { src: '', credit: '' }) {
    const next = [...galleryEditRows(), item];
    set('gallery', next);
    setGalOpenIndex(next.length - 1);
  }

  function removeGallery(i: number) {
    set('gallery', galleryEditRows().filter((_, idx) => idx !== i));
    setGalOpenIndex((open) => {
      if (open === null) return null;
      if (open === i) return null;
      return open > i ? open - 1 : open;
    });
  }

  const galleryRows = galleryEditRows();
  const ocGalSort = usePortalListReorder({
    items: galleryRows,
    onReorder: (next) => {
      set('gallery', next);
    },
    labelOf: (_item, i) => `이미지 ${i + 1}`,
    thumbOf: (item) => item.src || undefined,
  });

  function updateRelation(i: number, patch: Partial<CharacterRelation>) {
    const rows = [...(form.relationships || [])];
    rows[i] = { ...rows[i], ...patch };
    set('relationships', rows);
  }

  function addRelation() {
    set('relationships', [...(form.relationships || []), emptyRelation()]);
  }

  function removeRelation(i: number) {
    set('relationships', (form.relationships || []).filter((_, idx) => idx !== i));
  }

  function updatePreview(i: number, patch: Partial<PreviewItem>) {
    const rows = [...(form.previewItems || [])];
    rows[i] = { ...rows[i], ...patch };
    set('previewItems', rows);
  }

  function addPreview() {
    set('previewItems', [
      ...(form.previewItems || []),
      createPreviewItem({ order: (form.previewItems || []).length }),
    ]);
  }

  function removePreview(i: number) {
    set(
      'previewItems',
      (form.previewItems || [])
        .filter((_, idx) => idx !== i)
        .map((p, order) => ({ ...p, order })),
    );
  }

  function updateAu(i: number, patch: Partial<AuVersion>) {
    const rows = [...(form.auVersions || [])];
    rows[i] = { ...rows[i], ...patch };
    set('auVersions', rows);
  }

  function addAu() {
    set('auVersions', [...(form.auVersions || []), { label: 'AU', img: '', imgFit: 'contain', imgPos: 'center top' }]);
  }

  function removeAu(i: number) {
    set('auVersions', (form.auVersions || []).filter((_, idx) => idx !== i));
  }

  async function uploadAuImage(i: number, file: File) {
    setBusy(true);
    try {
      const url = await uploadImageFile(file, 'oc/au');
      updateAu(i, { img: url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AU 이미지 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function uploadExpressionImage(i: number, file: File) {
    setBusy(true);
    try {
      const url = await uploadImageFile(file, 'oc/expression');
      const rows = [...(form.dialogue || [])];
      if (!rows[i]) return;
      rows[i] = { ...rows[i], expression: url };
      set('dialogue', rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '표정 이미지 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function uploadDialogueVoice(i: number, file: File) {
    setBusy(true);
    try {
      const url = await uploadMediaFile(file, 'oc/vn-voice');
      const rows = [...(form.dialogue || [])];
      if (!rows[i]) return;
      rows[i] = { ...rows[i], voice: url };
      set('dialogue', rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '대사 음성 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  function updateStat(i: number, patch: Partial<ProfileField>) {
    const rows = [...(form.stats || [])];
    rows[i] = { ...rows[i], ...patch };
    set('stats', rows);
  }

  function addStatRow() {
    set('stats', [...(form.stats || []), { k: '', v: '' }]);
  }

  function removeStatRow(i: number) {
    set('stats', (form.stats || []).filter((_, idx) => idx !== i));
  }

  function patchStatPanel(patch: Partial<OcStatPanel>) {
    set('statPanel', { ...(form.statPanel || {}), ...patch });
  }

  function updateRadarAxis(i: number, patch: Partial<OcStatRadarAxis>) {
    const rows = [...(form.statPanel?.radar || [])];
    rows[i] = { ...rows[i], ...patch };
    patchStatPanel({ radar: rows });
  }

  function addRadarAxis() {
    patchStatPanel({
      radar: [...(form.statPanel?.radar || []), { axis: '', value: 50 }],
    });
  }

  function removeRadarAxis(i: number) {
    patchStatPanel({
      radar: (form.statPanel?.radar || []).filter((_, idx) => idx !== i),
    });
  }

  function resetRadarDefaults() {
    patchStatPanel({
      radar: DEFAULT_OC_STAT_RADAR.map((a) => ({ ...a })),
    });
  }

  function updateStatBar(i: number, patch: Partial<OcStatBar>) {
    const rows = [...(form.statPanel?.bars || [])];
    rows[i] = { ...rows[i], ...patch };
    patchStatPanel({ bars: rows });
  }

  function addStatBar() {
    patchStatPanel({
      bars: [...(form.statPanel?.bars || []), { label: '', value: 0, max: 1000 }],
    });
  }

  function removeStatBar(i: number) {
    patchStatPanel({
      bars: (form.statPanel?.bars || []).filter((_, idx) => idx !== i),
    });
  }

  function moveStatBar(from: number, to: number) {
    if (from === to) return;
    const rows = [...(form.statPanel?.bars || [])];
    if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return;
    const [item] = rows.splice(from, 1);
    rows.splice(to, 0, item);
    patchStatPanel({ bars: rows });
  }

  return (
    <>
      <div className="lake-edit-shell__sticky-bar" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>
          {compact ? '캐릭터 수정' : 'OC Detail Edit'}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-save" disabled={busy} onClick={() => void handleSave()}>
            {busy ? '업로드/저장 중…' : '저장'}
          </button>
          {onDelete && (
            <button type="button" className="btn-del" onClick={() => void onDelete()}>
              삭제
            </button>
          )}
        </div>
      </div>

      <LakeEditTabs tabs={OC_EDIT_TABS} active={tab} onChange={(id) => setTab(id as OcEditTab)} />

      <div className="lake-edit-shell__body">
      {tab === 'basic' ? (
      <div className="pair-edit-basic">
        <div className="pair-edit-basic__cover">
          <div className="lake-edit-section-title">카드 이미지</div>
          <p className="pair-edit-hint" style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
            목록 카드 전용 크롭입니다. 드래그·휠로 맞춘 뒤 저장하면 목록에 반영됩니다.
            상세 화면 메인 일러 위치는 상세 「위치」에서 따로 조절합니다.
          </p>
          <ImageFrameEditor
            className="oc-card-frame-editor"
            src={form.img || ''}
            value={form.imgFrame}
            onChange={(imgFrame) => {
              setForm((f) => ({
                ...f,
                imgFrame,
                imgFit: 'cover',
                imgPos: f.imgPos || 'center top',
              }));
            }}
            fit="cover"
            pos={form.imgPos || 'center top'}
            aspectRatio={OC_CARD_ASPECT}
            allowWheelZoom
          />
          <label className="file-input-label" style={{ marginTop: 8 }}>
            이미지 파일 업로드
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMainImage(f);
                e.target.value = '';
              }}
            />
          </label>
          <input
            className="form-input"
            style={{ marginTop: 8 }}
            placeholder="또는 이미지 URL"
            value={form.img || ''}
            onChange={(e) => set('img', e.target.value)}
          />
        </div>

        <div className="pair-edit-basic__fields">
          <div className="lh-oc-admin-grid">
            <div className="form-group">
              <label className="form-label">이름</label>
              <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">서브명</label>
              <input className="form-input" value={form.nameSub || ''} onChange={(e) => set('nameSub', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">카테고리</label>
              <select className="form-input" value={form.category || ''} onChange={(e) => set('category', e.target.value)}>
                {categories.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">서브카테고리</label>
              <input className="form-input" value={form.subcat || ''} onChange={(e) => set('subcat', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">태그</label>
              <input
                className="form-input"
                value={form.tag || ''}
                onChange={(e) => set('tag', e.target.value)}
                placeholder="#태그 (해시는 자동 추가)"
              />
            </div>
            <div className="form-group">
              <label className="form-label">별점 (1~5)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={5}
                value={form.stars ?? 5}
                onChange={(e) => set('stars', Number(e.target.value) || 5)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">위험도 (단계별 · 선택)</label>
              <p className="lh-color-hint" style={{ margin: '0 0 8px' }}>
                1~7단계 프리셋에서 고른 뒤, 라벨·주의 문구·색을 자유롭게 수정할 수 있습니다.
              </p>
              <RiskStagesEditor
                stages={form.riskStages ?? []}
                onChange={(riskStages) => set('riskStages', riskStages)}
              />
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {tab === 'basic' ? (
        <div style={{ margin: '12px 0 4px' }}>
          <SectionTitle>비밀글</SectionTitle>
          <SecretPostFields
            value={form}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />
        </div>
      ) : null}

      {tab === 'color' ? (
      <>
      <SectionTitle>퍼스널 컬러 · 프로필 테마</SectionTitle>
      <div className="form-group">
        <label className="form-label">퍼스널 컬러 (HEX)</label>
        <div className="lh-color-personal-row">
          <span
            className="lh-color-personal-swatch"
            style={{ backgroundColor: themePreview.personalColor }}
            aria-hidden="true"
          />
          <input
            type="color"
            className="lh-color-picker"
            value={themePreview.personalColor}
            onChange={(e) => applyPersonalColor(e.target.value)}
            aria-label="퍼스널 컬러 선택"
          />
          <input
            className="form-input lh-color-hex-input"
            value={personalHexDraft}
            placeholder="#d7a982"
            onChange={(e) => applyPersonalColor(e.target.value)}
            onBlur={() => {
              const hex = normalizeHex(personalHexDraft);
              if (hex) setPersonalHexDraft(hex);
            }}
          />
        </div>
        <p className="lh-color-hint">
          상세 화면 배경은 고정입니다. 퍼스널 컬러는 스테이지 비네트·키워드 칩·스와치에 적용되고,
          별점·Profile/Attribute 라벨은 사이트 골드 고정입니다. 스탯 패널 색은 아래 전용 설정에서 따로 조정합니다.
        </p>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">
            스테이지 비네트 세기
            <span style={{ marginLeft: 8, opacity: 0.72 }}>
              {typeof form.personalVignette === 'number' ? form.personalVignette : 16}%
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            className="lh-range-input"
            value={typeof form.personalVignette === 'number' ? form.personalVignette : 16}
            onChange={(e) => {
              const n = Number(e.target.value);
              setForm((f) => ({
                ...f,
                personalVignette: n === 16 ? undefined : n,
              }));
            }}
            aria-label="스테이지 비네트 세기"
          />
          <p className="lh-color-hint">0%면 비네트 없음, 100%면 퍼스널 컬러가 최대로 스며듭니다. 기본 16%.</p>
        </div>
        <LakeToggle
          checked={form.themeAutoBackground === false}
          onChange={(on) => setThemeAutoBackground(!on)}
          label="고급: VN·테두리 등 테마 색 직접 편집"
        />
        {form.themeAutoBackground === false ? (
          <p className="lh-color-hint">아래 색상은 VN·보조 요소용입니다. 배경·골드 라벨에는 적용되지 않습니다.</p>
        ) : null}
      </div>
      <SectionTitle>스탯 패널</SectionTitle>
      <div className="form-group">
        <label className="form-label">스탯 패널 컬러 (HEX)</label>
        <div className="lh-color-personal-row">
          <span
            className="lh-color-personal-swatch"
            style={{
              backgroundColor:
                normalizeHex(form.statPanel?.color || '') || themePreview.personalColor,
            }}
            aria-hidden="true"
          />
          <input
            type="color"
            className="lh-color-picker"
            value={normalizeHex(form.statPanel?.color || '') || themePreview.personalColor}
            onChange={(e) =>
              patchStatPanel({ color: e.target.value })
            }
            aria-label="스탯 패널 컬러 선택"
          />
          <input
            className="form-input lh-color-hex-input"
            value={form.statPanel?.color || ''}
            placeholder={themePreview.personalColor}
            onChange={(e) => {
              const raw = e.target.value;
              patchStatPanel({ color: raw.trim() || undefined });
            }}
            onBlur={() => {
              const hex = normalizeHex(form.statPanel?.color || '');
              if (hex) patchStatPanel({ color: hex });
            }}
          />
        </div>
        <p className="lh-color-hint">
          비우면 퍼스널 컬러를 따릅니다. 트리거·레이더·능력치 바에 적용됩니다.
        </p>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">스탯 박스 배경색 (HEX)</label>
          <div className="lh-color-personal-row">
            <span
              className="lh-color-personal-swatch"
              style={{
                backgroundColor:
                  normalizeHex(form.statPanel?.bgColor || '') || '#0a0c0b',
              }}
              aria-hidden="true"
            />
            <input
              type="color"
              className="lh-color-picker"
              value={normalizeHex(form.statPanel?.bgColor || '') || '#0a0c0b'}
              onChange={(e) => patchStatPanel({ bgColor: e.target.value })}
              aria-label="스탯 박스 배경색 선택"
            />
            <input
              className="form-input lh-color-hex-input"
              value={form.statPanel?.bgColor || ''}
              placeholder="#0a0c0b"
              onChange={(e) => {
                const raw = e.target.value;
                patchStatPanel({ bgColor: raw.trim() || undefined });
              }}
              onBlur={() => {
                const hex = normalizeHex(form.statPanel?.bgColor || '');
                if (hex) patchStatPanel({ bgColor: hex });
              }}
            />
          </div>
          <p className="lh-color-hint">
            비우면 기본 다크 글래스. 패널은 반투명+블러로 뒤에 비칩니다.
          </p>
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">
            스탯 글로우 감도
            <span style={{ marginLeft: 8, opacity: 0.72 }}>
              {typeof form.statPanel?.glow === 'number' ? form.statPanel.glow : 40}%
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            className="lh-range-input"
            value={typeof form.statPanel?.glow === 'number' ? form.statPanel.glow : 40}
            onChange={(e) => {
              const n = Number(e.target.value);
              patchStatPanel({ glow: n === 40 ? undefined : n });
            }}
            aria-label="스탯 글로우 감도"
          />
          <p className="lh-color-hint">0%면 글로우 없음, 100%면 최대. 기본 40%.</p>
        </div>
        <button
          type="button"
          className="lh-color-reset"
          style={{ marginTop: 4 }}
          onClick={() =>
            patchStatPanel({ color: undefined, bgColor: undefined, glow: undefined })
          }
        >
          스탯 패널 색·배경·글로우 초기화
        </button>
      </div>
      <div className="lh-color-row">
        <div className="form-group">
          <label className="form-label">포인트</label>
          <input
            type="color"
            className="lh-color-picker"
            value={themePreview.accentColor}
            onChange={(e) => set('accentColor', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">빛</label>
          <input
            type="color"
            className="lh-color-picker"
            value={themePreview.accentSoft}
            onChange={(e) => set('accentSoft', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">패널</label>
          <input
            type="color"
            className="lh-color-picker"
            value={themePreview.panelColor}
            onChange={(e) => set('panelColor', e.target.value)}
          />
        </div>
      </div>
      <div className="lh-color-row lh-color-row--3">
        <div className="form-group">
          <label className="form-label">테두리·구분선</label>
          <input
            type="color"
            className="lh-color-picker"
            value={themePreview.borderColor}
            onChange={(e) => set('borderColor', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">대사창·선택지</label>
          <input
            type="color"
            className="lh-color-picker"
            value={themePreview.vnColor}
            onChange={(e) => set('vnColor', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">왼쪽 패널</label>
          <input
            type="color"
            className="lh-color-picker"
            value={themePreview.menuColor}
            onChange={(e) => set('menuColor', e.target.value)}
          />
        </div>
      </div>
      <button type="button" className="lh-color-reset" onClick={resetThemeColors}>
        초기화 Reset
      </button>
      </>
      ) : null}

      {tab === 'fx' ? (
      <>
      <SectionTitle>기괴 연출 (호러/괴이)</SectionTitle>
      <p className="lh-color-hint" style={{ marginTop: -4 }}>
        공포·괴이 컨셉용 화면 연출입니다. 기본 꺼짐 — 켠 뒤 원하는 효과와 강도를 고르세요.
      </p>
      <LakeToggle
        checked={Boolean(form.creepyFx?.enabled)}
        onChange={(on) =>
          setForm((f) => ({ ...f, creepyFx: { ...(f.creepyFx ?? {}), enabled: on } }))
        }
        label="기괴 연출 사용"
      />
      {form.creepyFx?.enabled ? (
        <div style={{ marginTop: 10 }}>
          <div className="lh-creepy-fx-picker" style={{ display: 'grid', gap: 6 }}>
            {CREEPY_FX_KINDS.map((k) => {
              const on = (form.creepyFx?.kinds ?? []).includes(k.id);
              return (
                <label
                  key={k.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => {
                        const prev = f.creepyFx?.kinds ?? [];
                        const next: CreepyFxKind[] = checked
                          ? [...prev, k.id]
                          : prev.filter((x) => x !== k.id);
                        return { ...f, creepyFx: { ...(f.creepyFx ?? {}), kinds: next } };
                      });
                    }}
                  />
                  <span style={{ fontSize: 12 }}>
                    <strong>{k.label}</strong>
                    <span style={{ opacity: 0.6, marginLeft: 6 }}>{k.desc}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">
              강도
              <span style={{ marginLeft: 8, opacity: 0.72 }}>
                {typeof form.creepyFx?.intensity === 'number' ? form.creepyFx.intensity : 40}%
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              className="lh-range-input"
              value={typeof form.creepyFx?.intensity === 'number' ? form.creepyFx.intensity : 40}
              onChange={(e) => {
                const n = Number(e.target.value);
                setForm((f) => ({ ...f, creepyFx: { ...(f.creepyFx ?? {}), intensity: n } }));
              }}
              aria-label="기괴 연출 강도"
            />
            <p className="lh-color-hint">낮을수록 은은하게, 높을수록 강하게 지직입니다.</p>
          </div>
          {(form.creepyFx?.kinds ?? []).includes('creepVignette') ? (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">어둠 잠식 색상</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  className="lh-color-swatch-input"
                  value={form.creepyFx?.vignetteColor || DEFAULT_VIGNETTE_COLOR}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      creepyFx: { ...(f.creepyFx ?? {}), vignetteColor: e.target.value },
                    }))
                  }
                  aria-label="어둠 잠식 색상"
                />
                <input
                  className="form-input"
                  style={{ maxWidth: 130 }}
                  placeholder={DEFAULT_VIGNETTE_COLOR}
                  value={form.creepyFx?.vignetteColor || ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      creepyFx: { ...(f.creepyFx ?? {}), vignetteColor: e.target.value },
                    }))
                  }
                />
              </div>
              <p className="lh-color-hint">가장자리에서 밀려드는 어둠의 색을 정합니다.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <DustFxFields
        value={form.dustFx}
        onChange={(dustFx) => setForm((f) => ({ ...f, dustFx }))}
        hintClassName="lh-color-hint"
      />
      </>
      ) : null}

      {tab === 'basic' ? (
      <>
      <SectionTitle>기본 정보</SectionTitle>
      <div className="lh-oc-admin-grid">
        {CORE_PROFILE_FIELD_KEYS.map((key) => (
          <div key={key} className="form-group">
            <label className="form-label">{key}</label>
            <input
              className="form-input"
              value={getCoreValue(key)}
              onChange={(e) => setCoreValue(key, e.target.value)}
            />
            <input
              className="form-input"
              style={{ marginTop: 6 }}
              placeholder="호버 TMI (선택)"
              value={getCoreTip(key)}
              onChange={(e) => setCoreTip(key, e.target.value)}
            />
          </div>
        ))}
        <div className="form-group">
          <label className="form-label">소속</label>
          <input className="form-input" value={form.faction || ''} onChange={(e) => set('faction', e.target.value)} />
        </div>
      </div>

      <SectionTitle>추가 프로필 항목</SectionTitle>
      {extraProfileRows.map((row, i) => (
        <div key={i} className="oc-edit-list-row" style={{ flexWrap: 'wrap' }}>
          <input className="form-input" placeholder="항목" value={row.k} onChange={(e) => updateProfile(i, { k: e.target.value })} />
          <input className="form-input" placeholder="값" value={row.v} onChange={(e) => updateProfile(i, { v: e.target.value })} />
          <input
            className="form-input"
            placeholder="호버 TMI"
            value={row.tip || ''}
            onChange={(e) => updateProfile(i, { tip: e.target.value })}
          />
          <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeProfileRow(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addProfileRow}>
        + 항목 추가
      </button>

      {showTrpgLinks ? (
        <>
          <SectionTitle>TRPG 연관 바로가기</SectionTitle>
          <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
            시나리오를 선택해 추가하세요. 캐릭터 상세에 연관 바로가기로 표시됩니다.
          </p>
          <LinkPickList
            options={trpg.map((s) => ({ id: s.id, label: s.title || s.id }))}
            selectedIds={[...linkedTrpgIds]}
            onChange={(ids) => setLinkedTrpgIds(new Set(ids))}
            emptyLabel="연결된 시나리오가 없습니다."
            selectPlaceholder="시나리오 선택해서 추가…"
          />
        </>
      ) : null}
      </>
      ) : null}

      {tab === 'profile' ? (
      <>
      <LakeEditTabs tabs={profileTabs} active={profileSub} onChange={onProfileSubChange} />

      {/* #5 서브 섹션 내용이 탭과 너무 붙지 않게 여백 */}
      <div className="oc-profile-sub-gap" aria-hidden />

      {profileSub === 'image' ? (
      <>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 10px' }}>
        목록 카드 이미지·크롭은 「기본」탭 왼쪽에서 설정합니다. 여기서는 고스트·대표 대사를 관리합니다.
      </p>
      <SectionTitle>고스트 이미지</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        상세 화면 뒤 고스트(투명 배경 일러). 비우면 현재 표시 이미지를 씁니다.
      </p>
      <div className="form-group">
        <label className="form-label">고스트 이미지 URL</label>
        <input
          className="form-input"
          value={form.ghostImg || ''}
          onChange={(e) => set('ghostImg', e.target.value)}
          placeholder="비우면 메인/표시 이미지"
        />
      </div>
      {form.ghostImg ? (
        <div style={{ marginBottom: 8 }}>
          <img
            src={form.ghostImg}
            alt=""
            style={{ display: 'block', maxHeight: 96, borderRadius: 6, opacity: 0.72 }}
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <label className="file-input-label" style={{ marginBottom: 0 }}>
          고스트 업로드
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadGhostImage(f);
              e.target.value = '';
            }}
          />
        </label>
        {form.ghostImg ? (
          <button type="button" className="btn-edit" onClick={() => set('ghostImg', '')}>
            초기화
          </button>
        ) : null}
      </div>

      <SectionTitle>대표 대사 (최대 2)</SectionTitle>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
        상세 화면에 고정으로 남는 인용 대사입니다. 최대 2줄. 진입 시 스윕 연출 후 유지됩니다. 저장 후 상단 「대사」로 위치·크기를 조절하세요.
      </p>
      {(form.floatingQuotes || []).slice(0, 2).map((q, i) => (
        <div key={q.id} className="form-group" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, opacity: 0.55, minWidth: 18, paddingTop: 8 }}>{i + 1}</span>
            <textarea
              className="form-input"
              rows={2}
              value={q.text}
              onChange={(e) => {
                const next = [...(form.floatingQuotes || [])];
                next[i] = { ...q, text: e.target.value };
                set('floatingQuotes', next);
              }}
              placeholder="…너는 뭐지?"
              style={{ flex: 1 }}
            />
            <select
              className="form-input"
              style={{ width: 88, flex: '0 0 auto' }}
              value={q.align || 'center'}
              onChange={(e) => {
                const align = e.target.value as 'left' | 'center' | 'right';
                const next = [...(form.floatingQuotes || [])];
                next[i] = { ...q, align };
                set('floatingQuotes', next);
              }}
              aria-label="정렬"
            >
              <option value="left">왼쪽</option>
              <option value="center">중앙</option>
              <option value="right">오른쪽</option>
            </select>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '6px 10px', flex: '0 0 auto' }}
              onClick={() =>
                set(
                  'floatingQuotes',
                  (form.floatingQuotes || []).filter((_, j) => j !== i),
                )
              }
            >
              삭제
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-save"
        style={{ padding: '5px 12px', marginBottom: 12 }}
        disabled={(form.floatingQuotes?.length ?? 0) >= 2}
        onClick={() => {
          if ((form.floatingQuotes?.length ?? 0) >= 2) return;
          set('floatingQuotes', [
            ...(form.floatingQuotes || []),
            { id: newId(), text: '', x: 50, y: 72, scale: 1, align: 'center' },
          ]);
        }}
      >
        + 대표 대사 추가
      </button>
      </>
      ) : null}

      {profileSub === 'intro' ? (
      <div className="form-group">
        <label className="form-label">소개 (프로필 · 왼쪽 메뉴)</label>
        <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 6px' }}>
          드래그 후 색·굵기·폰트·크기 바로 적용 · 엔터 = 문단 나눔
        </p>
        <StoryRichTextarea
          rows={3}
          value={form.desc || ''}
          onChange={(v) => set('desc', v)}
          placeholder="캐릭터 소개글. PV 인트로·VN 대화와 별도입니다."
        />
      </div>
      ) : null}

      {profileSub === 'appearance' ? (
      <div className="form-group">
        <label className="form-label">외관</label>
        <StoryRichTextarea
          rows={4}
          value={form.appearance || ''}
          onChange={(v) => set('appearance', v)}
          placeholder="외관 설명 — 드래그 후 색·굵기·폰트·크기 바로 적용"
        />
      </div>
      ) : null}

      {profileSub === 'taste' ? (
      <>
      <div className="form-group">
        <label className="form-label">특이사항 (서두)</label>
        <StoryRichTextarea
          rows={2}
          resizable
          value={form.special || ''}
          onChange={(v) => set('special', v)}
          placeholder="특이사항 서두 — 구분선(─) · 서식 가능"
        />
      </div>
      <SectionTitle>항목</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        드래그로 순서 · 제목 옆 ─ 로 본문 구분선 · 항목 사이 「구분선」으로 가로선 추가 · 너비로 LIKE|HATE 2단
      </p>
      {(form.tasteItems ?? []).map((item, i) => (
        <div key={item.id}>
          {i > 0 ? (
            <div className="oc-edit-taste-between">
              <button
                type="button"
                className="oc-edit-taste-between__btn"
                onClick={() => insertTasteAt(i, createTasteDivider())}
              >
                ─ 구분선 추가
              </button>
            </div>
          ) : null}
          {item.divider ? (
            <div
              className={`oc-edit-taste-divider${tasteDragIndex === i ? ' is-dragging' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (tasteDragIndex !== null) moveTasteItem(tasteDragIndex, i);
                setTasteDragIndex(null);
              }}
            >
              <span
                className="oc-edit-taste-item__handle"
                aria-hidden
                title="드래그로 이동"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(i));
                  e.dataTransfer.effectAllowed = 'move';
                  setTasteDragIndex(i);
                }}
                onDragEnd={() => setTasteDragIndex(null)}
              >
                ⠿
              </span>
              <span className="oc-edit-taste-divider__line" aria-hidden />
              <span className="oc-edit-taste-divider__label">구분선</span>
              <button
                type="button"
                className="btn-del"
                onClick={() => set('tasteItems', (form.tasteItems ?? []).filter((_, j) => j !== i))}
                aria-label="구분선 삭제"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              className={`oc-edit-taste-item${tasteDragIndex === i ? ' is-dragging' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (tasteDragIndex !== null) moveTasteItem(tasteDragIndex, i);
                setTasteDragIndex(null);
              }}
            >
              <div className="oc-edit-taste-item__head">
                <span
                  className="oc-edit-taste-item__handle"
                  aria-hidden
                  title="드래그로 이동"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(i));
                    e.dataTransfer.effectAllowed = 'move';
                    setTasteDragIndex(i);
                  }}
                  onDragEnd={() => setTasteDragIndex(null)}
                >
                  ⠿
                </span>
                <input
                  className="form-input"
                  placeholder="제목 (예: HOBBY)"
                  value={item.title}
                  onChange={(e) => patchTasteItem(i, { title: e.target.value })}
                  aria-label="항목 제목"
                />
                <button
                  type="button"
                  className="oc-edit-taste-item__div-btn"
                  title="본문에 구분선 삽입"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => tasteEditorRefs.current[item.id]?.insertDivider()}
                >
                  ─
                </button>
                <select
                  className="form-input oc-edit-taste-item__width"
                  value={item.width === 'half' ? 'half' : 'full'}
                  onChange={(e) =>
                    patchTasteItem(i, { width: e.target.value === 'half' ? 'half' : 'full' })
                  }
                  aria-label="너비"
                >
                  <option value="full">전체 너비</option>
                  <option value="half">절반 너비</option>
                </select>
                <button
                  type="button"
                  className="btn-del"
                  onClick={() => set('tasteItems', (form.tasteItems ?? []).filter((_, j) => j !== i))}
                  aria-label="항목 삭제"
                >
                  ✕
                </button>
              </div>
              <StoryRichTextarea
                ref={(el) => {
                  tasteEditorRefs.current[item.id] = el;
                }}
                rows={3}
                resizable
                hideHint
                value={item.body}
                onChange={(v) => patchTasteItem(i, { body: v })}
                placeholder="내용 — 드래그 후 색·굵기·폰트·크기"
              />
            </div>
          )}
        </div>
      ))}
      <div className="oc-edit-taste-between">
        <button
          type="button"
          className="oc-edit-taste-between__btn"
          onClick={() => set('tasteItems', [...(form.tasteItems ?? []), createTasteDivider()])}
        >
          ─ 구분선 추가
        </button>
      </div>
      <button
        type="button"
        className="btn-save"
        style={{ padding: '6px 12px' }}
        onClick={() => set('tasteItems', [...(form.tasteItems ?? []), createEmptyTasteItem()])}
      >
        + 항목 추가
      </button>
      </>
      ) : null}

      {profileSub === 'stats' ? (
      <>
      <SectionTitle>호버 스탯 · 레이더</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        화면 왼쪽 벽에 호버(터치: 탭)하면 나타나는 패널입니다. 표시는 축 영문 대문자만(STR 등), 숫자는 차트 형태로만. 값 범위 0~100.
      </p>
      {(form.statPanel?.radar || []).map((row, i) => {
        const hint = OC_STAT_RADAR_HINTS[row.axis.trim().toUpperCase()];
        return (
          <div key={`radar-${i}`} className="oc-edit-list-row" style={{ gridTemplateColumns: '1.2fr 0.7fr auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <input
                className="form-input"
                placeholder="축 (예: STR)"
                value={row.axis}
                onChange={(e) => updateRadarAxis(i, { axis: e.target.value })}
              />
              {hint ? (
                <span style={{ fontSize: 9, opacity: 0.45, paddingLeft: 2 }}>{hint}</span>
              ) : null}
            </div>
            <input
              className="form-input"
              type="number"
              min={0}
              max={100}
              placeholder="0–100"
              value={Number.isFinite(row.value) ? row.value : ''}
              onChange={(e) =>
                updateRadarAxis(i, { value: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
              }
            />
            <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeRadarAxis(i)}>
              ✕
            </button>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" className="btn-save" style={{ padding: '5px 12px' }} onClick={addRadarAxis}>
          + 레이더 축 추가
        </button>
        <button type="button" className="btn-edit" style={{ padding: '5px 12px' }} onClick={resetRadarDefaults}>
          기본 6축 복원
        </button>
      </div>

      <SectionTitle>호버 스탯 · 능력치 바</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        패널 하단 라벨 + 프로그레스 바. ⠿ 핸들로 드래그해 순서를 바꿀 수 있습니다. max 기본 1000.
      </p>
      {(form.statPanel?.bars || []).map((row, i) => (
        <div
          key={`bar-${i}`}
          className={`oc-edit-list-row${statBarDragIndex === i ? ' is-dragging' : ''}`}
          style={{ gridTemplateColumns: 'auto 1fr 0.55fr 0.55fr auto' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (statBarDragIndex !== null) moveStatBar(statBarDragIndex, i);
            setStatBarDragIndex(null);
          }}
        >
          <span
            className="oc-edit-taste-item__handle"
            aria-hidden
            title="드래그로 이동"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(i));
              e.dataTransfer.effectAllowed = 'move';
              setStatBarDragIndex(i);
            }}
            onDragEnd={() => setStatBarDragIndex(null)}
          >
            ⠿
          </span>
          <input
            className="form-input"
            placeholder="라벨 (예: 인문)"
            value={row.label}
            onChange={(e) => updateStatBar(i, { label: e.target.value })}
          />
          <input
            className="form-input"
            type="number"
            min={0}
            placeholder="값"
            value={Number.isFinite(row.value) ? row.value : ''}
            onChange={(e) => updateStatBar(i, { value: Math.max(0, Number(e.target.value) || 0) })}
          />
          <input
            className="form-input"
            type="number"
            min={1}
            placeholder="max"
            value={row.max != null && Number.isFinite(row.max) ? row.max : ''}
            onChange={(e) => {
              const raw = e.target.value;
              updateStatBar(i, {
                max: raw === '' ? undefined : Math.max(1, Number(raw) || 1),
              });
            }}
          />
          <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeStatBar(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 14 }} onClick={addStatBar}>
        + 능력치 바 추가
      </button>

      <SectionTitle>스테이터스 (TRPG)</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        기존 TRPG용 키·값 목록입니다. 호버 패널과는 별도입니다.
      </p>
      {(form.stats || []).map((row, i) => (
        <div key={i} className="oc-edit-list-row">
          <input className="form-input" placeholder="항목" value={row.k} onChange={(e) => updateStat(i, { k: e.target.value })} />
          <input className="form-input" placeholder="값" value={row.v} onChange={(e) => updateStat(i, { v: e.target.value })} />
          <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeStatRow(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addStatRow}>
        + TRPG 스탯 추가
      </button>
      </>
      ) : null}

      {profileSub === 'keywords' ? (
      <div className="form-group">
        <label className="form-label">키워드 (쉼표)</label>
        <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 6px' }}>왼쪽 메뉴·기본 정보에 표시되는 캐릭터 키워드입니다.</p>
        <CommaSeparatedInput
          value={commaDraft.keywords}
          onChange={(v) => setCommaDraft((d) => ({ ...d, keywords: v }))}
          placeholder="키워드1, 키워드2"
        />
      </div>
      ) : null}

      {profileSub === 'flat' ? (
      <>
        <SectionTitle>납작 캐해</SectionTitle>
        <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
          캐릭터 해석(캐해)을 글로 작성합니다. 오른쪽 정보 패널에 「납작 캐해」로 표시됩니다.
        </p>
        <div className="form-group">
          <StoryRichTextarea
            rows={8}
            value={form.flatLore || ''}
            onChange={(v) => set('flatLore', v)}
            placeholder="캐릭터 해석·설정 등 — 드래그 후 색·굵기·폰트·크기 바로 적용"
          />
        </div>
      </>
      ) : null}

      {profileSub === 'notes' ? (
      <>
        <SectionTitle>손글씨 쪽지</SectionTitle>
        <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
          이미지(스캔·일러)를 올리면 상세 이름 앞에 쪽지 아이콘이 생기고, 누르면 펼쳐 봅니다.
        </p>
        <div className="form-group">
          <div className="lh-gal-edit-imgs">
            {(form.handwritingNotes || []).map((src, ni) => (
              <div key={`${src}-${ni}`} className="lh-gal-edit-imgs__row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" referrerPolicy="no-referrer" />
                <button
                  type="button"
                  className="btn-del"
                  onClick={() => {
                    const next = (form.handwritingNotes || []).filter((_, j) => j !== ni);
                    set('handwritingNotes', next.length ? next : undefined);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <ImageUploadCrop
            label="쪽지 이미지 추가"
            value={handNoteDraft}
            folder="oc/hand-notes"
            onChange={setHandNoteDraft}
            onUploaded={(url) => {
              const prev = form.handwritingNotes || [];
              set('handwritingNotes', [...prev, url]);
              setHandNoteDraft('');
            }}
            uploading={noteUploading}
            onUploadStart={() => setNoteUploading(true)}
            onUploadEnd={() => setNoteUploading(false)}
            urlPlaceholder="또는 URL"
          />
          {handNoteDraft.trim() ? (
            <button
              type="button"
              className="btn-save"
              style={{ padding: '5px 12px', marginTop: 8 }}
              onClick={() => {
                const src = handNoteDraft.trim();
                if (!src) return;
                const prev = form.handwritingNotes || [];
                set('handwritingNotes', [...prev, src]);
                setHandNoteDraft('');
              }}
            >
              + URL로 쪽지 추가
            </button>
          ) : null}
          <div className="pair-note-sfx">
            <div className="pair-note-sfx__head">
              <span className="pair-note-sfx__title">펼침 효과음</span>
              <span className="pair-note-sfx__hint">쪽지를 열 때 한 번 재생됩니다 · 비우면 무음</span>
            </div>
            <AudioFileField
              label=""
              value={form.handwritingNoteSfx || ''}
              folder="oc/hand-notes-sfx"
              uploading={noteUploading}
              onUploadStart={() => setNoteUploading(true)}
              onUploadEnd={() => setNoteUploading(false)}
              onChange={(url) =>
                set('handwritingNoteSfx', url.trim() ? url.trim() : undefined)
              }
            />
          </div>
          <div className="pair-note-sfx">
            <div className="pair-note-sfx__head">
              <span className="pair-note-sfx__title">닫힘 효과음</span>
              <span className="pair-note-sfx__hint">쪽지를 닫을 때 한 번 재생됩니다 · 비우면 무음</span>
            </div>
            <AudioFileField
              label=""
              value={form.handwritingNoteCloseSfx || ''}
              folder="oc/hand-notes-sfx"
              uploading={noteUploading}
              onUploadStart={() => setNoteUploading(true)}
              onUploadEnd={() => setNoteUploading(false)}
              onChange={(url) =>
                set('handwritingNoteCloseSfx', url.trim() ? url.trim() : undefined)
              }
            />
          </div>
        </div>
      </>
      ) : null}

      {activeCustom && activeCustomIndex >= 0 ? (
      <>
      <SectionTitle>커스텀 탭</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        이 탭은 왼쪽 메뉴 PROFILE에 표시됩니다. 이름을 바꾸면 서브탭 라벨도 같이 바뀝니다.
      </p>
      <div className="form-group" style={{ border: '1px solid rgba(215,169,130,0.2)', borderRadius: 8, padding: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input
            className="form-input"
            placeholder="탭 이름 (예: 능력)"
            value={activeCustom.title}
            onChange={(e) => patchCustomSection(activeCustomIndex, { title: e.target.value })}
          />
          <button
            type="button"
            className="btn-del"
            style={{ padding: '4px 8px' }}
            onClick={() => void removeCustomTab(activeCustomIndex)}
          >
            ✕
          </button>
        </div>
        <StoryRichTextarea
          rows={6}
          placeholder="내용 — 드래그 후 색·굵기·폰트·크기 바로 적용"
          value={activeCustom.body}
          onChange={(v) => patchCustomSection(activeCustomIndex, { body: v })}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '10px 0 2px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!activeCustom.mystic}
            onChange={(e) =>
              patchCustomSection(activeCustomIndex, { mystic: e.target.checked || undefined })
            }
          />
          ✦ 신비 연출 (능력명 금빛+글로우 · 클릭 시 상세 리빌)
        </label>
        {activeCustom.mystic ? (
          <div
            style={{
              borderTop: '1px dashed rgba(215,169,130,0.25)',
              marginTop: 8,
              paddingTop: 8,
            }}
          >
            <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 6px' }}>
              능력명 + 발동 조건(상세). 상세는 상세 화면에서 클릭 시 안개 걷히듯 나타납니다.
            </p>
            {(activeCustom.abilities ?? []).map((ab, ai) => (
              <div
                key={ab.id}
                style={{
                  border: '1px solid rgba(215,169,130,0.16)',
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <input
                    className="form-input"
                    placeholder="능력명 (예: 안개 걷기)"
                    value={ab.name}
                    onChange={(e) => {
                      const abs = [...(activeCustom.abilities ?? [])];
                      abs[ai] = { ...abs[ai], name: e.target.value };
                      patchCustomSection(activeCustomIndex, { abilities: abs });
                    }}
                  />
                  <button
                    type="button"
                    className="btn-del"
                    style={{ padding: '4px 8px' }}
                    onClick={() => {
                      const abs = (activeCustom.abilities ?? []).filter((_, j) => j !== ai);
                      patchCustomSection(activeCustomIndex, { abilities: abs });
                    }}
                  >
                    ✕
                  </button>
                </div>
                <StoryRichTextarea
                  rows={2}
                  placeholder="발동 조건 등 상세 스탯 — 클릭 시 리빌"
                  value={ab.detail || ''}
                  onChange={(v) => {
                    const abs = [...(activeCustom.abilities ?? [])];
                    abs[ai] = { ...abs[ai], detail: v };
                    patchCustomSection(activeCustomIndex, { abilities: abs });
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="btn-save"
              style={{ padding: '5px 10px' }}
              onClick={() => {
                const abs = [
                  ...(activeCustom.abilities ?? []),
                  {
                    id: `ab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                    name: '',
                    detail: '',
                  },
                ];
                patchCustomSection(activeCustomIndex, { abilities: abs });
              }}
            >
              + 능력 추가
            </button>
          </div>
        ) : null}
      </div>
      </>
      ) : null}

      {profileSub === PROFILE_ORDER_ID ? (
      <>
      <SectionTitle>섹션 순서</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        왼쪽 메뉴 PROFILE 표시 순서입니다. ⠿ 핸들을 드래그하세요.
      </p>
      {(() => {
        const available: { id: string; label: string }[] = [];
        if (form.desc?.trim()) available.push({ id: 'intro', label: '소개' });
        if (form.appearance?.trim()) available.push({ id: 'appearance', label: '외관' });
        if ((form.relationships ?? []).length) available.push({ id: 'relations', label: '관계' });
        if (form.special?.trim() || tasteItemsHaveContent(form.tasteItems)) {
          available.push({ id: 'taste', label: '특이사항' });
        }
        for (const cs of form.customSections ?? []) {
          if (cs.title?.trim()) available.push({ id: `custom-${cs.id}`, label: cs.title.trim() });
        }

        const order = form.sectionOrder ?? [];
        const ordered = [
          ...order
            .map((id) => available.find((a) => a.id === id))
            .filter((a): a is { id: string; label: string } => Boolean(a)),
          ...available.filter((a) => !order.includes(a.id)),
        ];

        return (
          <OcEditSortRows
            items={ordered}
            onReorder={(ids) => set('sectionOrder', ids)}
            emptyHint={
              <p style={{ fontSize: 11, opacity: 0.5 }}>
                표시할 섹션이 없습니다. 소개·외관·특이사항이나 커스텀 탭을 먼저 채워주세요.
              </p>
            }
          />
        );
      })()}
      </>
      ) : null}

      </>
      ) : null}

      {tab === 'story' ? (
      <>
      <SectionTitle>스토리</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        본편·AU·IF 등 분류별로 글을 등록합니다. PDF에서 텍스트를 가져올 수도 있습니다.
      </p>
      <StoryEntriesEditor
        entries={form.storyEntries || []}
        categories={form.storyCategories}
        categoryColors={form.storyCategoryColors}
        focusEntryId={focusEntryId}
        onChange={(storyEntries, storyCategories, storyCategoryColors) =>
          setForm((f) => ({ ...f, storyEntries, storyCategories, storyCategoryColors }))
        }
      />
      </>
      ) : null}

      {tab === 'gallery' ? (
      <>
      <SectionTitle>갤러리</SectionTitle>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
        항목을 펼쳐 URL·출처를 수정하고, 드래그로 순서를 바꿉니다. 이미지는 R2에 업로드되며 출처는 상세에서
        이미지를 클릭했을 때 왼쪽 하단에 표시됩니다.
      </p>
      <label className="file-input-label" style={{ marginBottom: 8 }}>
        갤러리 이미지 추가
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files || [])];
            void uploadGalleryFiles(files);
            e.target.value = '';
          }}
        />
      </label>
      {ocGalSort.ghostNode}
      {galleryRows.map((item, i) => {
        const open = galOpenIndex === i;
        return (
          <div
            key={`gal-${i}`}
            ref={(el) => ocGalSort.setRowRef(i, el)}
            className={`lh-gal-edit-card${open ? ' is-open' : ''}${
              ocGalSort.dragFrom === i ? ' is-dragging' : ''
            }${ocGalSort.dragOver === i && ocGalSort.dragFrom !== i ? ' is-drop-slot' : ''}`}
          >
            <div className="lh-gal-edit-card__head">
              <button
                type="button"
                className="lh-gal-edit-card__handle"
                title="드래그로 이동"
                aria-label="순서 변경"
                {...ocGalSort.handleProps(i)}
              >
                ⠿
              </button>
              <button
                type="button"
                className="lh-gal-edit-card__toggle"
                onClick={() => setGalOpenIndex(open ? null : i)}
                aria-expanded={open}
              >
                <span className="lh-gal-edit-card__thumb">
                  {item.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.src} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    '🖼'
                  )}
                </span>
                <span className="lh-gal-edit-card__title">
                  {item.src.trim() ? `이미지 ${i + 1}` : `빈 항목 ${i + 1}`}
                </span>
                <span className="lh-gal-edit-card__chev" aria-hidden>
                  {open ? '▾' : '▸'}
                </span>
              </button>
              <button
                type="button"
                className="lake-edit-mini-del"
                onClick={() => removeGallery(i)}
                aria-label="삭제"
              >
                ✕
              </button>
            </div>
            {open ? (
              <div className="lh-gal-edit-card__body">
                <div className="form-group">
                  <label className="form-label">이미지 URL</label>
                  <input
                    className="form-input"
                    value={item.src}
                    placeholder="이미지 URL"
                    onChange={(e) => updateGallery(i, { src: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">작가 / 출처</label>
                  <GalleryCreditInput
                    value={item.credit || ''}
                    placeholder="작가 / 출처 (선택)"
                    onChange={(credit) => updateGallery(i, { credit })}
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={() => addGallery()}>
        + URL 추가
      </button>
      </>
      ) : null}

      {tab === 'relations' ? (
      <>
      <SectionTitle>관계</SectionTitle>
      {(form.relationships || []).map((rel, i) => (
        <div key={rel.id || i} className="oc-edit-list-row" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
          <input className="form-input" placeholder="이름" value={rel.name} onChange={(e) => updateRelation(i, { name: e.target.value })} />
          <input className="form-input" placeholder="관계" value={rel.relation} onChange={(e) => updateRelation(i, { relation: e.target.value })} />
          <input className="form-input" placeholder="메모" value={rel.note || ''} onChange={(e) => updateRelation(i, { note: e.target.value })} />
          <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeRelation(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addRelation}>
        + 관계 추가
      </button>
      </>
      ) : null}

      {tab === 'preview' ? (
      <>
      <SectionTitle>프리뷰</SectionTitle>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 8px' }}>
        상세에서 한 장씩 캐러셀로 표시됩니다.
      </p>
      {(form.previewItems || []).map((n, i) => (
        <div key={n.id || i} style={{ marginBottom: 8 }}>
          <input
            className="form-input"
            placeholder="제목"
            value={n.title || ''}
            onChange={(e) => updatePreview(i, { title: e.target.value })}
          />
          <div style={{ marginTop: 6 }}>
            <StoryRichTextarea
              rows={3}
              placeholder="미리보기 본문 — 드래그 후 서식·폰트·크기 바로 적용"
              value={n.body || ''}
              onChange={(body) => updatePreview(i, { body })}
            />
          </div>
          <button
            type="button"
            className="btn-del"
            style={{ marginTop: 6, padding: '4px 10px' }}
            onClick={() => removePreview(i)}
          >
            삭제
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addPreview}>
        + 프리뷰 추가
      </button>
      </>
      ) : null}

      {tab === 'versions' ? (
      <>
      <SectionTitle>AU / 버전</SectionTitle>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <LakeToggle
          checked={Boolean(form.dialogueKeepAu)}
          onChange={(v) => set('dialogueKeepAu', v)}
          label="대사창 열 때 버전 이미지 유지"
        />
        <p style={{ fontSize: 11, opacity: 0.62, margin: '6px 0 0' }}>
          켜면 버전을 고른 상태에서 대사창·괴롭히기를 열어도 기본으로 돌아가지 않습니다.
          끄면(기본) 대사창을 열 때 기본 이미지로 복귀합니다.
        </p>
        <p style={{ fontSize: 11, opacity: 0.62, margin: '8px 0 0' }}>
          버전별 위치·터치 영역은 상세 화면에서 해당 버전을 고른 뒤 「위치」「터치」로 조절합니다.
          기본과 따로 저장됩니다.
        </p>
      </div>
      {(form.auVersions || []).map((au, i) => (
        <div key={i} style={{ marginBottom: 8, padding: 8, border: '1px solid rgba(215,169,130,.14)', borderRadius: 10 }}>
          <input className="form-input" placeholder="라벨" value={au.label || ''} onChange={(e) => updateAu(i, { label: e.target.value })} />
          {au.img ? (
            <img src={au.img} alt="" style={{ display: 'block', maxHeight: 80, marginTop: 6, borderRadius: 6 }} />
          ) : null}
          <input className="form-input" style={{ marginTop: 6 }} placeholder="이미지 URL" value={au.img || ''} onChange={(e) => updateAu(i, { img: e.target.value })} />
          <label className="file-input-label" style={{ marginTop: 6, display: 'inline-block' }}>
            AU 이미지 파일 업로드
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAuImage(i, f);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="btn-del" style={{ marginTop: 6, padding: '4px 10px', display: 'block' }} onClick={() => removeAu(i)}>
            버전 삭제
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addAu}>
        + AU 추가
      </button>
      </>
      ) : null}

      {tab === 'themeSong' ? (
      <>
      <SectionTitle>테마곡</SectionTitle>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">테마곡명</label>
          <input
            className="form-input"
            value={form.theme?.title || ''}
            onChange={(e) => set('theme', { ...(form.theme || {}), title: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">아티스트</label>
          <input
            className="form-input"
            value={form.theme?.artist || ''}
            onChange={(e) => set('theme', { ...(form.theme || {}), artist: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">YouTube URL / ID</label>
        <input
          className="form-input"
          value={form.theme?.youtubeId || ''}
          onChange={(e) => set('theme', { ...(form.theme || {}), youtubeId: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label className="form-label">오디오 URL (fileData)</label>
        <input
          className="form-input"
          value={form.theme?.fileData || ''}
          onChange={(e) => set('theme', { ...(form.theme || {}), fileData: e.target.value })}
        />
      </div>
      <label className="file-input-label" style={{ marginBottom: 8 }}>
        테마곡 MP3 업로드
        <input
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setBusy(true);
              uploadMediaFile(f, 'oc/theme')
                .then((url) => set('theme', { ...(form.theme || {}), fileData: url }))
                .catch((err) => alert(err instanceof Error ? err.message : '테마 업로드 실패'))
                .finally(() => setBusy(false));
            }
            e.target.value = '';
          }}
        />
      </label>
      </>
      ) : null}

      {tab === 'pv' ? (
      <>
      <SectionTitle>PV 인트로 대사</SectionTitle>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
        캐릭터 진입 시 검은 화면에 표시되는 대사입니다. 소개·VN 대화와 별도로 입력하세요.
      </p>
      <div className="form-group">
        <label className="form-label">PV 인트로</label>
        <select
          className="form-input"
          value={form.pvIntroEnabled == null ? 'default' : form.pvIntroEnabled ? 'on' : 'off'}
          onChange={(e) => {
            const v = e.target.value;
            set('pvIntroEnabled', v === 'default' ? null : v === 'on');
          }}
        >
          <option value="default">사이트 기본값 따름</option>
          <option value="on">사용</option>
          <option value="off">사용 안 함</option>
        </select>
      </div>
      <div className="form-group">
        <textarea
          className="form-input"
          rows={3}
          value={((form.pvIntroLines?.length ? form.pvIntroLines : form.vnLines) || [])
            .map((l) => l.text || '')
            .join('\n')}
          onChange={(e) =>
            set(
              'pvIntroLines',
              e.target.value.split('\n').map((text) => ({ text })),
            )
          }
          onBlur={(e) =>
            set(
              'pvIntroLines',
              e.target.value
                .split('\n')
                .map((text) => ({ text: text.trimEnd() }))
                .filter((l) => l.text.trim()),
            )
          }
          placeholder="한 줄에 한 대사"
        />
      </div>
      </>
      ) : null}

      {tab === 'vn' ? (
      <>
      <SectionTitle>VN 대화 (이미지 클릭)</SectionTitle>
      <LineVoiceVolumeControl variant="panel" />
      <DialogueNodesEditor
        nodes={form.dialogue || []}
        onChange={(dialogue) => set('dialogue', dialogue)}
        speakerPresets={[
          { label: '나', value: '나' },
          ...(form.name?.trim() ? [{ label: form.name.trim(), value: form.name.trim() }] : []),
        ]}
        defaultSpeaker={form.name?.trim() || ''}
        onUploadExpression={uploadExpressionImage}
        onUploadVoice={uploadDialogueVoice}
        uploadBusy={busy}
        listIdPrefix="oc-dlg"
        hint="캐릭터를 클릭하면 이 목록이 재생됩니다. 1→2→3→4 순서대로 적고, 필요할 때만 선택지·연출을 켜 주세요."
        startId={form.dialogueStart || form.dialogue?.[0]?.id || ''}
        onStartIdChange={(id) => set('dialogueStart', id)}
      />
      </>
      ) : null}

      {tab === 'loading' ? (
      <>
      <SectionTitle>상세 진입 로딩 화면</SectionTitle>
      <EntrySplashFormFields
        value={form.entrySplash}
        onChange={(entrySplash) => set('entrySplash', entrySplash)}
      />
      </>
      ) : null}
      <div className="lake-edit-shell__end-space" aria-hidden="true" />
      </div>

      {tabNamePrompt ? (
        <div
          className="lh-dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTabNamePrompt(null);
          }}
        >
          <div className="lh-dialog-box" role="dialog" aria-modal="true" aria-labelledby="oc-tab-name-title">
            <div className="lh-dialog-title" id="oc-tab-name-title">
              새 탭
            </div>
            <div className="lh-dialog-message">탭 이름을 입력하세요. (예: 능력, 무기, 설정)</div>
            <input
              ref={tabNameInputRef}
              className="form-input lh-dialog-input"
              value={tabNamePrompt.value}
              placeholder="탭 이름"
              onChange={(e) => setTabNamePrompt({ value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitCustomTab(tabNamePrompt.value);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setTabNamePrompt(null);
                }
              }}
            />
            <div className="lh-dialog-actions">
              <button type="button" onClick={() => setTabNamePrompt(null)}>
                취소
              </button>
              <button
                type="button"
                className="lh-dialog-primary"
                disabled={!tabNamePrompt.value.trim()}
                onClick={() => commitCustomTab(tabNamePrompt.value)}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
