<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useToast } from "primevue/usetoast";
import { LockOpen, Menu, RefreshCcw, UserRoundX, Whistle } from "@lucide/vue";
import { useNickColor } from "../../composables/useNickColor";
import { useChatSettings } from "../../composables/useChatSettings";
import { useServerConnection } from "../../composables/useServerConnection";
import { loadLazerCachedProfileByUsername } from "../../composables/useLazerRoomResourceCache";

const props = defineProps({
  visible: { type: Boolean, default: false },
  players: { type: Array, default: () => [] },
  roomId: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:visible", "move-player"]);
const draggedPlayer = ref(null);
const dragTargetSlot = ref(null);
const userId = ref("");
const submittingInvite = ref(false);
const submittingTeamUserId = ref(null);
const pendingSlotMove = ref(null);
const { nickColor } = useNickColor();
const { redTeamColor, blueTeamColor } = useChatSettings();
const toast = useToast();
const { lastEvent, lazerInvitePlayer, moveLazerUser, kickLazerPlayer, requestApi } = useServerConnection();
const parsedUserId = computed(() => Number.parseInt(userId.value.trim(), 10));
const inviteTarget = computed(() => userId.value.trim());
const hasLimitedSlots = computed(() => props.players.some((player) => player.isSlot));
const inviteValid = computed(
  () => Boolean(inviteTarget.value) && Number.isInteger(props.roomId) && props.roomId > 0,
);

function close() {
  if (submittingInvite.value || submittingTeamUserId.value !== null) return;
  emit("update:visible", false);
}
async function invite() {
  if (!inviteValid.value || submittingInvite.value) return;
  submittingInvite.value = true;
  let targetId = parsedUserId.value;
  try {
    if (!Number.isInteger(targetId) || targetId <= 0) {
      const profile = await loadLazerCachedProfileByUsername(props.roomId, inviteTarget.value, requestApi);
      targetId = Number(profile?.userId);
    }
  } catch {
    targetId = null;
  }
  if (!Number.isInteger(targetId) || targetId <= 0) {
    submittingInvite.value = false;
    toast.add({ severity: "error", summary: "Invite failed", detail: "The osu! user could not be found.", life: 4000 });
    return;
  }
  submittingInvite.value = lazerInvitePlayer(props.roomId, targetId);
  if (!submittingInvite.value) {
    toast.add({ severity: "error", summary: "Invite failed", detail: "The server connection is not available.", life: 4000 });
  }
}
function toggleTeam(player) {
  if (props.disabled || !Number.isInteger(props.roomId) || props.roomId <= 0 || player.isSlot || !player.team || submittingTeamUserId.value !== null) return;
  const team = player.team === "red" ? "blue" : "red";
  submittingTeamUserId.value = player.userId;
  if (!moveLazerUser(props.roomId, player.userId, { team })) {
    submittingTeamUserId.value = null;
    toast.add({ severity: "error", summary: "Team change failed", detail: "The server connection is not available.", life: 4000 });
  }
}
function startDrag(player, event) {
  if (!hasLimitedSlots.value || props.disabled || player.isSlot || submittingTeamUserId.value !== null) return;
  draggedPlayer.value = player;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(player.userId));
}
function endDrag() {
  draggedPlayer.value = null;
  dragTargetSlot.value = null;
}
function dragOverSlot(slot, event) {
  if (!hasLimitedSlots.value || !slot.isSlot || !draggedPlayer.value || submittingTeamUserId.value !== null) return;
  event.preventDefault();
  dragTargetSlot.value = slot.slot;
}
function dragLeaveSlot(slot, event) {
  if (dragTargetSlot.value === slot.slot && !event.currentTarget.contains(event.relatedTarget)) dragTargetSlot.value = null;
}
function dropOnSlot(slot, event) {
  event.preventDefault();
  const player = draggedPlayer.value;
  if (!hasLimitedSlots.value || !player || !slot.isSlot || props.disabled || submittingTeamUserId.value !== null) return;
  submittingTeamUserId.value = player.userId;
  pendingSlotMove.value = { userId: player.userId, slot: slot.slot };
  if (!moveLazerUser(props.roomId, player.userId, { slot: slot.slot - 1, team: player.team })) {
    submittingTeamUserId.value = null;
    pendingSlotMove.value = null;
    toast.add({ severity: "error", summary: "Move failed", detail: "The server connection is not available.", life: 4000 });
  }
  endDrag();
}
function kickPlayer(player) {
  if (props.disabled || !Number.isInteger(props.roomId) || props.roomId <= 0 || player.isSlot || submittingTeamUserId.value !== null) return;
  submittingTeamUserId.value = player.userId;
  if (!kickLazerPlayer(props.roomId, player.userId)) {
    submittingTeamUserId.value = null;
    toast.add({ severity: "error", summary: "Kick failed", detail: "The server connection is not available.", life: 4000 });
  }
}

function initials(name) {
  return String(name || "")
    .slice(0, 2)
    .toUpperCase();
}

function playerNameStyle(player) {
  if (player.isSlot) return { color: "#8b93a6" };
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

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      userId.value = "";
      submittingInvite.value = false;
      submittingTeamUserId.value = null;
      pendingSlotMove.value = null;
    }
  },
);

