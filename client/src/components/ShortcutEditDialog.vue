<script setup>
import { ref, computed, watch } from "vue";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import ColorPicker from "primevue/colorpicker";
import ToggleSwitch from "primevue/toggleswitch";
import Button from "primevue/button";
import { useShortcuts } from "../composables/useShortcuts";

const props = defineProps({
  visible: { type: Boolean, default: false },
  shortcut: { type: Object, default: null }, // null = creating a new one
});

const emit = defineEmits(["update:visible", "save", "delete"]);

const { resolveIcon, normalizeShortcutColor } = useShortcuts();

const isEdit = computed(() => !!props.shortcut);

const form = ref({
  label: "",
  command: "",
  description: "",
  icon: "",
  color: "",
  warning: false,
});

watch(
  () => [props.visible, props.shortcut],
  () => {
    if (!props.visible) return;
    form.value = props.shortcut
      ? { ...props.shortcut }
      : {
          label: "",
          command: "",
          description: "",
          icon: "",
          color: "",
          warning: false,
        };
  },
  { immediate: true },
);

const previewIcon = computed(() => resolveIcon(form.value.icon));
const previewInitials = computed(() => (form.value.label || "??").trim().slice(0, 2).toUpperCase());

const colorNoHash = computed({
  get: () => (form.value.color || "").replace("#", ""),
  set: (v) => (form.value.color = normalizeShortcutColor(v)),
});

const previewColor = computed(() => normalizeShortcutColor(form.value.color));

const canSave = computed(() => form.value.label.trim() && form.value.command.trim());

function close() {
  emit("update:visible", false);
}

function save() {
  if (!canSave.value) return;
  emit("save", { ...form.value });
  close();
}

function remove() {
  if (props.shortcut) emit("delete", props.shortcut.id);
  close();
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissableMask
    class="shortcut-dialog-modal"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    :header="isEdit ? 'Edit shortcut' : 'New shortcut'"
    :style="{ width: '28rem', minHeight: '35rem' }"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="shortcut-dialog">
      <div class="shortcut-dialog__preview">
        <span class="shortcut-dialog__preview-btn" :style="{ color: previewColor || 'var(--app-muted)' }">
          <component :is="previewIcon" v-if="previewIcon" :size="18" />
          <span v-else class="shortcut-dialog__preview-initials">{{ previewInitials }}</span>
        </span>
      </div>

      <label class="shortcut-dialog__field">
        <span class="shortcut-dialog__label">Name</span>
        <InputText v-model="form.label" placeholder="e.g. GLHF start" />
      </label>

      <label class="shortcut-dialog__field">
        <span class="shortcut-dialog__label">Command</span>
        <InputText v-model="form.command" placeholder="!mp start 5 GLHF" class="shortcut-dialog__mono" />
      </label>

      <label class="shortcut-dialog__field">
        <span class="shortcut-dialog__label">Description (optional)</span>
        <Textarea v-model="form.description" rows="2" autoResize placeholder="Shown as the tooltip - if left blank, the command itself is shown instead" />
      </label>

      <label class="shortcut-dialog__field">
        <span class="shortcut-dialog__label-row">
          <span class="shortcut-dialog__label">Icon (optional)</span>
          <a class="shortcut-dialog__icon-link" href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer"> Browse Lucide icons </a>
        </span>
        <InputText v-model="form.icon" placeholder="lucide icon name, e.g. flag" />
      </label>

      <div class="shortcut-dialog__field">
        <span class="shortcut-dialog__label">Color (optional)</span>
        <div class="shortcut-dialog__color-row">
          <ColorPicker v-model="colorNoHash" />
          <InputText v-model="form.color" placeholder="#a970ff" />
        </div>
      </div>

      <div class="shortcut-dialog__toggle-row">
        <ToggleSwitch v-model="form.warning" inputId="shortcut-warning" class="app-solid-switch" />
        <label for="shortcut-warning">Ask for confirmation before sending</label>
      </div>
    </div>

    <template #footer>
      <Button v-if="isEdit" label="Delete" text severity="danger" class="shortcut-dialog__delete" @click="remove" />
      <Button label="Cancel" text severity="secondary" @click="close" />
      <Button label="Save" :disabled="!canSave" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.shortcut-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.shortcut-dialog__preview {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0 0.75rem;
}

.shortcut-dialog__preview-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.7rem;
  height: 2.7rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  color: var(--app-muted);
  background: var(--app-control);
}

.shortcut-dialog__preview-initials {
  font-family: "Nunito", "Manrope", sans-serif;
  font-weight: 800;
  font-size: 0.8rem;
}

.shortcut-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.shortcut-dialog__label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--app-muted);
}

.shortcut-dialog__label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.shortcut-dialog__icon-link {
  color: var(--app-primary-bright);
  font-size: 0.7rem;
  font-weight: 600;
  text-decoration: none;
  transition: color 160ms ease;
}

.shortcut-dialog__icon-link:hover {
  color: var(--app-text);
  text-decoration: underline;
}

.shortcut-dialog__mono {
  font-family: ui-monospace, Consolas, monospace;
}

.shortcut-dialog__color-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.shortcut-dialog__toggle-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}

.shortcut-dialog__delete {
  margin-right: auto;
}
</style>
