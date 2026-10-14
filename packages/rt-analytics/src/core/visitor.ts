import type { ConsentState } from "./types.js";

const KEY = "rta_vid";

export class VisitorManager {
  constructor(private storage: Storage | null) {}

  getId(consent: ConsentState): string | null {
    if (consent !== "accepted" || !this.storage) return null;
    let id = this.storage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      this.storage.setItem(KEY, id);
    }
    return id;
  }

  clear(): void {
    this.storage?.removeItem(KEY);
  }
}
