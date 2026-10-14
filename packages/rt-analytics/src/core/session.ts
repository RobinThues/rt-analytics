import type { ConsentState } from "./types.js";

const TIMEOUT_MS = 30 * 60 * 1000;
const ID_KEY = "rta_sid";
const ACTIVITY_KEY = "rta_sla";

export interface SessionTouch {
  id: string;
  isNew: boolean;
}

export class SessionManager {
  private memId: string | null = null;
  private memLast = 0;

  constructor(
    private storage: Storage | null,
    private now: () => number = Date.now,
  ) {}

  touch(consent: ConsentState): SessionTouch {
    const t = this.now();
    const persisted = consent === "accepted" ? this.storage : null;
    let id = persisted ? persisted.getItem(ID_KEY) : this.memId;
    const last = persisted ? Number(persisted.getItem(ACTIVITY_KEY) ?? 0) : this.memLast;
    const isNew = !id || t - last > TIMEOUT_MS;
    if (isNew) id = crypto.randomUUID();
    if (persisted) {
      persisted.setItem(ID_KEY, id as string);
      persisted.setItem(ACTIVITY_KEY, String(t));
    } else {
      this.memId = id as string;
      this.memLast = t;
    }
    return { id: id as string, isNew };
  }

  reset(): void {
    this.memId = null;
    this.memLast = 0;
    this.storage?.removeItem(ID_KEY);
    this.storage?.removeItem(ACTIVITY_KEY);
  }
}
