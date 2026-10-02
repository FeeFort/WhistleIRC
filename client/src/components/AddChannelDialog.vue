<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import SelectButton from "primevue/selectbutton";
import { Link2 } from "@lucide/vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(["update:visible", "join"]);

const channelInput = ref("");
const channelType = ref("stable");
const channelTypes = [
  { label: "Stable", value: "stable" },
  { label: "Lazer", value: "lazer" },
];

const stableFormats = [/^https:\/\/osu\.ppy\.sh\/mp\/(\d+)\/?$/i, /^https:\/\/osu\.ppy\.sh\/community\/matches\/(\d+)\/?$/i, /^#?mp_(\d+)$/i, /^(\d+)$/];
const lazerFormats = [/^https:\/\/osu\.ppy\.sh\/multiplayer\/rooms\/(\d+)\/?$/i, /^(\d+)$/];

const match = computed(() => {
  const value = channelInput.value.trim();
  const formats = channelType.value === "lazer" ? lazerFormats : stableFormats;
  for (const pattern of formats) {
    const result = value.match(pattern);
    if (result) return result[1];
  }
  return null;
});

const isValid = computed(() => Boolean(match.value));

function close() {
  if (props.loading) return;
  emit("update:visible", false);
}

function join() {
  if (!match.value || props.loading) return;
    emit("join", channelType.value === "lazer" ? {
      type: "lazer",
      id: `lazer:${match.value}`,
      label: `Lazer room #${match.value}`,
      roomId: Number(match.value),
      source: channelInput.value.trim(),
    } : {
      type: "stable",
      id: `mp-${match.value}`,
    label: `#mp_${match.value}`,
    matchId: match.value,
    source: channelInput.value.trim(),
  });
}

function updateVisible(value) {
  if (value && props.loading) return;
  emit("update:visible", value);
}

watch(
  () => props.visible,
  (value) => {
    if (value) {
      channelInput.value = "";
      channelType.value = "stable";
    }
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :dismissable-mask="!loading"
    :closable="!loading"
    class="add-channel-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    header="Add a channel"
    :style="{ width: '27rem' }"
    @update:visible="updateVisible"
  >
    <div class="add-channel-dialog__body">
      <div class="add-channel-dialog__intro">
        <div class="add-channel-dialog__icon">
          <Link2 :size="18" />
        </div>
        <div>
          <strong>Join a multiplayer channel</strong>
        <span>Choose the room type and enter its link or ID.</span>
        </div>
      </div>

      <label class="add-channel-dialog__field">
        <span>Room type</span>
        <SelectButton v-model="channelType" :options="channelTypes" optionLabel="label" optionValue="value" :allowEmpty="false" :disabled="loading" aria-label="Room type" />
      </label>

      <label class="add-channel-dialog__field">
        <span>{{ channelType === "lazer" ? "Lazer room link or ID" : "Multiplayer link or channel" }}</span>
        <InputText v-model="channelInput" autofocus :placeholder="channelType === 'lazer' ? 'https://osu.ppy.sh/multiplayer/rooms/12345678 or 12345678' : 'https://osu.ppy.sh/mp/12345678 or #mp_12345678'" spellcheck="false" :disabled="loading" @keydown.enter="join" />
      </label>

      <p v-if="channelType === 'lazer'" class="add-channel-dialog__help">Accepted: https://osu.ppy.sh/multiplayer/rooms/room-id or a bare room ID.</p>
      <p v-else class="add-channel-dialog__help">Accepted: https://osu.ppy.sh/mp/mp-id, https://osu.ppy.sh/community/matches/mp-id, #mp_mp-id, or a bare room ID.</p>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="loading" @click="close" />
      <Button label="Join" :loading="loading" :disabled="!isValid || loading" @click="join" />
    </template>
  </Dialog>
</template>

<style scoped>
.add-channel-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.add-channel-dialog__intro {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
}

.add-channel-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  border: 1px solid rgba(var(--app-primary-rgb), 0.25);
  border-radius: 0.65rem;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
}

.add-channel-dialog__intro > div:last-child {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.add-channel-dialog__intro strong {
  color: var(--app-text);
  font-size: 0.78rem;
}

.add-channel-dialog__intro span,
.add-channel-dialog__help {
  color: var(--app-muted);
  font-size: 0.7rem;
  line-height: 1.45;
}

.add-channel-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.add-channel-dialog__field > span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.add-channel-dialog__field :deep(.p-inputtext) {
  width: 100%;
}

.add-channel-dialog__field :deep(.p-selectbutton) {
  display: flex;
  width: 100%;
}

.add-channel-dialog__field :deep(.p-selectbutton .p-togglebutton) {
  flex: 1 1 0;
  border-color: var(--app-border) !important;
  background: var(--app-control) !important;
  color: var(--app-muted) !important;
  font-size: 0.74rem;
  justify-content: center;
}

.add-channel-dialog__field :deep(.p-selectbutton .p-togglebutton .p-togglebutton-content) {
  background: transparent !important;
  box-shadow: none !important;
}

.add-channel-dialog__field :deep(.p-selectbutton .p-togglebutton.p-togglebutton-checked) {
  border-color: rgba(var(--app-primary-rgb), 0.5) !important;
  background: rgba(var(--app-primary-rgb), 0.16) !important;
  color: var(--app-primary-bright) !important;
}

.add-channel-dialog__help {
  margin: -0.25rem 0 0;
}
</style>
