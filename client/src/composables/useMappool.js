import { ref, watch } from "vue";

const STORAGE_KEYS = Object.freeze({ stable: "whistleirc-mappool-state", lazer: "whistleirc-lazer-mappool-state" });
const MAPPOOLS_KEYS = Object.freeze({ stable: "whistleirc-mappools", lazer: "whistleirc-lazer-mappools" });
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
const LAZER_WIN_CONDITION_TEMPLATES = Object.freeze([
  { label: "Score", value: "score" },
  { label: "FreeMod (Score)", value: "freemod" },
  { label: "Accuracy", value: "accuracy" },
  { label: "Combo", value: "combo" },
  { label: "Custom", value: "custom" },
]);
const LAZER_DEFAULT_WIN_CONDITION = `system.sendMessage(\`Scores: \${room.teamRed.score} - \${room.teamBlue.score}\`);
return calculateWinner({ red: room.teamRed.score, blue: room.teamBlue.score }, { onTie: "manual" });`;

const CATEGORY_DEFAULT_MODS = Object.freeze({ HD: "HD", HR: "HR", DT: "DT", FM: "Freemod", TB: "Freemod" });

export function defaultModsForCategory(category) {
  const normalized = String(category || "")
    .trim()
    .toUpperCase();
  return ["NF", CATEGORY_DEFAULT_MODS[normalized]].filter(Boolean);
}

export function defaultLazerModsForCategory(category) {
  const normalized = String(category || "")
    .trim()
    .toUpperCase();
  if (["HD", "HR", "DT"].includes(normalized)) {
    return { requiredMods: [normalized], allowedMods: [] };
  }
  if (["FM", "TB"].includes(normalized)) {
    return { requiredMods: [], allowedMods: ["EZ", "HR", "HD"] };
  }
  return { requiredMods: [], allowedMods: [] };
}

function normalizeMultipliers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([mods, multiplier]) => [
        String(mods)
          .trim()
          .toUpperCase()
          .split(/[+\s]+/)
          .filter(Boolean)
          .sort()
          .join("+"),
        Number(multiplier),
      ])
      .filter(([mods, multiplier]) => mods && Number.isFinite(multiplier) && multiplier > 0),
  );
}

function winConditionSource(template, reverse = false, multipliers = {}) {
  if (template === "score") {
    return `system.sendMessage(\`Scores: \${redScore} - \${blueScore}\`);
return calculateWinner({ red: redScore, blue: blueScore }, { reverse: ${reverse ? "true" : "false"}, onTie: "manual" });`;
  }
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

function lazerWinConditionSource(template, reverse = false, multipliers = {}) {
  if (template === "score") {
    return `system.sendMessage(\`Scores: \${room.teamRed.score} - \${room.teamBlue.score}\`);
return calculateWinner({ red: room.teamRed.score, blue: room.teamBlue.score }, { reverse: ${reverse ? "true" : "false"}, onTie: "manual" });`;
  }
  if (template === "freemod") {
    const multiplierTable = JSON.stringify(normalizeMultipliers(multipliers));
    return `const multipliers = ${multiplierTable};
function getMultiplier(mods) {
  const playerMods = (mods || []).map((mod) => String(mod).toUpperCase());
  const entries = Object.entries(multipliers).sort((a, b) => b[0].split("+").length - a[0].split("+").length);
  for (const [combination, multiplier] of entries) if (combination.split("+").every((mod) => playerMods.includes(mod))) return Number(multiplier) || 1;
  return 1;
}
function adjustedTeamScore(team) {
  let total = 0;
  for (const player of team.players) {
    const oldScore = Number(player.score) || 0;
    const multiplier = getMultiplier(player.mods);
    const score = oldScore * multiplier;
    total += score;
    system.sendMessage(\`${"${player.username}"}: \${oldScore} × \${multiplier} = \${score}\`);
  }
  return total;
}
return calculateWinner({ red: adjustedTeamScore(room.teamRed), blue: adjustedTeamScore(room.teamBlue) }, { reverse: ${reverse ? "true" : "false"}, onTie: "manual" });`;
  }
  const metric = template === "accuracy" ? "accuracy" : "combo";
  const label = metric[0].toUpperCase() + metric.slice(1);
  return `system.sendMessage(\`${label}: \${room.teamRed.${metric}} - \${room.teamBlue.${metric}}\`);
return calculateWinner({ red: room.teamRed.${metric}, blue: room.teamBlue.${metric} }, { reverse: ${reverse ? "true" : "false"}, onTie: "manual" });`;
}

function readStoredState(mode = "stable") {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS[mode] || STORAGE_KEYS.stable) || "null");
    return {
      qualificationModeByLobbyId: saved?.qualificationModeByLobbyId && typeof saved.qualificationModeByLobbyId === "object" ? saved.qualificationModeByLobbyId : {},
      mapStatesByLobbyId: saved?.mapStatesByLobbyId && typeof saved.mapStatesByLobbyId === "object" ? saved.mapStatesByLobbyId : {},
      activePoolByLobbyId: saved?.activePoolByLobbyId && typeof saved.activePoolByLobbyId === "object" ? saved.activePoolByLobbyId : {},
    };
  } catch {
    return { qualificationModeByLobbyId: {}, mapStatesByLobbyId: {}, activePoolByLobbyId: {} };
  }
}

