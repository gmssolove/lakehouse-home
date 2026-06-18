'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useSaveToast } from '@/components/ui/SaveToast';
import {
  applyCharacterTheme,
  deriveThemeFromPersonalColor,
  normalizeHex,
  resolveCharacterTheme,
  stripEmptyThemeFields,
} from '@/lib/oc/characterTheme';
import { normalizeGallery } from '@/lib/oc/gallery';
import {
  CORE_PROFILE_FIELD_KEYS,
  mergeCharacterProfile,
  splitExtraProfileRows,
  type CoreProfileFieldKey,
} from '@/lib/oc/profile';
import { prepareCharacterForSave } from '@/lib/oc/prepareCharacterSave';
import { uploadImageFile, uploadMediaFile } from '@/lib/r2/client';
import type { AuVersion, DialogueChoice, DialogueNode, GalleryItem, OcCharacter, ProfileField, StoryLog, CharacterRelation } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';

function emptyStoryLog(): StoryLog {
  return { id: newId(), title: '새 로그', body: '' };
}

function emptyRelation(): CharacterRelation {
  return { id: newId(), name: '', relation: '' };
}

function emptyDialogueNode(seq: number): DialogueNode {
  return { id: String(seq), speaker: '', text: '', choices: [] };
}

type Props = {
  character: OcCharacter;
  categories: string[];
  onSave: (c: OcCharacter) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  compact?: boolean;
};

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="oc-edit-section-title">{children}</div>;
}

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

