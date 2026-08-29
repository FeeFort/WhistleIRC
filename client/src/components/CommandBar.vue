<script setup>
import { ref, computed } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { Play, Square, TimerOff, Settings2, Lock, LockOpen, DoorClosed, Timer, Zap, Plus, Pencil, SlidersHorizontal, AlertTriangle } from "@lucide/vue";
import { useShortcuts, BUILTIN_IDS } from "../composables/useShortcuts";
import ShortcutEditDialog from "./ShortcutEditDialog.vue";
import BuiltinShortcutsSettings from "./BuiltinShortcutsSettings.vue";

const props = defineProps({
  docked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["send-command"]);

const { startDelaySeconds, timerSeconds, builtinWarnings, customShortcuts, addCustomShortcut, updateCustomShortcut, removeCustomShortcut, reorderCustomShortcut, resolveIcon, normalizeShortcutColor } =
  useShortcuts();

const commandConfirmationVisible = ref(false);
const pendingCommand = ref("");

const commandGroups = computed(() => [
  {
    label: "Match",
    commands: [
      {
        id: BUILTIN_IDS.START,
        label: "Start",
        command: `!mp start ${startDelaySeconds.value}`,
        icon: Play,
        tone: "green",
      },
      {
        id: BUILTIN_IDS.ABORT,
        label: "Abort",
        command: "!mp abort",
        icon: Square,
        tone: "red",
      },
      {
        id: BUILTIN_IDS.SETTINGS,
        label: "Settings",
        command: "!mp settings",
        icon: Settings2,
        tone: "neutral",
      },
    ],
  },
  {
    label: "Timer",
    commands: [
      {
        id: BUILTIN_IDS.TIMER,
        label: "Set timer",
        command: "",
        icon: Timer,
        tone: "amber",
      },
      {
        id: BUILTIN_IDS.ABORT_TIMER,
        label: "Abort timer",
        command: "!mp aborttimer",
        icon: TimerOff,
        tone: "red",
      },
    ],
  },
  {
    label: "Lobby",
    commands: [
      {
        id: BUILTIN_IDS.LOCK,
        label: "Lock",
        command: "!mp lock",
        icon: Lock,
        tone: "amber",
      },
      {
        id: BUILTIN_IDS.UNLOCK,
        label: "Unlock",
        command: "!mp unlock",
        icon: LockOpen,
        tone: "green",
      },
      {
        id: BUILTIN_IDS.CLOSE,
        label: "Close",
        command: "!mp close",
        icon: DoorClosed,
        tone: "red",
      },
    ],
  },
]);

function emitCommand(command) {
  if (!command || props.disabled) return;
  emit("send-command", command);
}

function sendBuiltin(cmd) {
  const command = cmd.command || `!mp timer ${timerSeconds.value}`;
  if (!builtinWarnings.value[cmd.id]) {
    emitCommand(command);
    return;
  }
  requestCommandConfirmation(command);
}

// --- custom shortcuts: send / edit / drag reorder ---

function initials(label) {
  return (label || "??").trim().slice(0, 2).toUpperCase();
}

function sendCustom(shortcut) {
  if (!shortcut.warning) {
    emitCommand(shortcut.command);
    return;
  }
  requestCommandConfirmation(shortcut.command);
}

function onCustomShortcutsWheel(event) {
  const container = event.currentTarget;
  if (container.scrollWidth <= container.clientWidth || event.deltaY === 0) {
    return;
  }
  event.preventDefault();
  container.scrollLeft += event.deltaY;
}

function requestCommandConfirmation(command) {
  pendingCommand.value = command;
  commandConfirmationVisible.value = true;
}

function cancelCommandConfirmation() {
  commandConfirmationVisible.value = false;
}

function acceptCommandConfirmation() {
  const command = pendingCommand.value;
  commandConfirmationVisible.value = false;
  if (command) emitCommand(command);
}

const dragIndex = ref(null);

function onDragStart(index, event) {
  dragIndex.value = index;
  event.dataTransfer.effectAllowed = "move";
}

function onDragOver(index, event) {
  event.preventDefault();
  if (dragIndex.value === null || dragIndex.value === index) return;
  reorderCustomShortcut(dragIndex.value, index);
  dragIndex.value = index;
}

function onDragEnd() {
  dragIndex.value = null;
}

// --- edit dialogs ---

const editorVisible = ref(false);
const editingShortcut = ref(null); // null = creating new

function openCreate() {
  if (props.disabled) return;
  editingShortcut.value = null;
  editorVisible.value = true;
}

function openEdit(shortcut) {
  if (props.disabled) return;
  editingShortcut.value = shortcut;
  editorVisible.value = true;
}

function handleSave(data) {
  if (editingShortcut.value) {
    updateCustomShortcut(editingShortcut.value.id, data);
  } else {
    addCustomShortcut(data);
  }
}

const builtinSettingsVisible = ref(false);
</script>

<template>
  <div
    class="command-bar"
    :class="{
      'command-bar--docked': docked,
      'command-bar--disabled': disabled,
    }"
  >
    <span v-if="!docked" class="command-bar__title"><Zap :size="18" /> Quick commands</span>

    <Dialog
      v-model:visible="commandConfirmationVisible"
      modal
      dismissableMask
      :closable="false"
      class="command-confirm-dialog"
      :pt="{ mask: { class: 'app-dialog-mask' } }"
      :style="{ width: '28rem' }"
    >
      <Message severity="warn" variant="simple" :closable="false" class="command-confirm-message">
        <template #icon>
          <AlertTriangle :size="20" class="command-confirm-message__icon" />
        </template>
        <div class="command-confirm-message__content">
          <strong>Send shortcut command?</strong>
          <span>This command will be sent to the chat:</span>
          <code>{{ pendingCommand }}</code>
        </div>
      </Message>

      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="cancelCommandConfirmation" />
        <Button label="Send" @click="acceptCommandConfirmation" />
      </template>
    </Dialog>

    <div class="command-bar__groups">
      <section v-for="group in commandGroups" :key="group.label" class="command-group">
        <div class="command-group__main">
          <div class="command-group__buttons">
            <Button
              v-for="cmd in group.commands"
              :key="cmd.id"
              v-tooltip.top="cmd.label"
              :aria-label="cmd.label"
              text
              rounded
              class="command-bar__btn"
              :disabled="disabled"
              :class="`command-bar__btn--${cmd.tone}`"
              @click="sendBuiltin(cmd)"
            >
              <component :is="cmd.icon" :size="17" />
            </Button>
          </div>
        </div>
      </section>

      <!-- custom shortcuts - own group, same divider treatment as the
           built-in ones, scrolls independently if it overflows -->
      <section class="command-group command-group--custom">
        <div class="command-group__main">
          <div class="command-group__buttons command-group__buttons--scroll" @wheel="onCustomShortcutsWheel">
            <div
              v-for="(shortcut, index) in customShortcuts"
              :key="shortcut.id"
              class="shortcut-item"
              draggable="true"
              @dragstart="onDragStart(index, $event)"
              @dragover="onDragOver(index, $event)"
              @dragend="onDragEnd"
            >
              <button
                v-tooltip.top="shortcut.description || shortcut.command"
                type="button"
                class="command-bar__btn"
                :style="{
                  color: normalizeShortcutColor(shortcut.color) || 'var(--app-muted)',
                }"
                :aria-label="shortcut.label"
                :disabled="disabled"
                @click="sendCustom(shortcut)"
              >
                <component :is="resolveIcon(shortcut.icon)" v-if="resolveIcon(shortcut.icon)" :size="17" />
                <span v-else class="shortcut-item__initials">{{ initials(shortcut.label) }}</span>
              </button>
              <button type="button" class="shortcut-item__edit" aria-label="Edit shortcut" @click="openEdit(shortcut)">
                <Pencil :size="11" />
              </button>
            </div>

            <button v-tooltip.top="'Add shortcut'" type="button" class="command-bar__btn command-bar__btn--add" :disabled="disabled" aria-label="Add shortcut" @click="openCreate">
              <Plus :size="17" />
            </button>
          </div>
        </div>
      </section>
    </div>

    <button v-tooltip.top="'Built-in shortcut settings'" type="button" class="command-bar__settings" :disabled="disabled" aria-label="Edit built-in shortcuts" @click="builtinSettingsVisible = true">
      <SlidersHorizontal :size="15" />
    </button>

    <ShortcutEditDialog v-model:visible="editorVisible" :shortcut="editingShortcut" @save="handleSave" @delete="removeCustomShortcut" />
    <BuiltinShortcutsSettings v-model:visible="builtinSettingsVisible" />
  </div>
