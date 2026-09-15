import { ref, watch } from "vue";

const STORAGE_KEY = "whistleirc-mappool-state";
const MAPPOOLS_KEY = "whistleirc-mappools";
const DEFAULT_WIN_CONDITION = `const room = await parseRoom();
system.sendMessage(\`Scores: \${room.teamRed.score} - \${room.teamBlue.score}\`);
return calculateWinner({ red: room.teamRed.score, blue: room.teamBlue.score }, { onTie: "manual" });`;
const WIN_CONDITION_TEMPLATES = Object.freeze([
  { label: "Score (V1/V2)", value: "score" },
  { label: "FreeMod (Score V1/V2)", value: "freemod" },
  { label: "Accuracy", value: "accuracy" },
  { label: "Combo", value: "combo" },
  { label: "Custom", value: "custom" },
]);

function normalizeMultipliers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([mods, multiplier]) => [String(mods).trim().toUpperCase().split(/[+\s]+/).filter(Boolean).sort().join("+"), Number(multiplier)])
      .filter(([mods, multiplier]) => mods && Number.isFinite(multiplier) && multiplier > 0),
  );
}

function winConditionSource(template, reverse = false, multipliers = {}) {
  if (template === "score") return "";
  if (template === "freemod") {
    const multiplierTable = JSON.stringify(normalizeMultipliers(multipliers));
    return `const room = await parseRoom();
const multipliers = ${multiplierTable};
function getMultiplier(mods) {
  const playerMods = (mods || []).map((mod) => String(mod).toUpperCase());
  const entries = Object.entries(multipliers).sort((a, b) => b[0].split("+").length - a[0].split("+").length);
  for (const [combination, multiplier] of entries) {
    if (combination.split("+").every((mod) => playerMods.includes(mod))) return Number(multiplier) || 1;
  }
  return 1;
}
function adjustedTeamScore(team) {
  let total = 0;
  for (const player of team.players) {
    const oldScore = Number(player.score) || 0;
    const multiplier = getMultiplier(player.mods);
    const score = oldScore * multiplier;
    total += score;
    system.sendMessage(\`${"${player.username}"}: \${oldScore} × \${multiplier} = \${score} (Δ \${score - oldScore})\`);
  }
  return total;
}
const teamRedScoreSum = adjustedTeamScore(room.teamRed);
const teamBlueScoreSum = adjustedTeamScore(room.teamBlue);
return calculateWinner({ red: teamRedScoreSum, blue: teamBlueScoreSum }, { reverse: ${reverse ? "true" : "false"}, onTie: "manual" });`;
  }
  const metric = template === "accuracy" ? "accuracy" : "combo";
  const unit = template === "accuracy" ? "%" : "";
  const redValue = `math.average(room.teamRed.${metric})`;
  const blueValue = `math.average(room.teamBlue.${metric})`;
  return `const room = await parseRoom();
const red${metric[0].toUpperCase() + metric.slice(1)} = ${redValue};
const blue${metric[0].toUpperCase() + metric.slice(1)} = ${blueValue};
system.sendMessage(\`Team Red ${metric[0].toUpperCase() + metric.slice(1)} | \${red${metric[0].toUpperCase() + metric.slice(1)}}${unit} - \${blue${metric[0].toUpperCase() + metric.slice(1)}}${unit} | Team Blue ${metric[0].toUpperCase() + metric.slice(1)}\`);
return calculateWinner({ red: red${metric[0].toUpperCase() + metric.slice(1)}, blue: blue${metric[0].toUpperCase() + metric.slice(1)} }, { reverse: ${reverse ? "true" : "false"}, onTie: "manual" });`;
}

function readStoredState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      qualificationModeByLobbyId: saved?.qualificationModeByLobbyId && typeof saved.qualificationModeByLobbyId === "object" ? saved.qualificationModeByLobbyId : {},
      mapStatesByLobbyId: saved?.mapStatesByLobbyId && typeof saved.mapStatesByLobbyId === "object" ? saved.mapStatesByLobbyId : {},
      activePoolByLobbyId: saved?.activePoolByLobbyId && typeof saved.activePoolByLobbyId === "object" ? saved.activePoolByLobbyId : {},
    };
  } catch {
    return { qualificationModeByLobbyId: {}, mapStatesByLobbyId: {}, activePoolByLobbyId: {} };
  }
}

