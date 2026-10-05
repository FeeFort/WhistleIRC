<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { UserRoundX, Whistle } from "@lucide/vue";
import { useToast } from "primevue/usetoast";
import { useServerConnection } from "../../composables/useServerConnection";
import { loadLazerCachedProfileByUsername } from "../../composables/useLazerRoomResourceCache";

const props = defineProps({
  visible: Boolean,
  referees: { type: Array, default: () => [] },
  roomId: { type: Number, default: null },
  currentUserId: { type: Number, default: null },
  disabled: Boolean,
});
const emit = defineEmits(["update:visible"]);
const userId = ref("");
const pending = ref(null);
const toast = useToast();
const { addLazerReferee, removeLazerReferee, lastEvent, requestApi } = useServerConnection();
const parsedUserId = computed(() => Number.parseInt(userId.value.trim(), 10));
const target = computed(() => userId.value.trim());
const valid = computed(() => Boolean(target.value) && Number.isInteger(props.roomId) && props.roomId > 0);

function close() {
  if (!pending.value) emit("update:visible", false);
}
async function add() {
  if (!valid.value || pending.value) return;
  pending.value = { action: "resolve", userId: null };
  let targetId = parsedUserId.value;
  try {
    if (!Number.isInteger(targetId) || targetId <= 0) {
      const profile = await loadLazerCachedProfileByUsername(props.roomId, target.value, requestApi);
      targetId = Number(profile?.userId);
    }
  } catch {
    targetId = null;
  }
  if (!Number.isInteger(targetId) || targetId <= 0) {
    pending.value = null;
    toast.add({ severity: "error", summary: "Add referee failed", detail: "The osu! user could not be found.", life: 4000 });
    return;
  }
  pending.value = { action: "add", userId: targetId };
  if (!addLazerReferee(props.roomId, targetId)) {
    pending.value = null;
    toast.add({ severity: "error", summary: "Add referee failed", detail: "The server connection is not available.", life: 4000 });
  }
}
function remove(referee) {
  const id = Number(referee.user_id);
  if (!Number.isInteger(id) || pending.value) return;
  pending.value = { action: "remove", userId: id };
  if (!removeLazerReferee(props.roomId, id)) {
    pending.value = null;
    toast.add({ severity: "error", summary: "Remove referee failed", detail: "The server connection is not available.", life: 4000 });
  }
}
watch(() => props.visible, (visible) => {
  if (visible) { userId.value = ""; pending.value = null; }
});
watch(lastEvent, (event) => {
  if (!pending.value || !["lazer_add_referee", "lazer_remove_referee"].includes(event?.received) && !["lazer_add_referee", "lazer_remove_referee"].includes(event?.request)) return;
  const action = pending.value.action;
  pending.value = null;
  if (event.type === "ack") {
    if (action === "add") userId.value = "";
    toast.add({ severity: "success", summary: action === "add" ? "Referee added" : "Referee removed", detail: "The referee list was updated.", life: 3000 });
  }
});
</script>

<template>
  <Dialog :visible="visible" modal :dismissable-mask="!pending" :closable="!disabled && !pending" :close-on-escape="!pending" class="players-dialog referees-dialog" :pt="{ mask: { class: 'app-dialog-mask' } }" :style="{ width: '30rem' }" header="Lobby referees" @keydown.esc.stop.prevent="close" @update:visible="(value) => (value ? null : close())">
    <div class="players-dialog__invite">
      <InputText v-model="userId" placeholder="osu! user ID or username" :disabled="disabled || Boolean(pending)" @keydown.enter="add" />
      <Button label="Add" :loading="pending?.action === 'add'" :disabled="disabled || !valid || Boolean(pending)" @click="add" />
    </div>
    <div class="players-dialog__list">
      <div v-for="referee in referees" :key="referee.user_id" class="players-dialog__row">
        <span v-if="referee.avatarUrl" class="players-dialog__avatar players-dialog__avatar--image" :style="{ backgroundImage: `url(${referee.avatarUrl})` }" />
        <span v-else class="players-dialog__avatar players-dialog__avatar--placeholder"><Whistle :size="15" /></span>
        <span class="players-dialog__identity"><span class="players-dialog__name">{{ referee.name || `User ${referee.user_id}` }}</span></span>
        <Button v-if="Number(referee.user_id) !== Number(currentUserId)" v-tooltip.top="'Remove referee'" text rounded severity="danger" class="players-dialog__action-button players-dialog__action-button--kick" :disabled="disabled || Boolean(pending)" :loading="pending?.action === 'remove' && pending?.userId === referee.user_id" :aria-label="'Remove ' + (referee.name || referee.user_id)" @click="remove(referee)"><UserRoundX :size="15" /></Button>
      </div>
      <div v-if="!referees.length" class="player-list__empty">No referees yet</div>
    </div>
  </Dialog>
</template>

<style scoped>
.players-dialog__invite { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.85rem; }
.players-dialog__invite :deep(.p-inputtext) { height: 2.15rem; min-width: 0; flex: 1 1 auto; border: 1px solid var(--app-border) !important; border-radius: 0.45rem; background: var(--app-control) !important; color: var(--app-text) !important; box-shadow: none !important; font-size: 0.74rem; }
.players-dialog__invite :deep(.p-inputtext::placeholder) { color: var(--app-muted); }
.players-dialog__invite :deep(.p-inputtext:hover:not(:disabled)) { border-color: rgba(var(--app-primary-rgb), 0.5) !important; }
.players-dialog__invite :deep(.p-inputtext:focus) { border-color: var(--app-primary) !important; box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important; }
.players-dialog__invite :deep(.p-button) { min-height: 2.15rem; flex: 0 0 auto; justify-content: center; border: 1px solid var(--app-primary) !important; border-radius: 0.45rem; background: var(--app-primary) !important; color: var(--app-bg) !important; font-size: 0.74rem; font-weight: 800; }
.players-dialog__invite :deep(.p-button:hover:not(:disabled)) { border-color: var(--app-primary-bright) !important; background: var(--app-primary-bright) !important; }
.players-dialog__invite :deep(.p-button:disabled) { opacity: 0.55; }
.players-dialog__list { display: flex; flex-direction: column; gap: 0.15rem; max-height: 27rem; overflow-y: auto; }
.players-dialog__row { display: flex; align-items: center; min-height: 2.25rem; gap: 0.55rem; padding: 0.18rem 0.25rem; border-radius: 0.55rem; }
.players-dialog__row:hover { background: var(--app-surface-hover); }
.players-dialog__avatar { display: inline-flex; align-items: center; justify-content: center; width: 1.8rem; height: 1.8rem; flex: 0 0 auto; border-radius: 50%; background: rgba(var(--app-primary-rgb), 0.14); color: var(--app-primary-bright); }
.players-dialog__avatar--image { background-position: center; background-size: cover; }
.players-dialog__identity { min-width: 0; flex: 1; }
.players-dialog__name { color: var(--app-text); font-size: 0.85rem; }
.players-dialog__action-button { flex: 0 0 auto; }
.player-list__empty { padding: 1rem 0; color: var(--app-muted); text-align: center; }
</style>
