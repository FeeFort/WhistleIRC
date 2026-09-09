<script setup>
import { ref, computed, watch } from "vue";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import ColorPicker from "primevue/colorpicker";
import ToggleSwitch from "primevue/toggleswitch";
import Button from "primevue/button";
import { FileCheck, FileInput, PenLine, Upload } from "@lucide/vue";
import { useShortcuts } from "../composables/useShortcuts";
import { detectConflicts, parseShortcutsFile } from "../composables/useShortcutImportExport";
import { useToast } from "primevue/usetoast";

const props = defineProps({
  visible: { type: Boolean, default: false },
  shortcut: { type: Object, default: null }, // null = creating a new one
  existingShortcuts: { type: Array, default: () => [] },
  startInImportMode: { type: Boolean, default: false },
  importFile: { type: File, default: null },
  importedShortcuts: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:visible", "save", "delete", "import"]);

const { resolveIcon, normalizeShortcutColor } = useShortcuts();
const toast = useToast();

const isEdit = computed(() => !!props.shortcut);
const importMode = ref(false);
const importedItems = ref([]);
const importError = ref("");
const fileInput = ref(null);
const conflictIndex = ref(0);
const applyToAll = ref(false);
const renameMode = ref(false);
const renameValue = ref("");
const conflictItems = computed(() => importedItems.value.filter((item) => item.conflictsWith));
const currentConflict = computed(() => conflictItems.value[conflictIndex.value] || null);
const importCount = computed(() => importedItems.value.filter((item) => item.resolution !== "skip").length);
const skippedCount = computed(() => importedItems.value.filter((item) => item.resolution === "skip").length);

const form = ref({
  label: "",
  command: "",
  description: "",
  icon: "",
  color: "",
  warning: false,
});

watch(
  () => [props.visible, props.shortcut, props.importFile, props.importedShortcuts],
  async () => {
    if (!props.visible) return;
    importMode.value = props.startInImportMode && !props.shortcut;
    importedItems.value = [];
    conflictIndex.value = 0;
    applyToAll.value = false;
    renameMode.value = false;
    renameValue.value = "";
    importError.value = "";
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
    if (props.visible && props.startInImportMode && props.importedShortcuts.length) {
      const conflicts = detectConflicts(props.importedShortcuts, props.existingShortcuts);
      importedItems.value = conflicts.map((item) => ({ ...item, resolution: item.conflictsWith ? "skip" : "add" }));
      if (!conflicts.some((item) => item.conflictsWith)) finalizeImport();
    } else if (props.visible && props.startInImportMode && props.importFile) {
      await processImportFile({ target: { files: [props.importFile], value: "" } });
    }
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
  if (importMode.value) {
    if (!importCount.value) return;
    emit("import", { items: importedItems.value, skipped: skippedCount.value });
    close();
    return;
  }
  if (!canSave.value) return;
  emit("save", { ...form.value });
  close();
}

function openImportPicker() {
  importError.value = "";
  fileInput.value?.click();
}

async function processImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const result = await parseShortcutsFile(file);
  if (!result.valid) {
    importError.value = "";
    toast.add({ severity: "error", summary: "Import failed", detail: result.errors?.join(" ") || "Unable to import shortcuts", life: 4500 });
    return;
  }
  const conflicts = detectConflicts(result.shortcuts, props.existingShortcuts);
  importedItems.value = conflicts.map((item) => ({ ...item, resolution: item.conflictsWith ? "skip" : "add" }));
  importMode.value = true;
  conflictIndex.value = 0;
  if (!conflicts.some((item) => item.conflictsWith)) finalizeImport();
}

function finalizeImport() {
  emit("import", { items: importedItems.value, skipped: skippedCount.value });
  close();
}

function resolveCurrent(resolution) {
  const current = currentConflict.value;
  if (!current) return finalizeImport();
  if (resolution === "rename") {
    const value = renameValue.value.trim();
    if (!value) return;
    current.imported = { ...current.imported, label: value };
    current.resolution = "rename";
  } else {
    current.resolution = resolution;
  }
  if (applyToAll.value) {
    conflictItems.value.slice(conflictIndex.value + 1).forEach((item) => {
      item.resolution = resolution;
      if (resolution === "rename") item.resolution = "skip";
    });
    return finalizeImport();
  }
  if (conflictIndex.value < conflictItems.value.length - 1) {
    conflictIndex.value += 1;
    renameMode.value = false;
    renameValue.value = "";
    return;
  }
  finalizeImport();
}

function startRename() {
  renameMode.value = true;
  applyToAll.value = false;
  renameValue.value = currentConflict.value?.imported.label || "";
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
    :header="importMode ? 'Import shortcuts' : isEdit ? 'Edit shortcut' : 'New shortcut'"
    :style="{ width: '28rem' }"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="processImportFile" />
    <div v-if="importMode && currentConflict" class="shortcut-dialog shortcut-dialog__import-preview">
      <p class="shortcut-dialog__conflict-title">“{{ currentConflict.imported.label }}” already exists</p>
      <div class="shortcut-dialog__conflict-cards">
        <div class="shortcut-dialog__conflict-card">
          <div class="shortcut-dialog__conflict-label"><FileCheck :size="15" /><span>Existing</span></div>
          <strong>{{ currentConflict.conflictsWith.label }}</strong>
          <code class="shortcut-dialog__mono">{{ currentConflict.conflictsWith.command }}</code>
        </div>
        <div class="shortcut-dialog__conflict-card">
          <div class="shortcut-dialog__conflict-label"><FileInput :size="15" /><span>From import</span></div>
          <div class="shortcut-dialog__import-name">
            <InputText v-if="renameMode" v-model="renameValue" :placeholder="currentConflict.imported.label" />
            <strong v-else>{{ currentConflict.imported.label }}</strong>
            <Button v-if="!renameMode" text rounded aria-label="Rename imported shortcut" @click="startRename">
              <PenLine :size="12" />
            </Button>
          </div>
          <code class="shortcut-dialog__mono">{{ currentConflict.imported.command }}</code>
        </div>
      </div>
      <label class="shortcut-dialog__apply-all" :class="{ 'shortcut-dialog__apply-all--disabled': renameMode }">
        <ToggleSwitch v-model="applyToAll" class="app-solid-switch" :class="{ 'shortcut-dialog__toggle--disabled': renameMode }" :disabled="renameMode" />
        <span>Apply to all remaining conflicts</span>
      </label>
    </div>
    <div v-else-if="importMode" class="shortcut-dialog shortcut-dialog__import-picker">
      <Upload :size="32" aria-hidden="true" />
      <strong>Import shortcuts</strong>
      <span>Choose a JSON file containing your shortcut definitions.</span>
        <Button outlined @click="openImportPicker">
          <Upload :size="15" />
          <span>Choose JSON file</span>
        </Button>
    </div>
    <div v-else class="shortcut-dialog">
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
      <Button v-if="!isEdit && !importMode" label="Import" text severity="secondary" @click="openImportPicker" />
      <small v-if="importError && !importMode" class="shortcut-dialog__footer-error">{{ importError }}</small>
      <Button v-if="isEdit" label="Delete" text severity="danger" class="shortcut-dialog__delete" @click="remove" />
      <span class="shortcut-dialog__footer-right">
        <template v-if="importMode && currentConflict">
          <Button label="Skip" text severity="secondary" @click="resolveCurrent('skip')" />
          <Button :label="renameMode ? 'Add as new' : 'Overwrite'" @click="resolveCurrent(renameMode ? 'rename' : 'overwrite')" />
        </template>
        <Button v-else-if="!importMode" label="Cancel" text severity="secondary" @click="close" />
        <Button v-if="importMode && !importedItems.length" @click="openImportPicker">
          <Upload :size="15" />
          <span>Choose file</span>
        </Button>
        <Button v-else-if="!importMode" label="Save" :disabled="!canSave" @click="save" />
      </span>
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

.shortcut-dialog__footer-right {
  display: flex;
  gap: 0.35rem;
  margin-left: auto;
}

.shortcut-dialog__footer-error {
  margin-left: 0.5rem;
  color: var(--app-danger, #f87171);
  font-size: 0.75rem;
}

.shortcut-dialog__import-preview {
  gap: 1rem;
}

.shortcut-dialog__conflict-title {
  margin: 0;
  color: var(--app-muted);
  font-size: 0.8rem;
}

.shortcut-dialog__conflict-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.shortcut-dialog__conflict-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.8rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-control);
}

.shortcut-dialog__conflict-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--app-muted);
  font-size: 0.68rem;
  font-weight: 700;
}