export function OcEditForm({ character, categories, onSave, onDelete, compact }: Props) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState(character);
  const [busy, setBusy] = useState(false);
  const [commaDraft, setCommaDraft] = useState({
    keywords: (character.keywords || []).join(', '),
    likes: (character.likes || []).join(', '),
    hates: (character.hates || []).join(', '),
  });
  const [personalHexDraft, setPersonalHexDraft] = useState(character.personalColor || '');
  const themePreview = useMemo(() => resolveCharacterTheme(form), [form]);
  const set = <K extends keyof OcCharacter>(k: K, v: OcCharacter[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function getCoreValue(key: CoreProfileFieldKey): string {
    if (key === '나이') return form.role || '';
    const row = (form.profile ?? []).find((p) => p.k?.trim() === key);
    return row?.v ?? '';
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

  const extraProfileRows = splitExtraProfileRows(form.profile);

  useEffect(() => {
    const extras = splitExtraProfileRows(character.profile);
    setForm({
      ...character,
      gallery: normalizeGallery(character.gallery),
      profile: mergeCharacterProfile(character.profile, character.role, extras),
    });
    setCommaDraft({
      keywords: (character.keywords || []).join(', '),
      likes: (character.likes || []).join(', '),
      hates: (character.hates || []).join(', '),
    });
    setPersonalHexDraft(character.personalColor || '');
  }, [character]);

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
      const merged: OcCharacter = stripEmptyThemeFields({
        ...form,
        keywords: parseCommaList(commaDraft.keywords),
        likes: parseCommaList(commaDraft.likes),
        hates: parseCommaList(commaDraft.hates),
        profile: mergeCharacterProfile(form.profile, form.role, splitExtraProfileRows(form.profile)),
      });
      const prepared = await prepareCharacterForSave(merged);
      await onSave(prepared);
      setForm({
        ...prepared,
        gallery: normalizeGallery(prepared.gallery),
      });
      setCommaDraft({
        keywords: (prepared.keywords || []).join(', '),
        likes: (prepared.likes || []).join(', '),
        hates: (prepared.hates || []).join(', '),
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

  async function uploadGalleryFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = await Promise.all(files.map((f) => uploadImageFile(f, 'oc/gallery')));
      set('gallery', [
        ...normalizeGallery(form.gallery),
        ...uploaded.map((src) => ({ src, credit: '' } satisfies GalleryItem)),
      ]);
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

  function updateGallery(i: number, patch: Partial<GalleryItem>) {
    const g = [...normalizeGallery(form.gallery)];
    g[i] = { ...g[i], ...patch };
    set('gallery', g);
  }

  function addGallery(item: GalleryItem = { src: '', credit: '' }) {
    set('gallery', [...normalizeGallery(form.gallery), item]);
  }

  function removeGallery(i: number) {
    set('gallery', normalizeGallery(form.gallery).filter((_, idx) => idx !== i));
  }

  function updateStoryLog(i: number, patch: Partial<StoryLog>) {
    const logs = [...(form.storyLogs || [])];
    logs[i] = { ...logs[i], ...patch };
    set('storyLogs', logs);
  }

  function addStoryLog() {
    set('storyLogs', [...(form.storyLogs || []), emptyStoryLog()]);
  }

  function removeStoryLog(i: number) {
    set('storyLogs', (form.storyLogs || []).filter((_, idx) => idx !== i));
  }

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

  function updateNovel(i: number, patch: { title?: string; preview?: string }) {
    const rows = [...(form.novel || [])];
    rows[i] = { ...rows[i], ...patch };
    set('novel', rows);
  }

  function addNovel() {
    set('novel', [...(form.novel || []), { title: '', preview: '' }]);
  }

  function removeNovel(i: number) {
    set('novel', (form.novel || []).filter((_, idx) => idx !== i));
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

  function updateDialogue(i: number, patch: Partial<DialogueNode>) {
    const rows = [...(form.dialogue || [])];
    rows[i] = { ...rows[i], ...patch };
    set('dialogue', rows);
  }

  function addDialogueNode() {
    const rows = form.dialogue || [];
    set('dialogue', [...rows, emptyDialogueNode(rows.length + 1)]);
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

  function updateDialogueChoice(di: number, ci: number, patch: Partial<DialogueChoice>) {
    const rows = [...(form.dialogue || [])];
    const node = rows[di];
    if (!node) return;
    const choices = [...(node.choices || [])];
    choices[ci] = { ...choices[ci], ...patch };
    rows[di] = { ...node, choices };
    set('dialogue', rows);
  }

  function addDialogueChoice(di: number) {
    const rows = [...(form.dialogue || [])];
    const node = rows[di];
    if (!node) return;
    rows[di] = { ...node, choices: [...(node.choices || []), { label: '', next: '' }] };
    set('dialogue', rows);
  }

  function removeDialogueChoice(di: number, ci: number) {
    const rows = [...(form.dialogue || [])];
    const node = rows[di];
    if (!node) return;
    rows[di] = { ...node, choices: (node.choices || []).filter((_, idx) => idx !== ci) };
    set('dialogue', rows);
  }

  function removeDialogueNode(i: number) {
    set('dialogue', (form.dialogue || []).filter((_, idx) => idx !== i));
  }

  function moveDialogueNode(i: number, dir: -1 | 1) {
    const rows = [...(form.dialogue || [])];
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    set('dialogue', rows);
  }

  async function uploadExpressionImage(i: number, file: File) {
    setBusy(true);
    try {
      const url = await uploadImageFile(file, 'oc/expression');
      updateDialogue(i, { expression: url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '표정 이미지 업로드에 실패했습니다.';
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', gap: 8 }}>
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
          <label className="form-label">소속</label>
          <input className="form-input" value={form.faction || ''} onChange={(e) => set('faction', e.target.value)} />
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
      </div>

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
        <label className="lh-color-auto-bg">
          <input
            type="checkbox"
            checked={form.themeAutoBackground !== false}
            onChange={(e) => setThemeAutoBackground(e.target.checked)}
          />
          배경색 자동 맞춤 (포인트·패널·메뉴 등 전체)
        </label>
        <p className="lh-color-hint">
          {form.themeAutoBackground !== false
            ? '퍼스널 컬러에 맞춰 아래 테마 색이 함께 조정됩니다. 개별 색상은 따로 바꿀 수 있습니다.'
            : '퍼스널 컬러만 바뀝니다. 포인트·배경·테두리 등은 아래 색상을 직접 설정하세요.'}
        </p>
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
          </div>
        ))}
      </div>

      <SectionTitle>이미지</SectionTitle>
      <div className="form-group">
        <label className="form-label">이미지 URL</label>
        <input className="form-input" value={form.img || ''} onChange={(e) => set('img', e.target.value)} />
      </div>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">Fit</label>
          <select className="form-input" value={form.imgFit || 'contain'} onChange={(e) => set('imgFit', e.target.value)}>
            <option value="contain">Contain</option>
            <option value="cover">Cover</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">위치</label>
          <select className="form-input" value={form.imgPos || 'center top'} onChange={(e) => set('imgPos', e.target.value)}>
            <option value="center top">위쪽</option>
            <option value="center center">중앙</option>
            <option value="center bottom">아래</option>
          </select>
        </div>
      </div>
      <label className="file-input-label" style={{ marginBottom: 8 }}>
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

      <div className="form-group">
        <label className="form-label">소개 (프로필 · 왼쪽 메뉴)</label>
        <textarea
          className="form-input"
          rows={3}
          value={form.desc || ''}
          onChange={(e) => set('desc', e.target.value)}
          placeholder="캐릭터 소개글. PV 인트로·VN 대화와 별도입니다."
        />
      </div>

      <div className="form-group">
        <label className="form-label">외관</label>
        <textarea className="form-input" rows={2} value={form.appearance || ''} onChange={(e) => set('appearance', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">특이사항</label>
        <textarea className="form-input" rows={2} value={form.special || ''} onChange={(e) => set('special', e.target.value)} />
      </div>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">취미</label>
          <input className="form-input" value={form.hobby || ''} onChange={(e) => set('hobby', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">키워드 (쉼표)</label>
          <CommaSeparatedInput
            value={commaDraft.keywords}
            onChange={(v) => setCommaDraft((d) => ({ ...d, keywords: v }))}
            placeholder="키워드1, 키워드2"
          />
        </div>
      </div>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">좋아하는 것</label>
          <CommaSeparatedInput
            value={commaDraft.likes}
            onChange={(v) => setCommaDraft((d) => ({ ...d, likes: v }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">싫어하는 것</label>
          <CommaSeparatedInput
            value={commaDraft.hates}
            onChange={(v) => setCommaDraft((d) => ({ ...d, hates: v }))}
          />
        </div>
      </div>

      <SectionTitle>추가 프로필 항목</SectionTitle>
      {extraProfileRows.map((row, i) => (
        <div key={i} className="oc-edit-list-row">
          <input className="form-input" placeholder="항목" value={row.k} onChange={(e) => updateProfile(i, { k: e.target.value })} />
          <input className="form-input" placeholder="값" value={row.v} onChange={(e) => updateProfile(i, { v: e.target.value })} />
          <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeProfileRow(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addProfileRow}>
        + 항목 추가
      </button>

      <SectionTitle>서사</SectionTitle>
      <div className="form-group">
        <label className="form-label">메인 서사 (story)</label>
        <textarea className="form-input" rows={4} value={form.story || ''} onChange={(e) => set('story', e.target.value)} />
      </div>
      {(form.storyLogs || []).map((log, i) => (
        <div key={log.id || i} style={{ marginBottom: 10, padding: 8, border: '1px solid rgba(215,169,130,.14)', borderRadius: 10 }}>
          <input className="form-input" placeholder="로그 제목" value={log.title} onChange={(e) => updateStoryLog(i, { title: e.target.value })} />
          <textarea className="form-input" rows={3} style={{ marginTop: 6 }} value={log.body} onChange={(e) => updateStoryLog(i, { body: e.target.value })} />
          <button type="button" className="btn-del" style={{ marginTop: 6, padding: '4px 10px' }} onClick={() => removeStoryLog(i)}>
            로그 삭제
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addStoryLog}>
        + 서사 로그 추가
      </button>

      <SectionTitle>갤러리</SectionTitle>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
        이미지는 R2에 업로드되어 URL로 저장됩니다. 출처는 갤러리에서 이미지를 클릭했을 때 왼쪽 하단에 표시됩니다.
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
      {normalizeGallery(form.gallery).map((item, i) => (
        <div key={i} className="oc-edit-gallery-row">
          {item.src ? <img src={item.src} alt="" /> : <div style={{ width: 42, height: 52, background: 'var(--bg3)' }} />}
          <div className="oc-edit-gallery-fields">
            <input
              className="form-input"
              value={item.src}
              placeholder="이미지 URL"
              onChange={(e) => updateGallery(i, { src: e.target.value })}
            />
            <input
              className="form-input"
              value={item.credit || ''}
              placeholder="작가 / 출처 (선택)"
              onChange={(e) => updateGallery(i, { credit: e.target.value })}
            />
          </div>
          <button type="button" className="btn-del" style={{ padding: '3px 8px' }} onClick={() => removeGallery(i)}>
            삭제
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={() => addGallery()}>
        + URL 추가
      </button>

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

      <SectionTitle>소설 / 프리뷰</SectionTitle>
      {(form.novel || []).map((n, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <input className="form-input" placeholder="제목" value={n.title || ''} onChange={(e) => updateNovel(i, { title: e.target.value })} />
          <textarea className="form-input" rows={2} style={{ marginTop: 6 }} placeholder="미리보기" value={n.preview || ''} onChange={(e) => updateNovel(i, { preview: e.target.value })} />
          <button type="button" className="btn-del" style={{ marginTop: 6, padding: '4px 10px' }} onClick={() => removeNovel(i)}>
            삭제
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addNovel}>
        + 소설 항목 추가
      </button>

      <SectionTitle>AU / 버전</SectionTitle>
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

      <SectionTitle>테마곡 · PV</SectionTitle>
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
      <SectionTitle>스테이터스 (TRPG)</SectionTitle>
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
        + 스탯 추가
      </button>

      <SectionTitle>PV 인트로 대사</SectionTitle>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
        캐릭터 진입 시 검은 화면에 표시되는 대사입니다. 소개·VN 대화와 별도로 입력하세요.
      </p>
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
              e.target.value
                .split('\n')
                .map((text) => ({ text: text.trim() }))
                .filter((l) => l.text),
            )
          }
          placeholder="한 줄에 한 대사"
        />
      </div>

      <SectionTitle>VN 대화 (이미지 클릭)</SectionTitle>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
        프로필에서 캐릭터 이미지를 클릭했을 때 나오는 대화입니다.
      </p>
      {(form.dialogue || []).map((node, i) => (
        <div key={node.id || i} className="lh-dialogue-node">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--lake-copper-soft, var(--pink))' }}>대사 {i + 1}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="btn-save"
                style={{ padding: '3px 8px', fontSize: 10 }}
                disabled={i === 0}
                onClick={() => moveDialogueNode(i, -1)}
                aria-label="위로"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-save"
                style={{ padding: '3px 8px', fontSize: 10 }}
                disabled={i === (form.dialogue?.length ?? 0) - 1}
                onClick={() => moveDialogueNode(i, 1)}
                aria-label="아래로"
              >
                ↓
              </button>
            </div>
          </div>
          <div className="lh-oc-admin-grid">
            <div className="form-group">
              <label className="form-label">ID</label>
              <input className="form-input" value={node.id} onChange={(e) => updateDialogue(i, { id: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">화자</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                <button
                  type="button"
                  className="btn-save"
                  style={{ padding: '3px 10px', fontSize: 10 }}
                  onClick={() => updateDialogue(i, { speaker: '나' })}
                >
                  나
                </button>
                {form.name?.trim() ? (
                  <button
                    type="button"
                    className="btn-save"
                    style={{ padding: '3px 10px', fontSize: 10 }}
                    onClick={() => updateDialogue(i, { speaker: form.name.trim() })}
                  >
                    {form.name.trim()}
                  </button>
                ) : null}
              </div>
              <input
                className="form-input"
                list={`dialogue-speaker-${i}`}
                placeholder="직접 입력"
                value={node.speaker || ''}
                onChange={(e) => updateDialogue(i, { speaker: e.target.value })}
              />
              <datalist id={`dialogue-speaker-${i}`}>
                <option value="나" />
                {form.name?.trim() ? <option value={form.name.trim()} /> : null}
              </datalist>
            </div>
          </div>
          <textarea
            className="form-input"
            rows={2}
            style={{ marginTop: 6 }}
            placeholder="대사"
            value={node.text}
            onChange={(e) => updateDialogue(i, { text: e.target.value })}
          />
          <div className="form-group" style={{ marginTop: 6 }}>
            <label className="form-label">표정 이미지</label>
            {node.expression ? (
              <img
                src={node.expression}
                alt=""
                style={{ display: 'block', maxHeight: 72, marginBottom: 6, borderRadius: 6 }}
              />
            ) : null}
            <input
              className="form-input"
              placeholder="표정 이미지 URL (선택)"
              value={node.expression || ''}
              onChange={(e) => updateDialogue(i, { expression: e.target.value })}
            />
            <label className="file-input-label" style={{ marginTop: 6, display: 'inline-block' }}>
              표정 이미지 파일 선택
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadExpressionImage(i, f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="form-label" style={{ marginBottom: 4 }}>
              선택지 (대사 후 분기)
            </div>
            {(node.choices || []).map((ch, ci) => (
              <div key={ci} className="oc-edit-list-row" style={{ marginBottom: 4, gridTemplateColumns: '1fr 1fr auto' }}>
                <input
                  className="form-input"
                  placeholder="선택지 텍스트"
                  value={ch.label}
                  onChange={(e) => updateDialogueChoice(i, ci, { label: e.target.value })}
                />
                <input
                  className="form-input"
                  placeholder="다음 노드 ID"
                  value={ch.next}
                  onChange={(e) => updateDialogueChoice(i, ci, { next: e.target.value })}
                />
                <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeDialogueChoice(i, ci)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn-save" style={{ padding: '4px 10px', marginTop: 4 }} onClick={() => addDialogueChoice(i)}>
              + 선택지 추가
            </button>
          </div>
          <button type="button" className="btn-del" style={{ marginTop: 6, padding: '4px 10px' }} onClick={() => removeDialogueNode(i)}>
            대사 삭제
          </button>
        </div>
      ))}
      <button type="button" className="btn-save" style={{ padding: '5px 12px', marginBottom: 8 }} onClick={addDialogueNode}>
        + VN 대사 추가
      </button>
      <div className="form-group">
        <label className="form-label">VN 시작 노드 ID</label>
        <input className="form-input" value={form.dialogueStart || ''} onChange={(e) => set('dialogueStart', e.target.value)} placeholder="비우면 첫 대사" />
      </div>
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
    </>
  );
}
