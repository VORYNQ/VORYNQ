// Light/dark theme settings shared by the root layout (server) and ThemeToggle (client).

export type Theme = "light" | "dark";

export const THEME_KEY = "vorynq-theme";
/** Browser-bar colour per theme (matches --color-ink). */
export const THEME_COLOR: Record<Theme, string> = { light: "#fbf6f2", dark: "#03000a" };

/** Runs in <head> before first paint so a saved dark choice never flashes light. Light is the default. */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark"){document.documentElement.dataset.theme="dark";var m=document.querySelector('meta[name="theme-color"]');if(m)m.content="${THEME_COLOR.dark}"}}catch(e){}`;
