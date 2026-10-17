import { useSyncExternalStore } from "react";
import { THEME_COOKIE, type ThemeChoice } from "./script";

// One store for every theme switch on the page (sidebar and phone drawer). The truth is the <html>
// data-theme-choice attribute, which the head script sets before hydration.
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  const v = document.documentElement.getAttribute("data-theme-choice");
  return v === "light" || v === "dark" ? v : "system";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saves the choice for a year and applies it at once, without a reload. */
export function setThemeChoice(choice: ThemeChoice): void {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax${secure}`;
  const el = document.documentElement;
  // Transitions off for the switch itself, so every control does not animate to the new colors.
  el.classList.add("theme-switching");
  el.classList.remove("dark", "light");
  if (choice !== "system") el.classList.add(choice);
  el.setAttribute("data-theme-choice", choice);
  for (const l of listeners) l();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("theme-switching")));
}

/** The current choice; null on the server and during hydration (the server cannot know it). */
export function useThemeChoice(): ThemeChoice | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
