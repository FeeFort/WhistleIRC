<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Plus, Save, Trash2 } from "@lucide/vue";
import { LOBBY_TEMPLATE_VARIABLES, useLobbyMessages } from "../composables/useLobbyMessages";

const props = defineProps({ visible: { type: Boolean, default: false } });
const emit = defineEmits(["update:visible"]);
const toast = useToast();
const { presets, activePresetId, addPreset, updatePreset, removePreset, setActivePreset, addMessage, updateMessage, removeMessage, moveMessage, replaceState } = useLobbyMessages();

const selectedPresetId = ref(null);
const selectedMessageId = ref(null);
const presetDraft = ref({ label: "" });
const messageDraft = ref({ label: "", content: "", enabled: true });
const closeConfirmationVisible = ref(false);
const baselineState = ref(null);

const selectedPreset = computed(() => presets.value.find((preset) => preset.id === selectedPresetId.value));
const selectedMessage = computed(() => selectedPreset.value?.messages.find((message) => message.id === selectedMessageId.value));

function loadPreset(preset) {
  presetDraft.value = { label: preset?.label || "" };
  selectedMessageId.value = preset?.messages[0]?.id || null;
  loadMessage(preset?.messages[0]);
}

function loadMessage(message) {
  messageDraft.value = message
    ? {
        label: message.label,
        content: message.content,
        enabled: message.enabled,
      }
    : { label: "", content: "", enabled: true };
}

function snapshot() {
  return JSON.stringify({
    presets: presets.value,
    activePresetId: activePresetId.value,
    presetDraft: presetDraft.value,
    messageDraft: messageDraft.value,
  });
}

const isDirty = computed(() => baselineState.value !== null && snapshot() !== baselineState.value);

function syncBaseline() {
  baselineState.value = snapshot();
}

function saveMessage({ notify = false } = {}) {
  if (selectedPreset.value) {
    updatePreset(selectedPreset.value.id, {
      label: presetDraft.value.label.trim() || "Untitled preset",
    });
    presetDraft.value.label = presetDraft.value.label.trim() || "Untitled preset";
  }
  if (selectedPreset.value && selectedMessage.value) {
    updateMessage(selectedPreset.value.id, selectedMessage.value.id, {
      label: messageDraft.value.label.trim() || "Untitled message",
      content: messageDraft.value.content,
      enabled: messageDraft.value.enabled,
    });
    messageDraft.value.label = messageDraft.value.label.trim() || "Untitled message";
  }
  syncBaseline();
  if (notify) {
    toast.add({
      severity: "success",
      summary: "Changes saved",
      detail: "Lobby result messages have been saved.",
      life: 2200,
    });
  }
}

function selectPreset(id, save = true) {
  if (save) saveMessage();
  selectedPresetId.value = id;
  loadPreset(presets.value.find((preset) => preset.id === id));
  syncBaseline();
}

function selectMessage(id, save = true) {
  if (save) saveMessage();
  selectedMessageId.value = id;
  loadMessage(selectedPreset.value?.messages.find((message) => message.id === id));
  syncBaseline();
}

function createPreset() {
  saveMessage();
  const preset = addPreset();
  selectedPresetId.value = preset.id;
  loadPreset(preset);
}

function createMessage() {
  saveMessage();
  if (!selectedPreset.value) return;
  const message = addMessage(selectedPreset.value.id);
  selectedMessageId.value = message.id;
  loadMessage(message);
}

function deleteMessage() {
  if (!selectedPreset.value || !selectedMessage.value) return;
  const index = selectedPreset.value.messages.findIndex((message) => message.id === selectedMessage.value.id);
  removeMessage(selectedPreset.value.id, selectedMessage.value.id);
  const next = selectedPreset.value.messages[index] || selectedPreset.value.messages[index - 1];
  selectedMessageId.value = next?.id || null;
  loadMessage(next);
}

function deletePreset() {
  if (!selectedPreset.value) return;
  const index = presets.value.findIndex((preset) => preset.id === selectedPreset.value.id);
  removePreset(selectedPreset.value.id);
  const next = presets.value[index] || presets.value[index - 1] || presets.value[0];
  selectedPresetId.value = next?.id || null;
  loadPreset(next);
}

function chooseActivePreset() {
  saveMessage();
  if (selectedPreset.value) setActivePreset(selectedPreset.value.id);
}

function updateMessageEnabled(presetId, messageId, enabled) {
  updateMessage(presetId, messageId, { enabled });
  if (messageId === selectedMessageId.value) {
    messageDraft.value.enabled = enabled;
  }
}

function saveChanges() {
  if (!isDirty.value) return;
  saveMessage({ notify: true });
}

function requestClose() {
  if (!isDirty.value) {
    emit("update:visible", false);
    return;
  }
  closeConfirmationVisible.value = true;
}

