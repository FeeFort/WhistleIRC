<script setup>
import { Crown } from "@lucide/vue";
import { useNickColor } from "../composables/useNickColor";

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

function colorFor(name) {
  return nickColor(name, props.currentUser);
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}
</script>

<template>
  <div class="player-list">
    <div class="player-list__header">
      <span class="player-list__title">Players</span>
      <span class="player-list__count">{{ players.length }}</span>
    </div>

    <ul class="player-list__items">
      <li v-for="player in players" :key="player.name" class="player-row">
        <span
          v-if="player.avatarUrl"
          class="player-row__avatar"
          :style="{ backgroundImage: `url(${player.avatarUrl})` }"
        />
        <span
          v-else
          class="player-row__avatar player-row__avatar--placeholder"
          :style="{ background: colorFor(player.name) }"
          >{{ initials(player.name) }}</span
        >

        <span class="player-row__name">{{ player.name }}</span>

        <span class="player-row__mods">
          <!-- mod icons land here once mod art is wired in -->
          <span
            v-for="mod in player.mods || []"
            :key="mod"
            class="player-row__mod"
            >{{ mod }}</span
          >
        </span>

        <Crown v-if="player.isHost" :size="13" class="player-row__host" />
        <span class="player-row__ready" :data-ready="player.isReady" />
      </li>

      <li v-if="!players.length" class="player-list__empty">No players yet</li>
    </ul>
  </div>
</template>

<style scoped>
.player-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  background: var(--p-content-background);
}

.player-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.player-list__title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.player-list__count {
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}

.player-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--p-text-color);
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
  background: var(--p-content-hover-background);
  color: var(--p-text-muted-color);
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
  background: var(--p-text-muted-color);
  opacity: 0.4;
}

.player-row__ready[data-ready="true"] {
  background: var(--p-green-500, #22c55e);
  opacity: 1;
}

.player-list__empty {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  padding: 0.4rem 0;
}
</style>
