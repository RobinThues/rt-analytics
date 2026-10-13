/**
 * Storage that never throws. Blocked site data, sandboxed iframes and full quotas would otherwise
 * break tracking. A write that fails is kept in memory for this page, so sessions still work.
 */
export function safeStorage(get: () => Storage | null | undefined): Storage | null {
  let found: Storage | null | undefined;
  try {
    found = get();
  } catch {
    return null;
  }
  if (!found) return null;
  const storage = found;
  const fallback = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      if (fallback.has(key)) return fallback.get(key) ?? null;
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        storage.setItem(key, value);
        fallback.delete(key);
      } catch {
        fallback.set(key, String(value));
      }
    },
    removeItem(key: string): void {
      fallback.delete(key);
      try {
        storage.removeItem(key);
      } catch {
        // blocked; nothing to remove then
      }
    },
    clear(): void {
      fallback.clear();
      try {
        storage.clear();
      } catch {
        // blocked
      }
    },
    key(index: number): string | null {
      try {
        return storage.key(index);
      } catch {
        return null;
      }
    },
    get length(): number {
      try {
        return storage.length;
      } catch {
        return 0;
      }
    },
  } as Storage;
}
