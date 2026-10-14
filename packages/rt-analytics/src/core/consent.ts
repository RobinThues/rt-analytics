import type { ConsentState } from "./types.js";

const KEY = "rta_consent";

export class ConsentManager {
  private listeners = new Set<(state: ConsentState) => void>();

  constructor(private storage: Storage | null) {}

  get(): ConsentState {
    const raw = this.storage?.getItem(KEY);
    return raw === "accepted" || raw === "declined" ? raw : "pending";
  }

  accept(): void {
    this.set("accepted");
  }

  decline(): void {
    this.set("declined");
  }

  onChange(fn: (state: ConsentState) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private set(state: ConsentState): void {
    this.storage?.setItem(KEY, state);
    for (const fn of this.listeners) fn(state);
  }
}
