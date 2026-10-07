import { signInAnonymously, type User } from 'firebase/auth';
import { get, ref, set } from 'firebase/database';
import { auth, db } from '@/lib/firebase/client';

/** 프로젝트는 Firestore가 아니라 RTDB를 사용 중 — 동일 Firebase에 세이브 저장 */
export const VN_SAVE_SLOTS = ['save_1', 'save_2', 'save_3'] as const;
export type VNSaveSlotId = (typeof VN_SAVE_SLOTS)[number];

/** 如月 정적 씬들은 한 작품으로 묶음. TRPG는 시나리오 id 그대로 사용 */
export const VN_KISARAGI_SAVE_SCOPE = 'kisaragi';

export type VNSaveData = {
  sceneId: string;
  lineId: string;
  savedAt: number;
  missionsActive?: string[];
  missionsCompleted?: string[];
  hotspotsChecked?: string[];
};

export type VNMissionSaveSlice = {
  missionsActive: string[];
  missionsCompleted: string[];
};

function normalizeIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function parseSave(v: Partial<VNSaveData> | null | undefined): VNSaveData | null {
  if (!v?.sceneId || !v?.lineId) return null;
  return {
    sceneId: String(v.sceneId),
    lineId: String(v.lineId),
    savedAt: typeof v.savedAt === 'number' ? v.savedAt : Date.now(),
    missionsActive: normalizeIds(v.missionsActive),
    missionsCompleted: normalizeIds(v.missionsCompleted),
    hotspotsChecked: normalizeIds(v.hotspotsChecked),
  };
}

export async function ensureVnAuthUser(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

function encodeSaveScope(scopeId: string): string {
  const s = String(scopeId || '').trim();
  if (!s) return '_';
  let out = '';
  for (const ch of s) {
    out += '.$[]/'.includes(ch) ? '_' : ch;
  }
  return out.slice(0, 200);
}

function scenarioSlotsPath(uid: string, scopeId: string) {
  return `vnSaves/${uid}/scenarios/${encodeSaveScope(scopeId)}`;
}

function slotPath(uid: string, scopeId: string, slot: VNSaveSlotId) {
  return `${scenarioSlotsPath(uid, scopeId)}/${slot}`;
}

function isKisaragiSceneId(id: string): boolean {
  return (
    id.startsWith('ep1_') ||
    id.startsWith('test_scene') ||
    id === 'effects_demo'
  );
}

function legacyBelongsToScope(save: VNSaveData, scopeId: string): boolean {
  if (save.sceneId === scopeId) return true;
  if (scopeId === VN_KISARAGI_SAVE_SCOPE) return isKisaragiSceneId(save.sceneId);
  return false;
}

export async function saveVnSlot(
  scopeId: string,
  slot: VNSaveSlotId,
  data: {
    sceneId: string;
    lineId: string;
    missionsActive?: string[];
    missionsCompleted?: string[];
    hotspotsChecked?: string[];
  },
): Promise<VNSaveData> {
  const user = await ensureVnAuthUser();
  const payload: VNSaveData = {
    sceneId: data.sceneId,
    lineId: data.lineId,
    savedAt: Date.now(),
    missionsActive: data.missionsActive ?? [],
    missionsCompleted: data.missionsCompleted ?? [],
    hotspotsChecked: data.hotspotsChecked ?? [],
  };
  await set(ref(db, slotPath(user.uid, scopeId, slot)), payload);
  return payload;
}

export async function loadVnSlot(
  scopeId: string,
  slot: VNSaveSlotId,
): Promise<VNSaveData | null> {
  const user = await ensureVnAuthUser();
  const snap = await get(ref(db, slotPath(user.uid, scopeId, slot)));
  if (snap.exists()) {
    const parsed = parseSave(snap.val() as Partial<VNSaveData>);
    if (parsed) return parsed;
  }
  const legacy = await get(ref(db, `vnSaves/${user.uid}/${slot}`));
  if (!legacy.exists()) return null;
  const parsed = parseSave(legacy.val() as Partial<VNSaveData>);
  if (!parsed || !legacyBelongsToScope(parsed, scopeId)) return null;
  return parsed;
}

export async function listVnSlots(
  scopeId: string,
): Promise<Record<VNSaveSlotId, VNSaveData | null>> {
  const user = await ensureVnAuthUser();
  const snap = await get(ref(db, scenarioSlotsPath(user.uid, scopeId)));
  const raw = (snap.exists() ? snap.val() : {}) as Record<string, Partial<VNSaveData>>;
  const legacySnap = await get(ref(db, `vnSaves/${user.uid}`));
  const legacyRaw = (legacySnap.exists() ? legacySnap.val() : {}) as Record<
    string,
    Partial<VNSaveData>
  >;
  const out = {} as Record<VNSaveSlotId, VNSaveData | null>;
  for (const id of VN_SAVE_SLOTS) {
    const parsed = parseSave(raw[id]);
    if (parsed) {
      out[id] = {
        ...parsed,
        savedAt: typeof raw[id]?.savedAt === 'number' ? raw[id].savedAt! : parsed.savedAt,
      };
      continue;
    }
    const old = parseSave(legacyRaw[id]);
    out[id] =
      old && legacyBelongsToScope(old, scopeId)
        ? {
            ...old,
            savedAt:
              typeof legacyRaw[id]?.savedAt === 'number' ? legacyRaw[id].savedAt! : old.savedAt,
          }
        : null;
  }
  return out;
}