watch(lastEvent, (event) => {
  if (!submittingInvite.value || (event?.received !== "lazer_invite_player" && event?.request !== "lazer_invite_player")) return;

  submittingInvite.value = false;
  if (event.type === "ack") {
    userId.value = "";
    toast.add({ severity: "success", summary: "Player invited", detail: "The invitation was sent successfully.", life: 3500 });
    return;
  }

});

watch(lastEvent, (event) => {
  if (
    submittingTeamUserId.value === null ||
    !["lazer_move_user", "lazer_kick_player"].includes(event?.received) &&
      !["lazer_move_user", "lazer_kick_player"].includes(event?.request)
  )
    return;

  submittingTeamUserId.value = null;
  if (event.type === "ack" && event.received === "lazer_move_user" && pendingSlotMove.value) {
    emit("move-player", pendingSlotMove.value);
    pendingSlotMove.value = null;
    return;
  }
  pendingSlotMove.value = null;
});
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :dismissable-mask="!disabled && !submittingInvite && submittingTeamUserId === null"
    :closable="!disabled && !submittingInvite && submittingTeamUserId === null"
    class="players-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    :style="{ width: '30rem' }"
    header="Players"
    @update:visible="(value) => (value ? null : close())"
  >
    <div class="players-dialog__invite">
      <InputText v-model="userId" placeholder="osu! user ID or username" :disabled="disabled || submittingInvite || submittingTeamUserId !== null" @keydown.enter="invite" />
      <Button label="Invite" :loading="submittingInvite" :disabled="disabled || !inviteValid || submittingInvite || submittingTeamUserId !== null" @click="invite" />
    </div>
    <div class="players-dialog__list">
      <div
        v-for="player in players"
        :key="player.isSlot ? 'slot-' + player.slot : player.name"
        class="players-dialog__row"
        :draggable="hasLimitedSlots && !player.isSlot && !disabled && submittingTeamUserId === null"
        :class="{
          'players-dialog__row--slot': player.isSlot,
          'players-dialog__row--drop-target': player.isSlot && dragTargetSlot === player.slot,
          'players-dialog__row--dragging': !player.isSlot && draggedPlayer?.userId === player.userId,
        }"
        @dragstart="hasLimitedSlots && !player.isSlot && startDrag(player, $event)"
        @dragend="endDrag"
        @dragover="dragOverSlot(player, $event)"
        @dragleave="dragLeaveSlot(player, $event)"
        @drop="dropOnSlot(player, $event)"
      >
        <span v-if="hasLimitedSlots" class="players-dialog__drag" :class="{ 'players-dialog__drag--empty': player.isSlot && players.some((item) => !item.isSlot) }" aria-hidden="true">
          <Menu v-if="hasLimitedSlots && !player.isSlot" :size="15" />
        </span>
        <span v-if="player.isSlot" class="players-dialog__avatar players-dialog__avatar--slot" aria-hidden="true"><LockOpen :size="13" /></span>
        <span v-else-if="player.avatarUrl" class="players-dialog__avatar" :style="avatarStyle(player)" />
        <span v-else class="players-dialog__avatar players-dialog__avatar--placeholder" :style="avatarStyle(player)">{{ initials(player.name) }}</span>
          <span class="players-dialog__identity">
            <span class="players-dialog__name" :class="{ 'players-dialog__name--slot': player.isSlot }" :style="playerNameStyle(player)">{{ player.name }}</span>
            <Whistle v-if="player.isReferee" v-tooltip.top="'Referee'" class="players-dialog__referee" :size="14" aria-label="Referee" />
            <svg v-if="player.isHost" class="players-dialog__host" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Host">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path
              d="M19 19h-14c-.5 0 -.9 -.3 -1 -.8l-2 -10c0 -.4 .1 -.8 .5 -1.1c.4 -.2 .8 -.2 1.1 0l4.1 3.3l3.4 -5.1c.4 -.6 1.3 -.6 1.7 0l3.4 5.1l4.1 -3.3c.3 -.3 .8 -.3 1.1 0c.4 .2 .5 .6 .5 1.1l-2 10c0 .5 -.5 .8 -1 .8z"
            />
          </svg>
        </span>
        <Button
          v-if="!player.isSlot && !player.isReferee"
          v-tooltip.top="'Switch team'"
          text
          rounded
          severity="secondary"
          class="players-dialog__team-button"
          :style="switchTeamStyle(player)"
          :disabled="disabled || !player.team || submittingTeamUserId !== null"
          :aria-label="'Switch ' + player.name + ' team'"
          @click.stop="toggleTeam(player)"
        >
          <RefreshCcw :size="15" />
        </Button>
        <Button
          v-if="!player.isSlot && !player.isReferee"
          v-tooltip.top="'Kick player'"
          text
          rounded
          severity="danger"
          class="players-dialog__action-button players-dialog__action-button--kick"
          :disabled="disabled || submittingTeamUserId !== null"
          :aria-label="'Kick ' + player.name"
          @click.stop="kickPlayer(player)"
        >
          <UserRoundX :size="15" />
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.players-dialog__invite {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}
.players-dialog__invite :deep(.p-inputtext) {
  height: 2.15rem;
  min-width: 0;
  flex: 1 1 auto;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.45rem;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
  font-size: 0.74rem;
}
.players-dialog__invite :deep(.p-inputtext::placeholder) {
  color: var(--app-muted);
}
.players-dialog__invite :deep(.p-inputtext:hover:not(:disabled)) {
  border-color: rgba(var(--app-primary-rgb), 0.5) !important;
}
.players-dialog__invite :deep(.p-inputtext:focus) {
  border-color: var(--app-primary) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}
