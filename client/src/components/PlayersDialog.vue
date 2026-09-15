<script setup>
import { computed, ref } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { Lock, LockOpen, Menu, RefreshCcw, UserRoundX } from "@lucide/vue";
import { useNickColor } from "../composables/useNickColor";
import { useChatSettings } from "../composables/useChatSettings";

const props = defineProps({
  visible: { type: Boolean, default: false },
  players: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:visible", "move-player", "toggle-team", "kick-player", "set-host"]);
const draggedPlayer = ref(null);
const dragTargetSlot = ref(null);
const hasPlayers = computed(() => props.players.some((player) => !player.isSlot));
const { nickColor } = useNickColor();
const { redTeamColor, blueTeamColor } = useChatSettings();

function close() { emit("update:visible", false); }
function startDrag(player, event) {
  if (props.disabled || player.isSlot) return;
  draggedPlayer.value = player;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", player.name);
}
function endDrag() {
  draggedPlayer.value = null;
  dragTargetSlot.value = null;
}
function dragOverSlot(slot, event) {
  if (!slot.isSlot || slot.isLocked || !draggedPlayer.value) return;
  event.preventDefault();
  dragTargetSlot.value = slot.slot;
}
function dragLeaveSlot(slot, event) {
  if (dragTargetSlot.value === slot.slot && !event.currentTarget.contains(event.relatedTarget)) {
    dragTargetSlot.value = null;
  }
}
function dropOnSlot(slot, event) {
  event.preventDefault();
  const player = draggedPlayer.value;
  if (!player || !slot.isSlot || slot.isLocked || props.disabled) return;
  emit("move-player", { username: player.name, slot: slot.slot });
  endDrag();
}
function toggleTeam(player) {
  if (props.disabled || player.isSlot || !player.team) return;
  emit("toggle-team", { username: player.name, team: player.team === "red" ? "blue" : "red" });
}
function kickPlayer(player) {
  if (props.disabled || player.isSlot) return;
  emit("kick-player", { username: player.name });
}
function setHost(player) {
  if (props.disabled || player.isSlot || player.isHost) return;
  emit("set-host", { username: player.name });
}

function initials(name) {
  return String(name || "").slice(0, 2).toUpperCase();
}

function playerNameStyle(player) {
  if (player.isSlot) return { color: "var(--app-muted)" };
  if (player.team === "red") return { color: redTeamColor.value };
  if (player.team === "blue") return { color: blueTeamColor.value };
  return { color: nickColor(player.name, "") };
}

function avatarStyle(player) {
  if (player.avatarUrl) return { backgroundImage: "url(" + player.avatarUrl + ")" };
  const background = player.team === "red" ? redTeamColor.value : player.team === "blue" ? blueTeamColor.value : nickColor(player.name, "");
  return { background };
}

function switchTeamStyle(player) {
  if (player.team === "red") return { color: blueTeamColor.value };
  if (player.team === "blue") return { color: redTeamColor.value };
  return undefined;
}
</script>

<template>
  <Dialog :visible="visible" modal dismissableMask :closable="!disabled" class="players-dialog" :pt="{ mask: { class: 'app-dialog-mask' } }" :style="{ width: '30rem' }" header="Players" @update:visible="(value) => value ? null : close()">
    <div class="players-dialog__list" :class="{ 'players-dialog__list--with-players': hasPlayers }">
      <div
        v-for="player in players"
        :key="player.isSlot ? 'slot-' + player.slot : player.name"
        class="players-dialog__row"
        :draggable="!player.isSlot && !disabled"
        :class="{ 'players-dialog__row--slot': player.isSlot, 'players-dialog__row--drop-target': player.isSlot && dragTargetSlot === player.slot, 'players-dialog__row--dragging': draggedPlayer?.name === player.name }"
        @dragstart="!player.isSlot && startDrag(player, $event)"
        @dragend="endDrag"
        @dragover="dragOverSlot(player, $event)"
        @dragleave="dragLeaveSlot(player, $event)"
        @drop="dropOnSlot(player, $event)"
      >
        <span class="players-dialog__drag" :class="{ 'players-dialog__drag--empty': player.isSlot && hasPlayers }" aria-hidden="true">
          <Menu v-if="!player.isSlot" :size="15" />
        </span>
        <span v-if="player.isSlot" class="players-dialog__avatar players-dialog__avatar--slot" :class="{ 'players-dialog__avatar--locked': player.isLocked }">
          <Lock v-if="player.isLocked" :size="13" />
          <LockOpen v-else :size="13" />
        </span>
        <span v-else-if="player.avatarUrl" class="players-dialog__avatar" :style="avatarStyle(player)" />
        <span v-else class="players-dialog__avatar players-dialog__avatar--placeholder" :style="avatarStyle(player)">{{ initials(player.name) }}</span>
        <span class="players-dialog__identity">
          <span class="players-dialog__name" :class="{ 'players-dialog__name--slot': player.isSlot }" :style="playerNameStyle(player)">{{ player.name }}</span>
          <svg v-if="player.isHost" class="players-dialog__host" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Host">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M19 19h-14c-.5 0 -.9 -.3 -1 -.8l-2 -10c0 -.4 .1 -.8 .5 -1.1c.4 -.2 .8 -.2 1.1 0l4.1 3.3l3.4 -5.1c.4 -.6 1.3 -.6 1.7 0l3.4 5.1l4.1 -3.3c.3 -.3 .8 -.3 1.1 0c.4 .2 .5 .6 .5 1.1l-2 10c0 .5 -.5 .8 -1 .8z" />
          </svg>
        </span>
        <span v-if="player.isSlot" class="players-dialog__state" :class="{ 'players-dialog__state--locked': player.isLocked }">{{ player.isLocked ? 'Locked' : 'Open' }}</span>
        <Button v-if="!player.isSlot" text rounded severity="secondary" class="players-dialog__team-button" v-tooltip.top="'Switch team'" :style="switchTeamStyle(player)" :disabled="disabled || !player.team" :aria-label="'Switch ' + player.name + ' team'" @click.stop="toggleTeam(player)">
          <RefreshCcw :size="15" />
        </Button>
        <Button v-if="!player.isSlot" text rounded severity="secondary" class="players-dialog__action-button players-dialog__action-button--host" v-tooltip.top="'Make host'" :disabled="disabled || player.isHost" :aria-label="'Make ' + player.name + ' host'" @click.stop="setHost(player)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6" />
          </svg>
        </Button>
        <Button v-if="!player.isSlot" text rounded severity="danger" class="players-dialog__action-button players-dialog__action-button--kick" v-tooltip.top="'Kick player'" :disabled="disabled" :aria-label="'Kick ' + player.name" @click.stop="kickPlayer(player)">
          <UserRoundX :size="15" />
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.players-dialog__list { display: flex; flex-direction: column; gap: .15rem; max-height: 27rem; overflow-y: auto; padding: 0 .2rem 0 0; }
.players-dialog__row { display: flex; align-items: center; min-height: 2.25rem; gap: .55rem; padding: .18rem .25rem; border: 1px solid transparent; border-radius: .55rem; color: var(--app-text); font-size: .85rem; transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease; }
.players-dialog__row:hover { background: var(--app-surface-hover); }
.players-dialog__row--slot { color: var(--app-muted); }
.players-dialog__row--drop-target { border-color: var(--app-primary-bright); background: rgba(var(--app-primary-rgb), .1); box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), .16); }
.players-dialog__row--dragging { opacity: .45; }
.players-dialog__row[draggable="true"] { cursor: grab; }
.players-dialog__row[draggable="true"]:active { cursor: grabbing; }
.players-dialog__avatar { display: inline-flex; align-items: center; justify-content: center; width: 1.7rem; height: 1.7rem; flex: 0 0 auto; border-radius: 50%; background-position: center; background-size: cover; }
.players-dialog__avatar--placeholder { color: #fff; font-size: .58rem; font-weight: 700; }
.players-dialog__avatar--slot { color: #737985; background: var(--app-surface-hover); }
.players-dialog__avatar--locked { color: #4d535f; }
.players-dialog__drag { display: inline-flex; align-items: center; justify-content: center; width: 1rem; height: 1.7rem; flex: 0 0 1rem; color: var(--app-muted); pointer-events: none; }
.players-dialog__drag--empty { visibility: hidden; }
.players-dialog__list:not(.players-dialog__list--with-players) .players-dialog__drag { display: none; }
.players-dialog__identity { display: flex; align-items: center; flex: 1; min-width: 0; gap: .3rem; }
.players-dialog__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.players-dialog__name--slot { color: var(--app-muted); }
.players-dialog__host { flex: 0 0 auto; color: var(--p-yellow-400, #eab308); }
.players-dialog__state { flex: 0 0 4.5rem; color: var(--app-muted); font-size: .7rem; text-align: right; }
.players-dialog__state--locked { opacity: .55; }
.players-dialog__team-button { width: 1.8rem; height: 1.8rem; padding: 0; border: 0 !important; background: transparent !important; color: var(--app-muted); }
.players-dialog__team-button:hover { filter: brightness(1.2); }
.players-dialog__team-button:hover { background: rgba(var(--app-primary-rgb), .1) !important; }
.players-dialog__action-button { width: 1.8rem; height: 1.8rem; padding: 0; border: 0 !important; background: transparent !important; color: var(--app-muted); }
.players-dialog__action-button--host.p-button { color: var(--p-yellow-400, #eab308) !important; }
.players-dialog__action-button--host.p-button:hover { color: var(--p-yellow-400, #eab308) !important; background: rgba(234, 179, 8, .1) !important; }
.players-dialog__action-button--kick:hover { color: var(--p-red-400, #f87171) !important; background: rgba(239, 68, 68, .1) !important; }
</style>
