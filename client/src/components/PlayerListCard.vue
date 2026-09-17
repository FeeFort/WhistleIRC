<script setup>
import { computed } from "vue";
import { Ban, Lock, LockOpen, Settings, Users } from "@lucide/vue";
import { useNickColor } from "../composables/useNickColor";
import { useChatSettings } from "../composables/useChatSettings";

const props = defineProps({
  players: {
    type: Array,
    default: () => [],
    // each: { name, profileUrl, isHost, isReady, avatarUrl, mods }
    // mods is an optional array of mod acronyms, e.g. ['HD', 'DT'] -
    // rendered as small icons once mod art is wired in
  },
  currentUser: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(["open-players"]);

const { nickColor } = useNickColor();
const { redTeamColor, blueTeamColor } = useChatSettings();

const MOD_CODES = Object.freeze({
  easy: "EZ",
  nofail: "NF",
  halftime: "HF",
  hardrock: "HR",
  suddendeath: "SD",
  doubletime: "DT",
  hidden: "HD",
  flashlight: "FL",
  relax: "RX",
  relax2: "AP",
  spunout: "SO",
  key1: "1K",
  key2: "2K",
  key3: "3K",
  key4: "4K",
  key5: "5K",
  key6: "6K",
  key7: "7K",
  key8: "8K",
  key9: "9K",
  keycoop: "CO",
  mirror: "MR",
  fadein: "FI",
});

const visiblePlayers = computed(() => props.players.filter((player) => !player.isReferee));
const realPlayerCount = computed(() => visiblePlayers.value.filter((player) => !player.isSlot).length);

function colorFor(player) {
  if (player.team === "red") return redTeamColor.value;
  if (player.team === "blue") return blueTeamColor.value;
  return nickColor(player.name, props.currentUser);
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

function playerNameStyle(player) {
  if (player.isSlot) return { color: "var(--app-muted)" };
  if (player.team === "red") return { color: redTeamColor.value };
  if (player.team === "blue") return { color: blueTeamColor.value };
  return { color: nickColor(player.name, props.currentUser) };
}

function modCode(mod) {
  const value = String(mod || "").trim();
  return MOD_CODES[value.toLowerCase()] || value.toUpperCase();
}

function playerMods(player) {
  return (player.mods || []).map(modCode).filter((mod, index, mods) => mods.indexOf(mod) === index);
}
</script>

<template>
  <div class="player-list">
    <div class="player-list__header">
      <span class="player-list__heading"><Users :size="18" /> Players</span>
      <span class="player-list__header-actions">
        <span class="player-list__count">{{ realPlayerCount }}</span>
        <button v-tooltip.top="'Manage players'" type="button" class="player-list__settings" :disabled="disabled" aria-label="Manage players" @click="emit('open-players')">
          <Settings :size="14" />
        </button>
      </span>
    </div>

    <ul class="player-list__items" :class="{ 'player-list__items--scrollable': visiblePlayers.length > 5 }">
      <li v-for="player in visiblePlayers" :key="player.name" class="player-row">
        <span
          v-if="player.isSlot"
          v-tooltip.top="player.isLocked ? 'Locked slot' : 'Open slot'"
          class="player-row__avatar player-row__avatar--slot"
          :class="{ 'player-row__avatar--locked': player.isLocked }"
        >
          <Lock v-if="player.isLocked" :size="13" />
          <LockOpen v-else :size="13" />
        </span>
        <span v-else-if="player.avatarUrl" class="player-row__avatar" :style="{ backgroundImage: `url(${player.avatarUrl})` }" />
        <span v-else class="player-row__avatar player-row__avatar--placeholder" :style="{ background: colorFor(player) }">{{ initials(player.name) }}</span>

        <span class="player-row__identity">
          <a v-if="player.profileUrl" class="player-row__name player-row__name--link" :style="playerNameStyle(player)" :href="player.profileUrl" target="_blank" rel="noopener noreferrer">
            {{ player.name }}
          </a>
          <span v-else class="player-row__name" :style="playerNameStyle(player)">
            {{ player.name }}
          </span>
          <svg v-if="player.isHost" class="player-row__host" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Host">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path
              d="M19 19h-14c-.5 0 -.9 -.3 -1 -.8l-2 -10c0 -.4 .1 -.8 .5 -1.1c.4 -.2 .8 -.2 1.1 0l4.1 3.3l3.4 -5.1c.4 -.6 1.3 -.6 1.7 0l3.4 5.1l4.1 -3.3c.3 -.3 .8 -.3 1.1 0c.4 .2 .5 .6 .5 1.1l-2 10c0 .5 -.5 .8 -1 .8z"
            />
          </svg>
        </span>
        <span v-if="player.isSlot" class="player-row__slot-state" :class="{ 'player-row__slot-state--locked': player.isLocked }">
          {{ player.isLocked ? "Locked" : "Open" }}
        </span>

        <span v-if="playerMods(player).length" class="player-row__mods">
          <span v-for="mod in playerMods(player)" :key="mod" class="player-row__mod">
            {{ modCode(mod) }}
          </span>
        </span>

        <span v-if="!player.isSlot && player.noMap" v-tooltip.top="'No Map'" class="player-row__no-map">
          <Ban :size="14" />
        </span>
        <span v-else-if="!player.isSlot" class="player-row__ready" :data-ready="player.isReady" />
      </li>

      <li v-if="!visiblePlayers.length" class="player-list__empty">No players yet</li>
    </ul>
  </div>
</template>

<style scoped>
.player-list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  background: var(--app-panel-gradient);
}

.player-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.player-list__heading {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--app-text);
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
}

.player-list__heading svg {
  color: var(--app-purple-bright);
}

.player-list__count {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--app-surface-hover);
  font-size: 0.72rem;
  color: var(--app-text);
}