.players-dialog__invite :deep(.p-button) {
  min-height: 2.15rem;
  flex: 0 0 auto;
  justify-content: center;
  border: 1px solid var(--app-primary) !important;
  border-radius: 0.45rem;
  background: var(--app-primary) !important;
  color: var(--app-bg) !important;
  font-size: 0.74rem;
  font-weight: 800;
}
.players-dialog__invite :deep(.p-button:hover:not(:disabled)) {
  border-color: var(--app-primary-bright) !important;
  background: var(--app-primary-bright) !important;
}
.players-dialog__invite :deep(.p-button:disabled) {
  opacity: 0.55;
}
.players-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  max-height: 27rem;
  overflow-y: auto;
  padding: 0 0.2rem 0 0;
}
.players-dialog__row {
  display: flex;
  align-items: center;
  min-height: 2.25rem;
  gap: 0.55rem;
  padding: 0.18rem 0.25rem;
  border: 1px solid transparent;
  border-radius: 0.55rem;
  color: var(--app-text);
  font-size: 0.85rem;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    opacity 140ms ease;
}
.players-dialog__row:hover {
  background: var(--app-surface-hover);
}
.players-dialog__row--slot {
  color: var(--app-text);
  opacity: 1;
}
.players-dialog__row--drop-target {
  border-color: var(--app-primary-bright);
  background: rgba(var(--app-primary-rgb), 0.1);
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.16);
}
.players-dialog__row--dragging {
  opacity: 0.45;
}
.players-dialog__row[draggable="true"] {
  cursor: grab;
}
.players-dialog__row[draggable="true"]:active {
  cursor: grabbing;
}
.players-dialog__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background-position: center;
  background-size: cover;
}
.players-dialog__avatar--placeholder {
  color: #fff;
  font-size: 0.58rem;
  font-weight: 700;
}
.players-dialog__avatar--slot {
  border: 0;
  color: #8b93a6;
  background: #171d2b;
}
.players-dialog__drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1.7rem;
  flex: 0 0 1rem;
  color: #8b93a6;
  pointer-events: none;
}
.players-dialog__drag--empty {
  visibility: hidden;
}
.players-dialog__list:not(:has(.players-dialog__row:not(.players-dialog__row--slot))) .players-dialog__drag {
  display: none;
}
.players-dialog__identity {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 0.3rem;
}
.players-dialog__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.players-dialog__name--slot {
  color: #8b93a6;
}
.players-dialog__host {
  flex: 0 0 auto;
  color: var(--p-yellow-400, #eab308);
}
.players-dialog__referee {
  flex: 0 0 auto;
  color: var(--app-primary-bright);
}
.players-dialog__team-button {
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  border: 0 !important;
  background: transparent !important;
  color: var(--app-muted);
}
.players-dialog__team-button:hover {
  filter: brightness(1.2);
}
.players-dialog__team-button:hover {
  background: rgba(var(--app-primary-rgb), 0.1) !important;
}
.players-dialog__action-button {
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  border: 0 !important;
  background: transparent !important;
  color: var(--app-muted);
}
.players-dialog__action-button--kick:hover {
  color: var(--p-red-400, #f87171) !important;
  background: rgba(239, 68, 68, 0.1) !important;
}
</style>
