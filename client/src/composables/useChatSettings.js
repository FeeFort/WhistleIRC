import { ref, watch } from "vue";
import { normalizeHighlightStyles, normalizeHighlightWords } from "./useMessageHighlighting";

export const DEFAULT_CHAT_SETTINGS = {
  highlightReferee: true,
  highlightBanchoBot: true,
  banchoBotColor: "#f2b84b",
  redTeamColor: "#ff6d78",
  blueTeamColor: "#63b3ff",
  unassignedColorMode: "random",
  unassignedColor: "#a970ff",
  timestampMode: "minutes",
  highlightWords: [],
  highlightStyles: ["bold"],
  highlightColorMode: "default",
  highlightColor: "#ffffff",
};

const STORAGE_KEY = "feeirc-chat-settings";

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...DEFAULT_CHAT_SETTINGS,
      ...stored,
      highlightWords: normalizeHighlightWords(stored.highlightWords ?? DEFAULT_CHAT_SETTINGS.highlightWords),
      highlightStyles: normalizeHighlightStyles(stored.highlightStyles ?? DEFAULT_CHAT_SETTINGS.highlightStyles),
    };
  } catch {
    return {
      ...DEFAULT_CHAT_SETTINGS,
      highlightWords: normalizeHighlightWords(DEFAULT_CHAT_SETTINGS.highlightWords),
      highlightStyles: normalizeHighlightStyles(DEFAULT_CHAT_SETTINGS.highlightStyles),
    };
  }
}

const storedSettings = loadSettings();
const highlightReferee = ref(storedSettings.highlightReferee);
const highlightBanchoBot = ref(storedSettings.highlightBanchoBot);
const banchoBotColor = ref(storedSettings.banchoBotColor);
const redTeamColor = ref(storedSettings.redTeamColor);
const blueTeamColor = ref(storedSettings.blueTeamColor);
const unassignedColorMode = ref(storedSettings.unassignedColorMode);
const unassignedColor = ref(storedSettings.unassignedColor);
const timestampMode = ref(storedSettings.timestampMode);
const highlightWords = ref(storedSettings.highlightWords);
const highlightStyles = ref(storedSettings.highlightStyles);
const highlightColorMode = ref(storedSettings.highlightColorMode);
const highlightColor = ref(storedSettings.highlightColor);

const settings = {
  highlightReferee,
  highlightBanchoBot,
  banchoBotColor,
  redTeamColor,
  blueTeamColor,
  unassignedColorMode,
  unassignedColor,
  timestampMode,
  highlightWords,
  highlightStyles,
  highlightColorMode,
  highlightColor,
};

watch(
  () => Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value.value])),
  (value) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true },
);

export function useChatSettings() {
  return settings;
}
