import { computed, ref, watch } from "vue";

export const LOBBY_TEMPLATE_VARIABLES = [
  { key: "beatmapWinner", label: "Beatmap winner" },
  { key: "beatmap", label: "Beatmap link" },
  { key: "beatmapTeamRedScore", label: "Beatmap red team score" },
  { key: "beatmapTeamBlueScore", label: "Beatmap blue team score" },
  { key: "scoreDifference", label: "Score difference" },
  { key: "teamRedName", label: "Red team name" },
  { key: "teamBlueName", label: "Blue team name" },
  { key: "matchTeamRedScore", label: "Match red team score" },
  { key: "matchTeamBlueScore", label: "Match blue team score" },
  { key: "matchStatus", label: "Match status" },
  { key: "bestOf", label: "Best of" },
];

const TEMPLATE_VARIABLE_RENAMES = Object.freeze({
  teamOneName: "teamRedName",
  teamTwoName: "teamBlueName",
  beatmapTeamOneScore: "beatmapTeamRedScore",
  beatmapTeamTwoScore: "beatmapTeamBlueScore",
  matchTeamOneScore: "matchTeamRedScore",
  matchTeamTwoScore: "matchTeamBlueScore",
});

function migrateTemplateContent(content) {
  return String(content || "").replace(
    /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
    (match, key) =>
      TEMPLATE_VARIABLE_RENAMES[key]
        ? `{{${TEMPLATE_VARIABLE_RENAMES[key]}}}`
        : match,
  );
}

const DEFAULT_MESSAGE_CONTENT_MIGRATIONS = Object.freeze({
  "full-result-beatmap": {
    from: "{{beatmapWinner}}: {{beatmap}} ({{beatmapTeamRedScore}} - {{beatmapTeamBlueScore}})",
    to: "Beatmap: {{beatmap}} // Beatmap Winner: {{beatmapWinner}}",
  },
  "full-result-difference": {
    from: "Score difference: {{scoreDifference}}",
    to: "{{teamRedName}} | {{beatmapTeamRedScore}} - {{beatmapTeamBlueScore}} | {{teamBlueName}} // Score difference: {{scoreDifference}}",
  },
  "full-result-match": {
    from: "{{teamRedName}} {{matchTeamRedScore}} - {{matchTeamBlueScore}} {{teamBlueName}}",
    to: "{{teamRedName}} | {{matchTeamRedScore}} - {{matchTeamBlueScore}} | {{teamBlueName}} // Best of {{bestOf}} - {{matchStatus}}",
  },
  "match-only-score": {
    from: "{{teamRedName}} {{matchTeamRedScore}} - {{matchTeamBlueScore}} {{teamBlueName}}",
    to: "{{teamRedName}} | {{matchTeamRedScore}} - {{matchTeamBlueScore}} | {{teamBlueName}} // Best of {{bestOf}} - {{matchStatus}}",
  },
});

function migrateMessageContent(message) {
  const content = migrateTemplateContent(message.content);
  const migration = DEFAULT_MESSAGE_CONTENT_MIGRATIONS[message.id];
  return migration?.from === content ? migration.to : content;
}

export const DEFAULT_LOBBY_PRESETS = [
  {
    id: "full-result",
    label: "Full match result",
    isDefault: true,
    messages: [
      {
        id: "full-result-beatmap",
        label: "Beatmap result",
        content: "Beatmap: {{beatmap}} // Beatmap Winner: {{beatmapWinner}}",
        enabled: true,
      },
      {
        id: "full-result-difference",
        label: "Score difference",
        content:
          "{{teamRedName}} | {{beatmapTeamRedScore}} - {{beatmapTeamBlueScore}} | {{teamBlueName}} // Score difference: {{scoreDifference}}",
        enabled: true,
      },
      {
        id: "full-result-match",
        label: "Match score",
        content:
          "{{teamRedName}} | {{matchTeamRedScore}} - {{matchTeamBlueScore}} | {{teamBlueName}} // Best of {{bestOf}} - {{matchStatus}}",
        enabled: true,
      },
    ],
  },
  {
    id: "match-only",
    label: "Match score only",
    isDefault: true,
    messages: [
      {
        id: "match-only-score",
        label: "Match score",
        content:
          "{{teamRedName}} | {{matchTeamRedScore}} - {{matchTeamBlueScore}} | {{teamBlueName}} // Best of {{bestOf}} - {{matchStatus}}",
        enabled: true,
      },
    ],
  },
];

