import { nextTick, ref } from "vue";

export const DEFAULT_PRIMARY_COLOR = "#a970ff";
export const THEME_TRANSITION_DURATION = 220;
const THEME_TRANSITION_CLEANUP_BUFFER = 32;
const storedTheme = localStorage.getItem("feeirc-theme");
const isDark = ref(storedTheme !== "light");
const primaryColor = ref(localStorage.getItem("feeirc-primary") || DEFAULT_PRIMARY_COLOR);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized;
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const difference = max - min;
  let hue = 0;
  let saturation = 0;

  if (difference) {
    saturation = difference / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case red:
        hue = ((green - blue) / difference) % 6;
        break;
      case green:
        hue = (blue - red) / difference + 2;
        break;
      default:
        hue = (red - green) / difference + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return { hue, saturation: saturation * 100, lightness: lightness * 100 };
}

function hslToHex({ hue, saturation, lightness }) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${channels
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function applyTheme(nextIsDark = isDark.value) {
  const root = document.documentElement;
  const primary = hexToRgb(primaryColor.value);
  const hsl = rgbToHsl(primary);
  const set = (name, value) => root.style.setProperty(name, value);

  root.classList.toggle("app-dark", nextIsDark);
  root.classList.toggle("app-light", !nextIsDark);
  root.style.colorScheme = nextIsDark ? "dark" : "light";

  set("--app-primary", primaryColor.value);
  set("--app-primary-bright", hslToHex({ ...hsl, lightness: clamp(hsl.lightness + 12, 0, 96) }));
  set("--app-primary-dark", hslToHex({ ...hsl, lightness: clamp(hsl.lightness - 16, 8, 82) }));
  set("--app-primary-rgb", `${primary.r}, ${primary.g}, ${primary.b}`);
}

function toggleDark() {
  const nextIsDark = !isDark.value;
  localStorage.setItem("feeirc-theme", nextIsDark ? "dark" : "light");
  transitionTheme(nextIsDark);
}

function setPrimaryColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  primaryColor.value = color;
  localStorage.setItem("feeirc-primary", color);
  transitionTheme(isDark.value, false);
}

let transitionTimeout;
let transitionFrame;
let activeViewTransition;

function canUseViewTransition() {
  return typeof document.startViewTransition === "function";
}

function transitionTheme(nextIsDark, useViewTransition = true) {
  const root = document.documentElement;

  window.clearTimeout(transitionTimeout);
  window.cancelAnimationFrame(transitionFrame);

  if (activeViewTransition) {
    activeViewTransition.skipTransition();
    activeViewTransition = undefined;
  }

  if (useViewTransition && canUseViewTransition()) {
    const viewTransition = document.startViewTransition(async () => {
      applyTheme(nextIsDark);
      isDark.value = nextIsDark;
      await nextTick();
    });
    activeViewTransition = viewTransition;
    viewTransition.finished
      .finally(() => {
        if (activeViewTransition === viewTransition) {
          activeViewTransition = undefined;
        }
      })
      .catch(() => {});
    return;
  }

  root.classList.add("app-theme-transition");
  void root.offsetWidth;

  transitionFrame = window.requestAnimationFrame(() => {
    applyTheme(nextIsDark);
    isDark.value = nextIsDark;
    transitionTimeout = window.setTimeout(() => {
      root.classList.remove("app-theme-transition");
    }, THEME_TRANSITION_DURATION + THEME_TRANSITION_CLEANUP_BUFFER);
  });
}

applyTheme();

export function useDarkMode() {
  return { isDark, primaryColor, toggleDark, setPrimaryColor };
}
