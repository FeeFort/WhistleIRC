import { ref, watch } from "vue";

const STORAGE_KEY = "feeirc-notification-settings";
const soundModules = import.meta.glob("../sounds/*.mp3", { eager: true, query: "?url", import: "default" });

const SOUND_ORDER = [
  "ding.mp3",
  "bell.mp3",
  "knock.mp3",
  "shine.mp3",
  "i like this one.mp3",
  "cs go.mp3",
  "gah dayum.mp3",
  "bong.mp3",
  "run away.mp3",
  "bell-2.mp3",
  "shock.mp3",
  "saint.mp3",
  "idk bro wtf is this.mp3",
];

function soundUrl(filename) {
  return soundModules[`../sounds/${filename}`] || "";
}

export const NOTIFICATION_SOUNDS = SOUND_ORDER.map((filename) => ({
  label: filename.replace(/\.mp3$/i, ""),
  value: filename,
  url: soundUrl(filename),
})).filter((item) => item.url);

export const NOTIFICATION_TRIGGER_OPTIONS = Object.freeze([
  { label: "Always", value: "always" },
  { label: "Highlight words only", value: "highlight" },
]);

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  soundEnabled: false,
  toastEnabled: false,
  ignoreBanchoBot: true,
  sound: "ding.mp3",
  soundTrigger: "always",
  toastTrigger: "always",
});

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const validSound = NOTIFICATION_SOUNDS.some((item) => item.value === stored.sound) ? stored.sound : DEFAULT_NOTIFICATION_SETTINGS.sound;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...stored, sound: validSound };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

const storedSettings = loadSettings();
const soundEnabled = ref(storedSettings.soundEnabled);
const toastEnabled = ref(storedSettings.toastEnabled);
const ignoreBanchoBot = ref(storedSettings.ignoreBanchoBot);
const sound = ref(storedSettings.sound);
const soundTrigger = ref(storedSettings.soundTrigger);
const toastTrigger = ref(storedSettings.toastTrigger);

const settings = { soundEnabled, toastEnabled, ignoreBanchoBot, sound, soundTrigger, toastTrigger };

watch(
  () => Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value.value])),
  (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)),
  { deep: true },
);

export function getNotificationSoundUrl(filename) {
  return NOTIFICATION_SOUNDS.find((item) => item.value === filename)?.url || NOTIFICATION_SOUNDS[0]?.url || "";
}

export function useNotifications() {
  return settings;
}
