<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import SelectButton from "primevue/selectbutton";
import Slider from "primevue/slider";

const props = defineProps({
  visible: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  initialGameMode: { type: Number, default: 2 },
  initialWinCondition: { type: Number, default: 3 },
  initialOpenSlots: { type: Number, default: 16 },
});
const emit = defineEmits(["update:visible", "send"]);
const gameMode = ref(2);
const winCondition = ref(3);
const openSlots = ref(16);
const gameModeOptions = [
  { label: "HeadToHead", value: 0 },
  { label: "Tag co-op", value: 1 },
  { label: "Team VS", value: 2 },
  { label: "Tag-team VS", value: 3 },
];
const winConditionOptions = [
  { label: "Score", value: 0 },
  { label: "Accuracy", value: 1 },
  { label: "Combo", value: 2 },
  { label: "Score V2", value: 3 },
];
const command = computed(() => `!mp set ${gameMode.value} ${winCondition.value} ${openSlots.value}`);
function reset() {
  gameMode.value = props.initialGameMode;
  winCondition.value = props.initialWinCondition;
  openSlots.value = props.initialOpenSlots;
}
function close() {
  emit("update:visible", false);
}
function send() {
  if (props.disabled) return;
  emit("send", command.value);
  close();
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) reset();
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissableMask
    :closable="!disabled"
    class="lobby-setup-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    :style="{ width: '32rem' }"
    header="Configure lobby"
    @update:visible="(value) => (value ? null : close())"
  >
    <div class="lobby-setup-dialog__body">
      <label class="lobby-setup-dialog__field">
        <span>Game mode</span>
        <SelectButton v-model="gameMode" :options="gameModeOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
      </label>
      <label class="lobby-setup-dialog__field">
        <span>Win condition</span>
        <SelectButton v-model="winCondition" :options="winConditionOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
      </label>
      <div class="lobby-setup-dialog__field">
        <div class="lobby-setup-dialog__slider-label">
          <span>Open slots</span><strong>{{ openSlots }}</strong>
        </div>
        <div class="lobby-setup-dialog__slider-wrap">
          <Slider v-model="openSlots" :min="0" :max="16" :step="1" />
        </div>
        <div class="lobby-setup-dialog__slider-range"><span>0</span><span>16</span></div>
      </div>
    </div>
    <template #footer>
      <Button label="Cancel" text severity="secondary" class="lobby-setup-dialog__cancel" :disabled="disabled" @click="close" />
      <Button label="Send" class="lobby-setup-dialog__send" :disabled="disabled" @click="send" />
    </template>
  </Dialog>
</template>

<style scoped>
.lobby-setup-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.lobby-setup-dialog__intro {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
}
.lobby-setup-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  border: 1px solid rgba(var(--app-primary-rgb), 0.25);
  border-radius: 0.65rem;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
}
.lobby-setup-dialog__intro > div:last-child {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.lobby-setup-dialog__intro strong {
  color: var(--app-text);
  font-size: 0.86rem;
}
.lobby-setup-dialog__intro span {
  color: var(--app-muted);
  font-size: 0.74rem;
}
.lobby-setup-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.lobby-setup-dialog__field > span,
.lobby-setup-dialog__slider-label span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.lobby-setup-dialog__field :deep(.p-selectbutton) {
  display: flex;
  width: 100%;
}
.lobby-setup-dialog__field :deep(.p-selectbutton .p-togglebutton) {
  flex: 1 1 0;
  min-width: 0;
  padding: 0.48rem 0.35rem;
  font-size: 0.7rem;
}
.lobby-setup-dialog__slider-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lobby-setup-dialog__slider-label strong {
  min-width: 2rem;
  padding: 0.12rem 0.45rem;
  border-radius: 0.35rem;
  background: rgba(var(--app-primary-rgb), 0.14);
  color: var(--app-primary-bright);
  font-size: 0.78rem;
  text-align: center;
}
.lobby-setup-dialog__slider-wrap {
  position: relative;
  padding: 0.5rem 0;
}
.lobby-setup-dialog__slider-wrap :deep(.p-slider) {
  position: relative;
  z-index: 1;
  height: 0.35rem;
  border-radius: 999px;
  background: var(--app-surface-hover);
}
.lobby-setup-dialog__slider-wrap :deep(.p-slider-range) {
  background: var(--app-primary);
}
.lobby-setup-dialog__slider-wrap :deep(.p-slider-handle) {
  width: 1.05rem;
  height: 1.05rem;
  border: 3px solid var(--app-primary-bright);
  background: var(--app-surface-raised);
  box-shadow: 0 0 0.7rem rgba(var(--app-primary-rgb), 0.55);
}
.lobby-setup-dialog__ticks {
  position: absolute;
  z-index: 0;
  top: 0.53rem;
  right: 0;
  bottom: 0.53rem;
  left: 0;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.lobby-setup-dialog__ticks span {
  width: 1px;
  height: 0.8rem;
  background: rgba(3, 5, 10, 0.8);
}
.lobby-setup-dialog__slider-range {
  display: flex;
  justify-content: space-between;
  color: var(--app-muted);
  font-size: 0.68rem;
}
</style>
