import { ref, watch } from "vue";

export const DEFAULT_CHAT_SETTINGS = {
  highlightReferee: true,
  highlightBanchoBot: true,
  banchoBotColor: "#f2b84b",
  redTeamColor: "#ff6d78",
  blueTeamColor: "#63b3ff",
  unassignedColorMode: "random",
  unassignedColor: "#a970ff",
  timestampMode: "minutes",
};

const STORAGE_KEY = "feeirc-chat-settings";

function loadSettings() {
  try {
    return {
      ...DEFAULT_CHAT_SETTINGS,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
    };
  } catch {
    return { ...DEFAULT_CHAT_SETTINGS };
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

const settings = {
  highlightReferee,
  highlightBanchoBot,
  banchoBotColor,
  redTeamColor,
  blueTeamColor,
  unassignedColorMode,
  unassignedColor,
  timestampMode,
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