.shortcut-dialog__conflict-label svg { color: var(--app-muted); }
.shortcut-dialog__conflict-card strong { overflow: hidden; color: var(--app-text); font-size: 0.8rem; text-overflow: ellipsis; white-space: nowrap; }
.shortcut-dialog__conflict-card code { overflow: hidden; color: var(--app-muted); font-size: 0.7rem; text-overflow: ellipsis; white-space: nowrap; }
.shortcut-dialog__conflict-card .p-inputtext { width: 100%; min-width: 0; }
.shortcut-dialog__import-name { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
.shortcut-dialog__import-name .p-button { width: 1.35rem; height: 1.35rem; flex-shrink: 0; padding: 0; color: var(--app-muted); }
.shortcut-dialog__import-name .p-button:hover { color: var(--app-primary-bright); }

.shortcut-dialog__apply-all { display: flex; align-items: center; gap: 0.55rem; color: var(--app-muted); font-size: 0.76rem; }
.shortcut-dialog__apply-all--disabled { color: var(--app-muted); }
.shortcut-dialog__apply-all--disabled > span { opacity: 0.42; }
.shortcut-dialog__apply-all--disabled .shortcut-dialog__toggle--disabled,
.shortcut-dialog__apply-all--disabled .shortcut-dialog__toggle--disabled :deep(.p-toggleswitch-slider),
.shortcut-dialog__apply-all--disabled .shortcut-dialog__toggle--disabled :deep(.p-toggleswitch-handle) {
  opacity: 0.42 !important;
  filter: saturate(0.35) !important;
}

.shortcut-dialog__conflict-actions { display: flex; gap: 0.6rem; }
.shortcut-dialog__conflict-actions .p-button { flex: 1 1 0; justify-content: center; }

.shortcut-dialog__rename-link {
  align-self: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 0.72rem;
  text-decoration: underline;
  text-underline-offset: 0.15rem;
  cursor: pointer;
}

.shortcut-dialog__rename-link:hover { color: var(--app-text); }

.shortcut-dialog__import-picker {
  align-items: center;
  justify-content: center;
  min-height: 22rem;
  color: var(--app-muted);
  text-align: center;
}

.shortcut-dialog__import-picker svg {
  color: var(--app-primary-bright);
}

.shortcut-dialog__import-picker strong {
  color: var(--app-text);
  font-size: 1rem;
}

.shortcut-dialog__import-picker span {
  max-width: 18rem;
  font-size: 0.78rem;
}

.shortcut-dialog__import-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--app-muted);
  font-size: 0.75rem;
}

.shortcut-dialog__import-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 22rem;
  overflow: auto;
}

.shortcut-dialog__import-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem;
  border: 1px solid var(--app-border);
  border-radius: 0.5rem;
  background: var(--app-control);
}

.shortcut-dialog__import-item > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.2rem;
}

.shortcut-dialog__import-item strong,
.shortcut-dialog__import-item code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut-dialog__import-item strong {
  color: var(--app-text);
  font-size: 0.78rem;
}

.shortcut-dialog__import-item code {
  color: var(--app-muted);
  font-size: 0.7rem;
}

.shortcut-dialog__import-conflict {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
}

.shortcut-dialog__import-conflict > span,
.shortcut-dialog__import-added {
  color: var(--app-danger, #f87171);
  font-size: 0.65rem;
  white-space: nowrap;
}

.shortcut-dialog__import-added {
  color: var(--app-muted);
}
</style>