function handleDialogVisibility(value) {
  if (value) {
    emit("update:visible", true);
    return;
  }
  requestClose();
}

function discardChanges() {
  if (baselineState.value) {
    const saved = JSON.parse(baselineState.value);
    replaceState(saved.presets, saved.activePresetId);
  }
  closeConfirmationVisible.value = false;
  emit("update:visible", false);
}

function saveAndClose() {
  saveChanges();
  closeConfirmationVisible.value = false;
  emit("update:visible", false);
}

function insertVariable(key) {
  messageDraft.value.content = `${messageDraft.value.content}${messageDraft.value.content ? " " : ""}{{${key}}}`;
}

function variableToken(key) {
  return `{{${key}}}`;
}

function onVisible(value) {
  if (!value) return;
  const preset = presets.value.find((item) => item.id === activePresetId.value) || presets.value[0];
  if (preset) selectPreset(preset.id, false);
  syncBaseline();
}

watch(
  () => presets.value,
  (value) => {
    if (!value.length) return;
    if (!value.some((preset) => preset.id === selectedPresetId.value)) {
      selectPreset(activePresetId.value || value[0].id, false);
    }
  },
  { immediate: true, deep: true },
);

watch(
  () => props.visible,
  (value) => {
    if (value) onVisible(true);
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissableMask
    class="lobby-messages-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    header="Lobby result message presets"
    :style="{ width: '58rem' }"
    @update:visible="handleDialogVisibility"
    @show="onVisible(true)"
  >
    <div class="lobby-messages-dialog__layout">
      <aside class="lobby-messages-dialog__presets">
        <div class="lobby-messages-dialog__list-header">
          <span>Presets</span>
          <Button text rounded aria-label="Add preset" @click="createPreset">
            <Plus :size="15" />
          </Button>
        </div>
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="lobby-messages-dialog__template"
          :class="{
            'lobby-messages-dialog__template--selected': preset.id === selectedPresetId,
          }"
          @click="selectPreset(preset.id)"
        >
          <span class="lobby-messages-dialog__template-name">{{ preset.label }}</span>
          <Check v-if="preset.id === activePresetId" :size="14" class="lobby-messages-dialog__active" />
        </button>
      </aside>

      <section v-if="selectedPreset" class="lobby-messages-dialog__messages">
        <div class="lobby-messages-dialog__subheader">
          <InputText v-model="presetDraft.label" aria-label="Preset name" />
          <Button v-if="selectedPreset.id !== activePresetId" text size="small" @click="chooseActivePreset">
            <Check :size="14" />
            <span>Use this preset</span>
          </Button>
          <Button text severity="danger" size="small" aria-label="Delete preset" @click="deletePreset">
            <Trash2 :size="14" />
          </Button>
        </div>

        <div class="lobby-messages-dialog__message-list">
          <button
            v-for="(message, messageIndex) in selectedPreset.messages"
            :key="message.id"
            type="button"
            class="lobby-messages-dialog__message-row"
            :class="{
              'lobby-messages-dialog__message-row--selected': message.id === selectedMessageId,
            }"
            @click="selectMessage(message.id)"
          >
            <ToggleSwitch :model-value="message.enabled" class="app-solid-switch" @click.stop @update:model-value="updateMessageEnabled(selectedPreset.id, message.id, $event)" />
            <span class="lobby-messages-dialog__message-name">{{ message.label }}</span>
            <span class="lobby-messages-dialog__message-preview">{{ message.content }}</span>
            <span class="lobby-messages-dialog__message-order">
              <Button text rounded aria-label="Move message up" :disabled="messageIndex === 0" @click.stop="moveMessage(selectedPreset.id, message.id, -1)">
                <ArrowUp :size="13" />
              </Button>
              <Button text rounded aria-label="Move message down" :disabled="messageIndex === selectedPreset.messages.length - 1" @click.stop="moveMessage(selectedPreset.id, message.id, 1)">
                <ArrowDown :size="13" />
              </Button>
            </span>
          </button>
        </div>

        <Button text class="lobby-messages-dialog__add-message" @click="createMessage">
          <Plus :size="14" />
          <span>Add message to preset</span>
        </Button>
      </section>

      <section v-if="selectedMessage" class="lobby-messages-dialog__editor">
        <label class="lobby-messages-dialog__field">
          <span class="lobby-messages-dialog__label">Message name</span>
          <InputText v-model="messageDraft.label" />
        </label>
        <label class="lobby-messages-dialog__field">
          <span class="lobby-messages-dialog__label">Message template</span>
          <Textarea v-model="messageDraft.content" rows="7" autoResize />
        </label>
        <div class="lobby-messages-dialog__variables">
          <span class="lobby-messages-dialog__label">Insert variable</span>
          <div class="lobby-messages-dialog__variable-list">
            <button
              v-for="variable in LOBBY_TEMPLATE_VARIABLES"
              :key="variable.key"
              type="button"
              class="lobby-messages-dialog__variable"
              :title="variable.label"
              @click="insertVariable(variable.key)"
            >
              {{ variableToken(variable.key) }}
            </button>
          </div>
        </div>
        <div class="lobby-messages-dialog__actions">
          <Button text severity="danger" @click="deleteMessage"><Trash2 :size="14" /><span>Delete message</span></Button>
          <span class="lobby-messages-dialog__actions-spacer" />
          <Button :disabled="!isDirty" @click="saveChanges"><Save :size="14" /><span>Save</span></Button>
        </div>
      </section>
    </div>
  </Dialog>

  <Dialog v-model:visible="closeConfirmationVisible" modal dismissableMask :closable="false" class="command-confirm-dialog" :pt="{ mask: { class: 'app-dialog-mask' } }" :style="{ width: '28rem' }">
    <Message severity="warn" variant="simple" :closable="false" class="command-confirm-message">
      <template #icon>
        <AlertTriangle :size="20" class="command-confirm-message__icon" />
      </template>
      <div class="command-confirm-message__content">
        <strong>Save changes before closing?</strong>
        <span>Your unsaved lobby message changes will be lost.</span>
      </div>
    </Message>

    <template #footer>
      <Button label="Discard" text severity="secondary" @click="discardChanges" />
      <Button label="Save" @click="saveAndClose" />
    </template>
  </Dialog>