const storedStates = { stable: readStoredState("stable"), lazer: readStoredState("lazer") };
function readMappools(mode = "stable") {
  try {
    const value = JSON.parse(localStorage.getItem(MAPPOOLS_KEYS[mode] || MAPPOOLS_KEYS.stable) || "[]");
    return Array.isArray(value) ? value.map(normalizeConfig) : [];
  } catch {
    return [];
  }
}
const stores = {
  stable: {
    mappools: ref(readMappools("stable")),
    qualificationModeByLobbyId: ref(storedStates.stable.qualificationModeByLobbyId),
    mapStatesByLobbyId: ref(storedStates.stable.mapStatesByLobbyId),
    activePoolByLobbyId: ref(storedStates.stable.activePoolByLobbyId),
  },
  lazer: {
    mappools: ref(readMappools("lazer")),
    qualificationModeByLobbyId: ref(storedStates.lazer.qualificationModeByLobbyId),
    mapStatesByLobbyId: ref(storedStates.lazer.mapStatesByLobbyId),
    activePoolByLobbyId: ref(storedStates.lazer.activePoolByLobbyId),
  },
};

Object.entries(stores).forEach(([mode, store]) => {
  const serializer = mode === "lazer" ? serializeLazerMappool : serializeMappool;
  watch(
    [store.qualificationModeByLobbyId, store.mapStatesByLobbyId, store.activePoolByLobbyId],
    () => {
      localStorage.setItem(
        STORAGE_KEYS[mode],
        JSON.stringify({
          qualificationModeByLobbyId: store.qualificationModeByLobbyId.value,
          mapStatesByLobbyId: store.mapStatesByLobbyId.value,
          activePoolByLobbyId: store.activePoolByLobbyId.value,
        }),
      );
    },
    { deep: true },
  );
  watch(store.mappools, (value) => localStorage.setItem(MAPPOOLS_KEYS[mode], JSON.stringify(value.map(serializer))), { deep: true });
  localStorage.setItem(MAPPOOLS_KEYS[mode], JSON.stringify(store.mappools.value.map(serializer)));
});

export {
  DEFAULT_WIN_CONDITION,
  WIN_CONDITION_TEMPLATES,
  LAZER_DEFAULT_WIN_CONDITION,
  LAZER_WIN_CONDITION_TEMPLATES,
  winConditionSource,
  lazerWinConditionSource,
  serializeMappool,
  serializeLazerMappool,
};

export function sortMappoolSlots(slots, categories = []) {
  const grouped = new Map();
  (Array.isArray(slots) ? slots : []).forEach((slot) => {
    const group = slot.category || "Other";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(slot);
  });

  const order = new Map((Array.isArray(categories) ? categories : []).map((category, index) => [category, index]));
  const groupOrder = (group) => (order.has(group) ? order.get(group) : Number.MAX_SAFE_INTEGER);

  return [...grouped.entries()].sort(([first], [second]) => groupOrder(first) - groupOrder(second)).flatMap(([, groupSlots]) => groupSlots);
}

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
    slotId: String(slot.slotId || crypto.randomUUID()),
    beatmapId: Number(slot.beatmapId) || 0,
    category: String(slot.category || categoryFromSlotKey(slot.slotId)),
    mods: (() => {
      const normalizedMods = Array.isArray(slot.mods) ? slot.mods.map(String).filter(Boolean) : [];
      return normalizedMods.length ? normalizedMods : defaultModsForCategory(slot.category || categoryFromSlotKey(slot.slotId));
    })(),
    requiredMods: Array.isArray(slot.requiredMods)
      ? slot.requiredMods
          .map((mod) => (typeof mod === "string" ? mod : mod?.acronym))
          .filter(Boolean)
          .map(String)
      : Array.isArray(slot.required_mods)
        ? slot.required_mods
            .map((mod) => (typeof mod === "string" ? mod : mod?.acronym))
            .filter(Boolean)
            .map(String)
        : [],
    allowedMods: Array.isArray(slot.allowedMods)
      ? slot.allowedMods
          .map((mod) => (typeof mod === "string" ? mod : mod?.acronym))
          .filter(Boolean)
          .map(String)
      : Array.isArray(slot.allowed_mods)
        ? slot.allowed_mods
            .map((mod) => (typeof mod === "string" ? mod : mod?.acronym))
            .filter(Boolean)
            .map(String)
        : [],
    freestyle: slot.freestyle === true,
    preview: normalizePreview(slot.preview),
    commands: normalizeCommands(slot.commands),
    freeMod: slot.freeMod === true || slot.winCondition?.template === "freemod",
    freemodResolved: slot.freemodResolved === true,
    winCondition:
      slot.freeMod === true && !slot.winCondition
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
      requiredMods: [...slot.requiredMods],
      allowedMods: [...slot.allowedMods],
      ...(slot.freestyle ? { freestyle: true } : {}),
      ...(slot.preview ? { preview: { ...slot.preview } } : {}),
      commands: [...slot.commands],
      ...(slot.freeMod ? { freeMod: true } : {}),
      ...(slot.freemodResolved ? { freemodResolved: true } : {}),
      ...(slot.winCondition ? { winCondition: { ...slot.winCondition } } : {}),
    })),
  };
}

