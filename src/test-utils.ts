export function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

/** Every access throws, like Safari with blocked site data. */
export function throwingStorage(): Storage {
  const fail = (): never => {
    throw new DOMException("blocked", "SecurityError");
  };
  return {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
    key: fail,
    get length() {
      return fail();
    },
  } as unknown as Storage;
}

/** Reads work, writes throw, like a full quota. */
export function quotaFullStorage(): Storage {
  const base = fakeStorage();
  return {
    ...base,
    getItem: base.getItem,
    removeItem: base.removeItem,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  } as Storage;
}
