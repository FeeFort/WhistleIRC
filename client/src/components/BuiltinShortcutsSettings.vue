<script setup>
import InputNumber from "primevue/inputnumber";
import ToggleSwitch from "primevue/toggleswitch";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { useShortcuts, BUILTIN_IDS } from "../composables/useShortcuts";

defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(["update:visible"]);

const { startDelaySeconds, timerSeconds, builtinWarnings } = useShortcuts();

const rows = [
  { id: BUILTIN_IDS.START, label: "Start" },
  { id: BUILTIN_IDS.ABORT, label: "Abort" },
  { id: BUILTIN_IDS.SETTINGS, label: "Settings" },
  { id: BUILTIN_IDS.TIMER, label: "Set timer" },
  { id: BUILTIN_IDS.ABORT_TIMER, label: "Abort timer" },
  { id: BUILTIN_IDS.LOCK, label: "Lock" },
  { id: BUILTIN_IDS.UNLOCK, label: "Unlock" },
  { id: BUILTIN_IDS.CLOSE, label: "Close" },
];

function close() {
  emit("update:visible", false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissableMask
    class="builtin-dialog-modal"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    header="Built-in shortcuts"
    :style="{ width: '26rem' }"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="builtin-dialog">
      <label class="builtin-dialog__delay">
        <span>Start countdown (seconds)</span>
        <InputNumber
          v-model="startDelaySeconds"
          :min="0"
          :max="60"
          :step="5"
          showButtons
          buttonLayout="horizontal"
          :inputStyle="{ width: '3.5rem' }"
        />
      </label>

      <label class="builtin-dialog__delay">
        <span>Timer duration (seconds)</span>
        <InputNumber
          v-model="timerSeconds"
          :min="5"
          :max="600"
          :step="15"
          showButtons
          buttonLayout="horizontal"
          :inputStyle="{ width: '3.5rem' }"
        />
      </label>

      <div class="builtin-dialog__list">
        <div v-for="row in rows" :key="row.id" class="builtin-dialog__row">
          <span>{{ row.label }}</span>
          <div class="builtin-dialog__toggle">
            <ToggleSwitch
              v-model="builtinWarnings[row.id]"
              class="app-solid-switch"
            />
            <span class="builtin-dialog__toggle-label">Warning</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Done" @click="close" />
    </template>
  </Dialog>
</template>

<style scoped>
.builtin-dialog {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.builtin-dialog__delay {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  font-weight: 600;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--app-border);
}

.builtin-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.builtin-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--app-text);
}

.builtin-dialog__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--app-muted);
  font-size: 0.78rem;
}
</style>
