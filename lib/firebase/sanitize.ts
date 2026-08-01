/** Firebase RTDB set() rejects undefined anywhere in the tree */
export function stripUndefinedDeep<T>(value: T, seen?: WeakSet<object>, depth = 0): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== 'object') return value;
  /* Date·Blob 등은 그대로 — entries 순회 불필요 */
  if (value instanceof Date) return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) return value;
  /* 과도한 깊이·순환은 끊음 — 그대로 넘기면 Firebase 직렬화가 call stack 초과 */
  if (depth > 40) return null as T;
  const cycle = seen ?? new WeakSet<object>();
  if (cycle.has(value as object)) return null as T;
  cycle.add(value as object);
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item, cycle, depth + 1)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === undefined) continue;
    const next = stripUndefinedDeep(val, cycle, depth + 1);
    if (next !== undefined) out[key] = next;
  }
  return out as T;
}