.player-list__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.player-list__settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.player-list__settings:hover {
  background: var(--app-surface-hover);
  color: var(--app-primary-bright);
}

.player-list__settings:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.player-list__settings:disabled:hover {
  background: transparent;
  color: var(--app-muted);
}

.player-list__settings:focus-visible {
  outline: 2px solid var(--app-primary-bright);
  outline-offset: 2px;
}

.player-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.player-list__items--scrollable {
  max-height: calc(5 * 1.375rem + 4 * 0.4rem);
  overflow-y: auto;
  margin-right: -1.2rem;
  padding-right: 1.2rem;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--app-text);
}

.player-row__avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
}

.player-row__avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 700;
  color: #fff;
}

.player-row__avatar--slot {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #737985;
  background: var(--app-surface-hover);
}

.player-row__avatar--slot.player-row__avatar--locked {
  color: #4d535f;
}

.player-row__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-row__identity {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: 0.3rem;
}

.player-row__slot-state {
  flex-shrink: 0;
  color: #737985;
  font-size: 0.68rem;
  font-weight: 600;
}

.player-row__slot-state--locked {
  color: #4d535f;
}

.player-row__name--link {
  text-decoration: none;
}

.player-row__name--link:hover {
  text-decoration: underline;
}

.player-row__mods {
  display: flex;
  gap: 0.2rem;
  flex-shrink: 0;
}

.player-row__mod {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.02rem 0.3rem;
  border-radius: 4px;
  background: var(--app-surface-hover);
  color: var(--app-muted);
}

.player-row__host {
  flex-shrink: 0;
  color: var(--p-yellow-400, #eab308);
}

.player-row__ready {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--app-muted);
  opacity: 0.4;
}

.player-row__ready[data-ready="true"] {
  background: var(--p-green-500, #22c55e);
  opacity: 1;
}

.player-row__no-map {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--p-red-500, #ef4444);
}

.player-list__empty {
  font-size: 0.8rem;
  color: var(--app-muted);
  padding: 0.4rem 0;
}
</style>