const STORAGE_KEY = "feeirc-lobby-message-presets";

function uid(prefix = "lobby") {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cloneDefaults() {
  return DEFAULT_LOBBY_PRESETS.map((preset) => ({
    ...preset,
    messages: preset.messages.map((message) => ({ ...message })),
  }));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const presets = Array.isArray(saved?.presets) ? saved.presets : null;
    const usablePresets = (presets?.length ? presets : cloneDefaults()).map(
      (preset) => ({
        ...preset,
        messages: preset.messages.map((message) => ({
          ...message,
          content: migrateMessageContent(message),
        })),
      }),
    );
    return {
      presets: usablePresets,
      activePresetId: saved?.activePresetId || usablePresets[0]?.id || null,
    };
  } catch {
    const presets = cloneDefaults();
    return { presets, activePresetId: presets[0].id };
  }
}

const savedState = loadState();
const presets = ref(savedState.presets);
const activePresetId = ref(savedState.activePresetId);

const activePreset = computed(
  () =>
    presets.value.find((preset) => preset.id === activePresetId.value) ||
    presets.value[0] ||
    null,
);

watch(
  [presets, activePresetId],
  () => {
    if (!activePreset.value && presets.value.length) {
      activePresetId.value = presets.value[0].id;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        presets: presets.value,
        activePresetId: activePreset.value?.id || null,
      }),
    );
  },
  { deep: true },
);

function addPreset(data = {}) {
  const preset = {
    id: uid("preset"),
    label: "New result preset",
    isDefault: false,
    messages: [],
    ...data,
  };
  presets.value.push(preset);
  activePresetId.value = preset.id;
  return preset;
}

function updatePreset(id, patch) {
  const preset = presets.value.find((item) => item.id === id);
  if (preset) Object.assign(preset, patch);
}

function removePreset(id) {
  const index = presets.value.findIndex((preset) => preset.id === id);
  if (index === -1) return;
  presets.value.splice(index, 1);
  if (activePresetId.value === id) {
    activePresetId.value = presets.value[index]?.id || presets.value[0]?.id;
  }
}

function setActivePreset(id) {
  if (presets.value.some((preset) => preset.id === id)) {
    activePresetId.value = id;
  }
}

function addMessage(presetId, data = {}) {
  const preset = presets.value.find((item) => item.id === presetId);
  if (!preset) return null;
  const message = {
    id: uid("message"),
    label: "New message",
    content:
      "{{teamRedName}} | {{matchTeamRedScore}} - {{matchTeamBlueScore}} | {{teamBlueName}} // Best of {{bestOf}} - {{matchStatus}}",
    enabled: true,
    ...data,
  };
  preset.messages.push(message);
  return message;
}

function updateMessage(presetId, messageId, patch) {
  const preset = presets.value.find((item) => item.id === presetId);
  const message = preset?.messages.find((item) => item.id === messageId);
  if (message) Object.assign(message, patch);
}

function removeMessage(presetId, messageId) {
  const preset = presets.value.find((item) => item.id === presetId);
  if (!preset) return;
  const index = preset.messages.findIndex((item) => item.id === messageId);
  if (index !== -1) preset.messages.splice(index, 1);
}

function moveMessage(presetId, messageId, direction) {
  const preset = presets.value.find((item) => item.id === presetId);
  if (!preset) return;
  const index = preset.messages.findIndex((item) => item.id === messageId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= preset.messages.length) return;
  const [message] = preset.messages.splice(index, 1);
  preset.messages.splice(nextIndex, 0, message);
}

function replaceState(nextPresets, nextActivePresetId) {
  presets.value = nextPresets.map((preset) => ({
    ...preset,
    messages: preset.messages.map((message) => ({ ...message })),
  }));
  activePresetId.value = nextActivePresetId;
}

export function formatLobbyTemplate(content, values) {
  return String(content || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) =>
    String(values[key] ?? "—"),
  );
}

export function useLobbyMessages() {
  return {
    presets,
    activePresetId,
    activePreset,
    addPreset,
    updatePreset,
    removePreset,
    setActivePreset,
    addMessage,
    updateMessage,
    removeMessage,
    moveMessage,
    replaceState,
  };
}