</template>

<style scoped>
.lobby-messages-dialog__layout {
  display: grid;
  grid-template-columns: 11rem minmax(16rem, 1fr) minmax(14rem, 1fr);
  gap: 1rem;
  min-height: 25rem;
}
.lobby-messages-dialog__presets,
.lobby-messages-dialog__messages {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
  padding-right: 0.8rem;
  border-right: 1px solid var(--app-border);
}
.lobby-messages-dialog__list-header,
.lobby-messages-dialog__subheader {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  margin-bottom: 0.35rem;
}
.lobby-messages-dialog__list-header {
  justify-content: space-between;
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}
.lobby-messages-dialog__list-header :deep(.p-button),
.lobby-messages-dialog__message-order :deep(.p-button) {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  color: var(--app-primary-bright);
}
.lobby-messages-dialog__template,
.lobby-messages-dialog__message-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.5rem;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  text-align: left;
}
.lobby-messages-dialog__template:hover,
.lobby-messages-dialog__template--selected,
.lobby-messages-dialog__message-row:hover,
.lobby-messages-dialog__message-row--selected {
  border-color: rgba(var(--app-primary-rgb), 0.2);
  background: rgba(var(--app-primary-rgb), 0.1);
  color: var(--app-text);
}
.lobby-messages-dialog__template-name,
.lobby-messages-dialog__message-name,
.lobby-messages-dialog__message-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lobby-messages-dialog__message-name {
  flex: 0 0 5.2rem;
  font-weight: 700;
}
.lobby-messages-dialog__message-preview {
  flex: 1;
  color: var(--app-muted);
  font-size: 0.64rem;
}
.lobby-messages-dialog__active {
  flex-shrink: 0;
  color: var(--app-primary-bright);
}
.lobby-messages-dialog__message-order {
  display: flex;
  flex-shrink: 0;
}
.lobby-messages-dialog__subheader :deep(.p-inputtext) {
  min-width: 0;
  flex: 1;
}
.lobby-messages-dialog__add-message {
  justify-content: flex-start;
  gap: 0.35rem;
  color: var(--app-primary-bright);
  font-size: 0.72rem;
}
.lobby-messages-dialog__editor {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-width: 0;
}
.lobby-messages-dialog__field,
.lobby-messages-dialog__variables {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.lobby-messages-dialog__label {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.lobby-messages-dialog__field :deep(.p-inputtext),
.lobby-messages-dialog__field :deep(.p-textarea) {
  width: 100%;
}
.lobby-messages-dialog__variable-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  max-height: 8rem;
  overflow-y: auto;
}
.lobby-messages-dialog__variable {
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--app-border);
  border-radius: 0.35rem;
  background: var(--app-control);
  color: var(--app-primary-bright);
  cursor: pointer;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.64rem;
}
.lobby-messages-dialog__variable:hover {
  border-color: var(--app-primary);
  background: rgba(var(--app-primary-rgb), 0.12);
}
.lobby-messages-dialog__actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: auto;
  padding-top: 0.4rem;
}
.lobby-messages-dialog__actions :deep(.p-button) {
  gap: 0.35rem;
}
.lobby-messages-dialog__actions-spacer {
  flex: 1;
}
@media (max-width: 760px) {
  .lobby-messages-dialog__layout {
    grid-template-columns: 1fr;
  }
  .lobby-messages-dialog__presets,
  .lobby-messages-dialog__messages {
    padding-right: 0;
    padding-bottom: 0.8rem;
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
  }
}
</style>