const storedState = readStoredState();
function readMappools() {
  try {
    const value = JSON.parse(localStorage.getItem(MAPPOOLS_KEY) || "[]");
    return Array.isArray(value) ? value.map(normalizeConfig) : [];
  } catch { return []; }
}
const mappools = ref(readMappools());
const qualificationModeByLobbyId = ref(storedState.qualificationModeByLobbyId);
const mapStatesByLobbyId = ref(storedState.mapStatesByLobbyId);
const activePoolByLobbyId = ref(storedState.activePoolByLobbyId);

watch(
  [qualificationModeByLobbyId, mapStatesByLobbyId, activePoolByLobbyId],
  () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        qualificationModeByLobbyId: qualificationModeByLobbyId.value,
        mapStatesByLobbyId: mapStatesByLobbyId.value,
        activePoolByLobbyId: activePoolByLobbyId.value,
      }),
    );
  },
  { deep: true },
);
watch(mappools, (value) => localStorage.setItem(MAPPOOLS_KEY, JSON.stringify(value.map(serializeMappool))), { deep: true });
// Migrate mappools saved by the brief-lived slots/categories format on startup.
localStorage.setItem(MAPPOOLS_KEY, JSON.stringify(mappools.value.map(serializeMappool)));

export { DEFAULT_WIN_CONDITION, WIN_CONDITION_TEMPLATES, winConditionSource, serializeMappool };

function categoryFromSlotKey(value) {
  const slotKey = String(value || "").trim();
  const match = slotKey.match(/^(.*?)(?:\d+)$/);
  return (match?.[1] || slotKey || "Untitled category").trim() || "Untitled category";
}

function normalizeWinCondition(value) {
  const condition = typeof value === "string" ? { source: value } : value;
  if (!condition?.source) return undefined;
  return {
    type: "script",
    version: 1,
    source: String(condition.source),
    template: condition.template || "custom",
    reverse: condition.reverse === true,
    ...(condition.note ? { note: String(condition.note) } : {}),
  };
}

function normalizeConfig(value) {
  const source = value || {};
  const sourceSlots = Array.isArray(source.slots) ? source.slots : [];
  const sourceCategories = Array.isArray(source.categories) ? source.categories : [];
  const freeModMultipliers = normalizeMultipliers(source.freeModMultipliers);
  const slots = sourceSlots.map((slot) => ({
    slotId: String(slot.slotId || crypto.randomUUID()), beatmapId: Number(slot.beatmapId) || 0,
    category: String(slot.category || categoryFromSlotKey(slot.slotId)),
    mods: Array.isArray(slot.mods) ? slot.mods.map(String).filter(Boolean) : [],
    preview: normalizePreview(slot.preview),
    commands: normalizeCommands(slot.commands),
    freeMod: slot.freeMod === true || slot.winCondition?.template === "freemod",
    winCondition: slot.freeMod === true && !slot.winCondition
      ? { type: "script", version: 1, template: "freemod", reverse: false, source: winConditionSource("freemod", false, freeModMultipliers) }
      : normalizeWinCondition(slot.winCondition),
  }));
  const categories = [...new Set([...sourceCategories.map(String).filter(Boolean), ...slots.map((slot) => slot.category)])];
  return {
    id: String(source.id || crypto.randomUUID()),
    name: String(source.name || "Untitled mappool"),
    stage: String(source.stage || "Unspecified stage"),
    ruleset: ["osu", "taiko", "fruits", "mania"].includes(source.ruleset) ? source.ruleset : "osu",
    globalCommands: normalizeCommands(source.globalCommands),
    freeModMultipliers,
    categories,
    slots,
  };
}

function serializeMappool(value) {
  const poolValue = normalizeConfig(value);
  return {
    id: poolValue.id,
    name: poolValue.name,
    stage: poolValue.stage,
    ruleset: poolValue.ruleset,
    globalCommands: [...poolValue.globalCommands],
    freeModMultipliers: { ...poolValue.freeModMultipliers },
    categories: [...poolValue.categories],
    slots: poolValue.slots.map((slot) => ({
      slotId: slot.slotId,
      beatmapId: slot.beatmapId,
      category: slot.category,
      mods: [...slot.mods],
      ...(slot.preview ? { preview: { ...slot.preview } } : {}),
      commands: [...slot.commands],
      ...(slot.freeMod ? { freeMod: true } : {}),
      ...(slot.winCondition ? { winCondition: { ...slot.winCondition } } : {}),
    })),
  };
}

