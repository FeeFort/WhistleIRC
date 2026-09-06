import { ref, watch } from "vue";

const STORAGE_KEY = "feeirc-mappool";

const MOD_ORDER = ["NM", "HD", "HR", "DT", "HT", "FM", "TB", "Other"];
const DEFAULT_RULESET = 0;

function readStoredState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      pool: saved?.pool || null,
      qualificationMode: saved?.qualificationMode === true,
      mapStatesByLobbyId: saved?.mapStatesByLobbyId && typeof saved.mapStatesByLobbyId === "object" ? saved.mapStatesByLobbyId : {},
    };
  } catch {
    return { pool: null, qualificationMode: false, mapStatesByLobbyId: {} };
  }
}

const storedState = readStoredState();
const pool = ref(storedState.pool);
const qualificationMode = ref(storedState.qualificationMode);
const mapStatesByLobbyId = ref(storedState.mapStatesByLobbyId);

watch(
  [pool, qualificationMode],
  () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pool: pool.value,
        qualificationMode: qualificationMode.value,
        mapStatesByLobbyId: mapStatesByLobbyId.value,
      }),
    );
  },
  { deep: true },
);

function normalizeCommands(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((command) => typeof command === "string")
    .map((command) => command.trim())
    .filter(Boolean);
}

function normalizeMod(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function modFromSlot(slot, mods) {
  const slotPrefix = slot.match(/^[A-Za-z]+/)?.[0];
  if (slotPrefix) return normalizeMod(slotPrefix);

  const firstMod = mods.find(Boolean);
  return normalizeMod(firstMod) || "Other";
}

function normalizeMap(slot, value) {
  if (!value || typeof value !== "object") return null;

  const id = Number(value.id);
  const name = String(value.name || value.title || "").trim();
  const diff = String(value.diff || "").trim();
  const author = String(value.author || "").trim();
  const artist = String(value.artist || "").trim();
  const beatmapsetId = Number(value.beatmapset_id ?? value.beatmapsetId ?? value.setId ?? value.beatmapSetId);
  const starRating = Number(value.star_rating ?? value.starRating ?? value.stars);
  const totalSeconds = Number(value.total_seconds ?? value.totalSeconds ?? value.total_length);

  if (!Number.isFinite(id) || !name || !diff || !author) return null;

  const mods = Array.isArray(value.mods)
    ? value.mods
        .filter((mod) => typeof mod === "string")
        .map(normalizeMod)
        .filter(Boolean)
    : [];

  return {
    slot,
    id,
    name,
    artist,
    diff,
    author,
    mapperName: author,
    beatmapsetId: Number.isFinite(beatmapsetId) ? beatmapsetId : null,
    starRating: Number.isFinite(starRating) ? starRating : null,
    totalSeconds: Number.isFinite(totalSeconds) ? totalSeconds : null,
    mods,
    group: modFromSlot(slot, mods),
    additionalCommands: normalizeCommands(value.additionalCommands),
  };
}

export function parseMappool(input) {
  let source = input;
  if (typeof input === "string") {
    try {
      source = JSON.parse(input);
    } catch {
      throw new Error("The file is not valid JSON.");
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Mappool JSON must contain an object.");
  }
  if (!source.maps || typeof source.maps !== "object" || Array.isArray(source.maps)) {
    throw new Error("Mappool JSON must contain a maps object.");
  }

  const entries = Object.entries(source.maps);
  const maps = entries.map(([slot, value]) => normalizeMap(String(slot).trim(), value)).filter(Boolean);

  if (!maps.length) {
    throw new Error("No valid maps were found in the mappool JSON.");
  }

  return {
    tournament: String(source.tournament || "Untitled tournament").trim(),
    stage: String(source.stage || "Unspecified stage").trim(),
    ruleset: Number.isInteger(Number(source.ruleset)) && Number(source.ruleset) >= 0 && Number(source.ruleset) <= 3 ? Number(source.ruleset) : DEFAULT_RULESET,
    generalAdditionalCommands: normalizeCommands(source.generalAdditionalCommands),
    maps,
    skippedMaps: entries.length - maps.length,
  };
}

function setPool(nextPool) {
  pool.value = nextPool;
}

function clearPool() {
  pool.value = null;
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

export function useMappool() {
  return {
    pool,
    qualificationMode,
    setPool,
    clearPool,
    getMapState,
    setMapState,
    clearLobbyMapState,
    clearAllMapStates,
  };
}
