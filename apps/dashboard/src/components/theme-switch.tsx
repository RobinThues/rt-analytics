"use client";
import type { ThemeChoice } from "@/theme/script";
import { setThemeChoice, useThemeChoice } from "@/theme/store";

// The selected look comes from <html data-theme-choice>, set by the head script, so it is right at first
// paint; aria-pressed follows once the store is readable after hydration. Literal classes for Tailwind.
const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; selected: string }> = [
  {
    value: "system",
    label: "System",
    selected: "in-data-[theme-choice=system]:bg-muted in-data-[theme-choice=system]:text-foreground",
  },
  {
    value: "light",
    label: "Light",
    selected: "in-data-[theme-choice=light]:bg-muted in-data-[theme-choice=light]:text-foreground",
  },
  {
    value: "dark",
    label: "Dark",
    selected: "in-data-[theme-choice=dark]:bg-muted in-data-[theme-choice=dark]:text-foreground",
  },
];

/** System / Light / Dark, saved in the rta-theme cookie (visual style spec, "Dark mode"). */
export function ThemeSwitch() {
  const choice = useThemeChoice();
  return (
    <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-0.5 rounded-md border p-0.5 text-xs">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={choice === null ? undefined : choice === o.value}
          onClick={() => setThemeChoice(o.value)}
          className={`h-6 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${o.selected}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