function normalizePreview(value) {
  if (!value || typeof value !== "object") return null;
  const id = Number(value.beatmapId);
  const artist = String(value.artist || "").trim();
  const title = String(value.title || "").trim();
  const diff = String(value.diff || "").trim();
  const author = String(value.author || "").trim();
  const beatmapsetId = Number(value.beatmapsetId);
  const starRating = Number(value.starRating);
  const totalSeconds = normalizeDuration(value.totalSeconds);
  if (!Number.isFinite(id) || (!artist && !title && !diff && !author)) return null;
  return { beatmapId: id, artist, title, diff, author, beatmapsetId: Number.isFinite(beatmapsetId) ? beatmapsetId : null, starRating: Number.isFinite(starRating) ? starRating : null, totalSeconds };
}

function addMappool(value) { const poolValue = normalizeConfig(value); mappools.value.push(poolValue); return poolValue; }
function updateMappool(id, value) { const index = mappools.value.findIndex((item) => item.id === id); if (index >= 0) mappools.value[index] = normalizeConfig({ ...mappools.value[index], ...value, id }); }
function deleteMappool(id) { mappools.value = mappools.value.filter((item) => item.id !== id); }

function normalizeCommands(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((command) => typeof command === "string")
    .map((command) => command.trim())
    .filter(Boolean);
}

function normalizeDuration(value) {
  if (typeof value === "string") {
    const text = value.trim();
    const clock = text.match(/^(\d+):([0-5]\d)$/);
    if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function lobbyKey(lobbyId) {
  return String(lobbyId || "");
}

function ensureLobbyMapState(lobbyId) {
  const key = lobbyKey(lobbyId);
  if (!key) return null;
  if (!mapStatesByLobbyId.value[key]) {
    mapStatesByLobbyId.value[key] = {};
  }
  return mapStatesByLobbyId.value[key];
}

function getMapState(lobbyId, slot) {
  const lobbyState = mapStatesByLobbyId.value[lobbyKey(lobbyId)];
  return lobbyState?.[slot] || {};
}

function setMapState(lobbyId, slot, patch) {
  const lobbyState = ensureLobbyMapState(lobbyId);
  if (!lobbyState || !slot) return;
  lobbyState[slot] = {
    ...getMapState(lobbyId, slot),
    ...patch,
  };
}

function clearLobbyMapState(lobbyId) {
  const key = lobbyKey(lobbyId);
  if (!key || !mapStatesByLobbyId.value[key]) return;
  delete mapStatesByLobbyId.value[key];
}

function clearAllMapStates() {
  mapStatesByLobbyId.value = {};
}

function getQualificationMode(lobbyId) {
  return qualificationModeByLobbyId.value[lobbyKey(lobbyId)] === true;
}

function hasQualificationMode(lobbyId) {
  return Object.prototype.hasOwnProperty.call(qualificationModeByLobbyId.value, lobbyKey(lobbyId));
}

function setQualificationMode(lobbyId, value) {
  const key = lobbyKey(lobbyId);
  if (!key) return;
  qualificationModeByLobbyId.value[key] = value === true;
}

function clearLobbyState(lobbyId) {
  const key = lobbyKey(lobbyId);
  if (!key) return;
  delete mapStatesByLobbyId.value[key];
  delete activePoolByLobbyId.value[key];
  delete qualificationModeByLobbyId.value[key];
}

function getActivePool(lobbyId) {
  const id = activePoolByLobbyId.value[lobbyKey(lobbyId)];
  return mappools.value.find((item) => item.id === id) || null;
}

function setActivePool(lobbyId, poolId) {
  const key = lobbyKey(lobbyId);
  if (!key) return;
  if (poolId) activePoolByLobbyId.value[key] = String(poolId);
  else delete activePoolByLobbyId.value[key];
}

export function useMappool() {
  return {
    getQualificationMode,
    hasQualificationMode,
    setQualificationMode,
    clearLobbyState,
    getMapState,
    setMapState,
    clearLobbyMapState,
    clearAllMapStates,
    mappools,
    addMappool,
    updateMappool,
    deleteMappool,
    WIN_CONDITION_TEMPLATES,
    winConditionSource,
    getActivePool,
    setActivePool,
  };
}
