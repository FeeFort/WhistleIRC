import { ref, watch } from "vue";
import { icons } from "@lucide/vue";

const CUSTOM_KEY = "feeirc-shortcuts-custom";
const START_DELAY_KEY = "feeirc-shortcuts-start-delay";
const TIMER_SECONDS_KEY = "feeirc-shortcuts-timer-seconds";
const WARNINGS_KEY = "feeirc-shortcuts-warnings";

// stable ids for the fixed/built-in commands - used as keys for the
// per-command warning toggle map
export const BUILTIN_IDS = {
  START: "start",
  ABORT: "abort",
  SETTINGS: "settings",
  TIMER: "timer",
  ABORT_TIMER: "abort-timer",
  LOCK: "lock",
  UNLOCK: "unlock",
  CLOSE: "close",
};

const DEFAULT_WARNINGS = {
  [BUILTIN_IDS.START]: true,
  [BUILTIN_IDS.ABORT]: true,
  [BUILTIN_IDS.SETTINGS]: false,
  [BUILTIN_IDS.TIMER]: false,
  [BUILTIN_IDS.ABORT_TIMER]: false,
  [BUILTIN_IDS.LOCK]: false,
  [BUILTIN_IDS.UNLOCK]: false,
  [BUILTIN_IDS.CLOSE]: false,
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `sc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const startDelaySeconds = ref(loadJSON(START_DELAY_KEY, 5));
const timerSeconds = ref(loadJSON(TIMER_SECONDS_KEY, 120));
const builtinWarnings = ref({
  ...DEFAULT_WARNINGS,
  ...loadJSON(WARNINGS_KEY, {}),
});
// each: { id, label, command, description, icon, color, warning }
const customShortcuts = ref(loadJSON(CUSTOM_KEY, []));

watch(startDelaySeconds, (v) =>
  localStorage.setItem(START_DELAY_KEY, JSON.stringify(v)),
);
watch(timerSeconds, (v) =>
  localStorage.setItem(TIMER_SECONDS_KEY, JSON.stringify(v)),
);
watch(
  builtinWarnings,
  (v) => localStorage.setItem(WARNINGS_KEY, JSON.stringify(v)),
  {
    deep: true,
  },
);
watch(
  customShortcuts,
  (v) => localStorage.setItem(CUSTOM_KEY, JSON.stringify(v)),
  {
    deep: true,
  },
);

function addCustomShortcut(data = {}) {
  const shortcut = {
    id: uid(),
    label: "",
    command: "",
    description: "",
    icon: "",
    color: "",
    warning: false,
    ...data,
  };
  customShortcuts.value.push(shortcut);
  return shortcut;
}

function updateCustomShortcut(id, patch) {
  const item = customShortcuts.value.find((s) => s.id === id);
  if (item) Object.assign(item, patch);
}

function removeCustomShortcut(id) {
  const i = customShortcuts.value.findIndex((s) => s.id === id);
  if (i !== -1) customShortcuts.value.splice(i, 1);
}

function reorderCustomShortcut(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const [item] = customShortcuts.value.splice(fromIndex, 1);
  customShortcuts.value.splice(toIndex, 0, item);
}

function setBuiltinWarning(id, value) {
  builtinWarnings.value[id] = value;
}

// "circle-check-big" -> "CircleCheckBig"
function toPascalCase(kebab) {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
}

function resolveIcon(name) {
  if (!name) return null;
  return icons[toPascalCase(name.trim())] || null;
}

export function normalizeShortcutColor(value) {
  const color = String(value ?? "").trim();
  if (!color) return "";
  return color.startsWith("#") ? color : `#${color}`;
}

export function useShortcuts() {
  return {
    startDelaySeconds,
    timerSeconds,
    builtinWarnings,
    customShortcuts,
    addCustomShortcut,
    updateCustomShortcut,
    removeCustomShortcut,
    reorderCustomShortcut,
    setBuiltinWarning,
    resolveIcon,
    normalizeShortcutColor,
  };
}
