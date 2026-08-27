<script setup>
import { computed } from "vue";
import { Users } from "@lucide/vue";
import { useNickColor } from "../composables/useNickColor";
import { useChatSettings } from "../composables/useChatSettings";

const props = defineProps({
  players: {
    type: Array,
    default: () => [],
    // each: { name, isHost, isReady, avatarUrl, mods }
    // mods is an optional array of mod acronyms, e.g. ['HD', 'DT'] -
    // rendered as small icons once mod art is wired in
  },
  currentUser: { type: String, default: "" },
});

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
});

const visiblePlayers = computed(() =>
  props.players.filter((player) => !player.isReferee),
);

function colorFor(player) {
  if (player.team === "red") return redTeamColor.value;
  if (player.team === "blue") return blueTeamColor.value;
  return nickColor(player.name, props.currentUser);
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

function playerNameStyle(player) {
  if (player.team === "red") return { color: redTeamColor.value };
  if (player.team === "blue") return { color: blueTeamColor.value };
  return { color: nickColor(player.name, props.currentUser) };
}

function modCode(mod) {
  const value = String(mod || "").trim();
  return MOD_CODES[value.toLowerCase()] || value.toUpperCase();
}

function playerMods(player) {
  return (player.mods || [])
    .map(modCode)
    .filter((mod, index, mods) => mods.indexOf(mod) === index);
}
</script>

<template>
  <div class="player-list">
    <div class="player-list__header">
      <span class="player-list__heading"><Users :size="18" /> Players</span>
      <span class="player-list__count">{{ visiblePlayers.length }}</span>
    </div>

    <ul
      class="player-list__items"
      :class="{ 'player-list__items--scrollable': visiblePlayers.length > 5 }"
    >
      <li
        v-for="player in visiblePlayers"
        :key="player.name"
        class="player-row"
      >
        <span
          v-if="player.avatarUrl"
          class="player-row__avatar"
          :style="{ backgroundImage: `url(${player.avatarUrl})` }"
        />
        <span
          v-else
          class="player-row__avatar player-row__avatar--placeholder"
          :style="{ background: colorFor(player) }"
          >{{ initials(player.name) }}</span
        >

        <span class="player-row__name" :style="playerNameStyle(player)">
          {{ player.name }}
        </span>

        <span v-if="playerMods(player).length" class="player-row__mods">
          <span
            v-for="mod in playerMods(player)"
            :key="mod"
            class="player-row__mod"
          >
            {{ modCode(mod) }}
          </span>
        </span>

        <span class="player-row__ready" :data-ready="player.isReady" />
      </li>

      <li v-if="!visiblePlayers.length" class="player-list__empty">
        No players yet
      </li>
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

.player-row__name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.player-list__empty {
  font-size: 0.8rem;
  color: var(--app-muted);
  padding: 0.4rem 0;
}
</style>