function serializeLazerMappool(value) {
  const serialized = serializeMappool(value);
  delete serialized.globalCommands;
  serialized.slots = serialized.slots.map(({ commands, ...slot }) => slot);
  return serialized;
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

function addMappool(store, value) {
  const poolValue = normalizeConfig(value);
  store.mappools.value.push(poolValue);
  return poolValue;
}
function updateMappool(store, id, value) {
  const index = store.mappools.value.findIndex((item) => item.id === id);
  if (index >= 0) store.mappools.value[index] = normalizeConfig({ ...store.mappools.value[index], ...value, id });
}
function deleteMappool(store, id) {
  store.mappools.value = store.mappools.value.filter((item) => item.id !== id);
}

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

function ensureLobbyMapState(store, lobbyId) {
  const key = lobbyKey(lobbyId);
  if (!key) return null;
  if (!store.mapStatesByLobbyId.value[key]) {
    store.mapStatesByLobbyId.value[key] = {};
  }
  return store.mapStatesByLobbyId.value[key];
}

function getMapState(store, lobbyId, slot) {
  const lobbyState = store.mapStatesByLobbyId.value[lobbyKey(lobbyId)];
  return lobbyState?.[slot] || {};
}

function setMapState(store, lobbyId, slot, patch) {
  const lobbyState = ensureLobbyMapState(store, lobbyId);
  if (!lobbyState || !slot) return;
  lobbyState[slot] = {
    ...getMapState(store, lobbyId, slot),
    ...patch,
  };
}

function clearLobbyMapState(store, lobbyId) {
  const key = lobbyKey(lobbyId);
  if (!key || !store.mapStatesByLobbyId.value[key]) return;
  delete store.mapStatesByLobbyId.value[key];
}

function clearAllMapStates(store) {
  store.mapStatesByLobbyId.value = {};
}

function getQualificationMode(store, lobbyId) {
  return store.qualificationModeByLobbyId.value[lobbyKey(lobbyId)] === true;
}

function hasQualificationMode(store, lobbyId) {
  return Object.prototype.hasOwnProperty.call(store.qualificationModeByLobbyId.value, lobbyKey(lobbyId));
}

function setQualificationMode(store, lobbyId, value) {
  const key = lobbyKey(lobbyId);
  if (!key) return;
  store.qualificationModeByLobbyId.value[key] = value === true;
}

function clearLobbyState(store, lobbyId) {
  const key = lobbyKey(lobbyId);
  if (!key) return;
  delete store.mapStatesByLobbyId.value[key];
  delete store.activePoolByLobbyId.value[key];
  delete store.qualificationModeByLobbyId.value[key];
}

function getActivePool(store, lobbyId) {
  const id = store.activePoolByLobbyId.value[lobbyKey(lobbyId)];
  return store.mappools.value.find((item) => item.id === id) || null;
}

function setActivePool(store, lobbyId, poolId) {
  const key = lobbyKey(lobbyId);
  if (!key) return;
  if (poolId) store.activePoolByLobbyId.value[key] = String(poolId);
  else delete store.activePoolByLobbyId.value[key];
}

export function useMappool(mode = "stable") {
  const store = stores[mode] || stores.stable;
  const { mappools, qualificationModeByLobbyId, mapStatesByLobbyId, activePoolByLobbyId } = store;
  return {
    getQualificationMode: (lobbyId) => getQualificationMode(store, lobbyId),
    hasQualificationMode: (lobbyId) => hasQualificationMode(store, lobbyId),
    setQualificationMode: (lobbyId, value) => setQualificationMode(store, lobbyId, value),
    clearLobbyState: (lobbyId) => clearLobbyState(store, lobbyId),
    getMapState: (lobbyId, slot) => getMapState(store, lobbyId, slot),
    setMapState: (lobbyId, slot, patch) => setMapState(store, lobbyId, slot, patch),
    clearLobbyMapState: (lobbyId) => clearLobbyMapState(store, lobbyId),
    clearAllMapStates: () => clearAllMapStates(store),
    mappools,
    addMappool: (value) => addMappool(store, value),
    updateMappool: (id, value) => updateMappool(store, id, value),
    deleteMappool: (id) => deleteMappool(store, id),
    WIN_CONDITION_TEMPLATES,
    winConditionSource,
    getActivePool: (lobbyId) => getActivePool(store, lobbyId),
    setActivePool: (lobbyId, poolId) => setActivePool(store, lobbyId, poolId),
  };
}
