import { signInAnonymously, type User } from 'firebase/auth';
import { get, ref, set } from 'firebase/database';
import { auth, db } from '@/lib/firebase/client';

/** 프로젝트는 Firestore가 아니라 RTDB를 사용 중 — 동일 Firebase에 세이브 저장 */
export const VN_SAVE_SLOTS = ['save_1', 'save_2', 'save_3'] as const;
export type VNSaveSlotId = (typeof VN_SAVE_SLOTS)[number];

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

function slotPath(uid: string, slot: VNSaveSlotId) {
  return `vnSaves/${uid}/${slot}`;
}

export async function saveVnSlot(
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
  await set(ref(db, slotPath(user.uid, slot)), payload);
  return payload;
}

export async function loadVnSlot(slot: VNSaveSlotId): Promise<VNSaveData | null> {
  const user = await ensureVnAuthUser();
  const snap = await get(ref(db, slotPath(user.uid, slot)));
  if (!snap.exists()) return null;
  return parseSave(snap.val() as Partial<VNSaveData>);
}

export async function listVnSlots(): Promise<Record<VNSaveSlotId, VNSaveData | null>> {
  const user = await ensureVnAuthUser();
  const snap = await get(ref(db, `vnSaves/${user.uid}`));
  const raw = (snap.exists() ? snap.val() : {}) as Record<string, Partial<VNSaveData>>;
  const out = {} as Record<VNSaveSlotId, VNSaveData | null>;
  for (const id of VN_SAVE_SLOTS) {
    const parsed = parseSave(raw[id]);
    out[id] = parsed
      ? { ...parsed, savedAt: typeof raw[id]?.savedAt === 'number' ? raw[id].savedAt! : 0 }
      : null;
  }
  return out;
}