</template>

<style scoped>
.command-bar {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  background: var(--app-panel-gradient);
}

.command-bar--docked {
  flex-direction: row;
  align-items: center;
  padding: 0.6rem 1.25rem;
  border: 0;
  border-top: 1px solid var(--app-border);
  border-radius: 0;
  background: transparent;
}

.command-bar--disabled {
  opacity: 0.45;
  pointer-events: none;
}

.command-bar--docked .command-bar__groups {
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 1.1rem;
  flex: 1 1 auto;
  min-width: 0;
}

.command-bar--docked .command-group {
  width: auto;
}

.command-bar--docked .command-group + .command-group {
  padding-top: 0;
  padding-left: 1.1rem;
  border-top: 0;
  border-left: 1px solid var(--app-border);
}

.command-bar--docked .command-group--custom {
  flex: 1 1 0;
  max-width: 100%;
}

.command-bar__title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--app-text);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.command-bar__title svg {
  color: var(--app-purple-bright);
}

.command-bar__groups {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-width: 0;
}

.command-group {
  display: flex;
  min-width: 0;
  width: 100%;
}

.command-group--custom {
  min-width: 0;
  flex: 1 1 auto;
}

.command-group__main {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  min-width: 0;
}

.command-group + .command-group {
  padding-top: 0.7rem;
  border-top: 1px solid var(--app-border);
}

