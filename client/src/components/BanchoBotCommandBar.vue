<script setup>
import Button from "primevue/button";
import { CircleHelp, Plus } from "@lucide/vue";

defineProps({ disabled: { type: Boolean, default: false } });
const emit = defineEmits(["send-command", "create"]);
</script>

<template>
  <div class="bancho-command-bar">
    <div class="bancho-command-bar__actions">
      <Button
        text
        rounded
        aria-label="Send help command"
        title="Help"
        :disabled="disabled"
        @click="emit('send-command', '!help')"
      >
        <CircleHelp :size="17" />
      </Button>
      <Button
        text
        rounded
        aria-label="Create lobby"
        title="Create lobby"
        :disabled="disabled"
        @click="emit('create')"
      >
        <Plus :size="17" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.bancho-command-bar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 3.8rem;
  padding: 0.45rem 1.25rem;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.bancho-command-bar__actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.bancho-command-bar__actions :deep(.p-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.7rem;
  height: 2.7rem;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  color: var(--app-muted);
  transition:
    color 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease;
}

.bancho-command-bar__actions :deep(.p-button:hover) {
  border-color: rgba(var(--app-primary-rgb), 0.32);
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
}

.bancho-command-bar:has(:disabled) {
  opacity: 0.45;
  pointer-events: none;
}
</style>
