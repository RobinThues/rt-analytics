export const THEME_COOKIE = "rta-theme";

export type ThemeChoice = "system" | "light" | "dark";

/**
 * Runs in <head> before first paint (visual style spec, "Dark mode"): reads the rta-theme cookie, adds
 * `dark` or `light` to <html> (nothing for system) and sets data-theme-choice, which the theme switch
 * styles its selected segment from. The server never reads the cookie, so pages stay static.
 * Hand-written source, not fn.toString(): bundling must not change what runs in the browser.
 */
export const themeScript = `(function () {
  try {
    var m = document.cookie.match(/(?:^|;\\s*)rta-theme=([^;]*)/);
    var v = m ? m[1] : "";
    var choice = v === "light" || v === "dark" ? v : "system";
    var el = document.documentElement;
    if (choice !== "system") el.classList.add(choice);
    el.setAttribute("data-theme-choice", choice);
  } catch (e) {}
})();`;
