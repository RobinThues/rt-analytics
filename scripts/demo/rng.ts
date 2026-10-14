// Seeded pseudo-random numbers (mulberry32), so demo data is the same on every run with the same seed.
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T extends { weight: number }>(items: readonly T[]): T;
  hex(chars: number): string;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    weighted: (items) => {
      let r = next() * items.reduce((sum, i) => sum + i.weight, 0);
      for (const item of items) {
        r -= item.weight;
        if (r < 0) return item;
      }
      return items[items.length - 1]!;
    },
    hex: (chars) => {
      let s = "";
      while (s.length < chars) s += Math.floor(next() * 16).toString(16);
      return s;
    },
  };
}

export function uuid(rng: Rng): string {
  const h = rng.hex(32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