.command-group__buttons {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.command-group__buttons--scroll {
  flex: 1 1 auto;
  flex-wrap: nowrap;
  overflow-x: auto;
  min-width: 0;
  width: 0;
  max-width: 100%;
  padding-bottom: 0.2rem;
}

.shortcut-item {
  position: relative;
  flex-shrink: 0;
  cursor: grab;
}

.shortcut-item:active {
  cursor: grabbing;
}

.shortcut-item__initials {
  font-family: "Nunito", "Manrope", sans-serif;
  font-weight: 800;
  font-size: 0.72rem;
  letter-spacing: 0.01em;
}

.shortcut-item__edit {
  position: absolute;
  top: -4px;
  right: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface-raised);
  color: var(--app-muted);
  opacity: 0;
  transition: opacity 150ms ease;
  cursor: pointer;
}

.shortcut-item:hover .shortcut-item__edit,
.shortcut-item__edit:focus-visible {
  opacity: 1;
}

.command-bar__btn {
  width: 2.55rem;
  height: 2.55rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  color: var(--app-muted);
  background: var(--app-control);
  transition: 180ms ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.command-bar__btn {
  height: 2.7rem;
}

.command-bar__btn--add {
  border-style: dashed;
}

.command-bar__btn:hover {
  border-color: var(--app-border);
  background: var(--app-control);
  transform: none;
}

.command-bar .command-bar__btn.command-bar__btn--green:hover:not(:disabled) {
  background-color: rgba(84, 213, 150, 0.16) !important;
  background-image: none !important;
  color: var(--app-green) !important;
}

.command-bar .command-bar__btn.command-bar__btn--red:hover:not(:disabled) {
  background-color: rgba(255, 109, 120, 0.16) !important;
  background-image: none !important;
  color: var(--app-red) !important;
}

.command-bar .command-bar__btn.command-bar__btn--amber:hover:not(:disabled) {
  background-color: rgba(242, 184, 75, 0.16) !important;
  background-image: none !important;
  color: var(--app-amber) !important;
}

.command-bar .command-bar__btn.command-bar__btn--neutral:hover:not(:disabled) {
  background-color: rgba(var(--app-primary-rgb), 0.16) !important;
  background-image: none !important;
  color: var(--app-purple-bright) !important;
}

.command-bar__btn--green {
  color: var(--app-green) !important;
}

.command-bar__btn--red {
  color: var(--app-red) !important;
}

.command-bar__btn--amber {
  color: var(--app-amber) !important;
}

.command-bar__btn--green :deep(svg) {
  color: var(--app-green) !important;
}

.command-bar__btn--red :deep(svg) {
  color: var(--app-red) !important;
}

.command-bar__btn--amber :deep(svg) {
  color: var(--app-amber) !important;
}

.command-bar__btn--neutral:hover :deep(svg) {
  color: var(--app-purple-bright) !important;
}

.command-bar__btn :deep(svg) {
  width: 19px;
  height: 19px;
  stroke-width: 2.35;
}

.command-bar__settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;
  margin-left: auto;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  color: var(--app-muted);
  background: transparent;
  cursor: pointer;
}

.command-bar__settings:hover {
  color: var(--app-text);
  background: var(--app-control);
}
</style>
