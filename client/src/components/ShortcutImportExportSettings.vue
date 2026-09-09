<script setup>
import { ref } from "vue";
import Button from "primevue/button";
import { Download, Upload } from "@lucide/vue";
import { useToast } from "primevue/usetoast";
import { useShortcuts } from "../composables/useShortcuts";
import { exportShortcuts, normalizeShortcutName, parseShortcutsFile } from "../composables/useShortcutImportExport";
import ShortcutEditDialog from "./ShortcutEditDialog.vue";

const { customShortcuts, addCustomShortcut, updateCustomShortcut } = useShortcuts();
const toast = useToast();
const importVisible = ref(false);
const importFile = ref(null);
const importInput = ref(null);
const importedShortcuts = ref([]);

function exportCurrentShortcuts() {
  exportShortcuts(customShortcuts.value);
  toast.add({ severity: "success", summary: "Shortcuts exported", detail: `Exported ${customShortcuts.value.length} shortcuts`, life: 3500 });
}

function openImportPicker() {
  importInput.value?.click();
}

async function handleFileSelected(event) {
  const file = event.target.files?.[0] || null;
  event.target.value = "";
  if (!file) return;
  const result = await parseShortcutsFile(file);
  if (!result.valid) {
    toast.add({ severity: "error", summary: "Import failed", detail: result.errors?.join(" ") || "Unable to import shortcuts", life: 4500 });
    return;
  }
  importFile.value = file;
  importedShortcuts.value = result.shortcuts;
  importVisible.value = true;
}

function handleImport({ items, skipped }) {
  const usedNames = new Set(customShortcuts.value.map((shortcut) => normalizeShortcutName(shortcut.label)));
  let imported = 0;
  items.forEach(({ imported: item, conflictsWith, resolution }) => {
    if (resolution === "skip") return;
    if (resolution === "overwrite" && conflictsWith) {
      updateCustomShortcut(conflictsWith.id, item);
    } else {
      let data = item;
      if (resolution === "rename") {
        const base = item.label;
        let suffix = 2;
        while (usedNames.has(normalizeShortcutName(data.label))) data = { ...item, label: `${base} (${suffix++})` };
      }
      addCustomShortcut(data);
      usedNames.add(normalizeShortcutName(data.label));
    }
    imported += 1;
  });
  toast.add({ severity: "success", summary: "Shortcuts imported", detail: `Imported ${imported} shortcuts, skipped ${skipped} duplicates`, life: 3500 });
}
</script>

<template>
  <div class="shortcut-import-export-settings">
    <div class="settings-page__setting">
      <div class="settings-page__setting-info">
        <h3>Import shortcuts</h3>
        <p>Load shortcut definitions from a WhistleIRC JSON file.</p>
      </div>
      <div class="settings-page__setting-control">
        <input ref="importInput" type="file" accept=".json,application/json" hidden @change="handleFileSelected" />
        <Button text size="small" severity="secondary" @click="openImportPicker">
          <Upload :size="15" />
          <span>Import</span>
        </Button>
      </div>
    </div>
    <div class="settings-page__setting">
      <div class="settings-page__setting-info">
        <h3>Export shortcuts</h3>
        <p>Save your current shortcuts as a JSON file for backup or sharing.</p>
      </div>
      <div class="settings-page__setting-control">
        <Button text size="small" severity="secondary" :disabled="!customShortcuts.length" @click="exportCurrentShortcuts">
          <Download :size="15" />
          <span>Export</span>
        </Button>
      </div>
    </div>
  </div>
  <ShortcutEditDialog
    v-model:visible="importVisible"
    start-in-import-mode
    :import-file="importFile"
    :imported-shortcuts="importedShortcuts"
    :existing-shortcuts="customShortcuts"
    @import="handleImport"
  />
</template>

<style scoped>
.shortcut-import-export-settings { display: flex; flex-direction: column; gap: 0; width: 100%; }
.shortcut-import-export-settings .settings-page__setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  width: 100%;
  margin: 0;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--app-border);
}
.shortcut-import-export-settings .settings-page__setting-info { min-width: 0; }
.shortcut-import-export-settings .settings-page__setting-info h3 { margin: 0; color: var(--app-text); font-size: 0.85rem !important; font-weight: 800; }
.shortcut-import-export-settings .settings-page__setting-info p { max-width: 34rem; margin: 0.35rem 0 0; color: var(--app-muted) !important; font-size: 0.76rem !important; line-height: 1.5; }
.shortcut-import-export-settings .settings-page__setting-control { display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; }
.shortcut-import-export-settings .settings-page__setting:last-child { border-bottom: 0; }
.shortcut-import-export-settings :deep(.p-button) {
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  color: var(--app-muted);
  font-size: 0.72rem;
}
.shortcut-import-export-settings :deep(.p-button.p-button-text:hover:not(:disabled)) {
  border-color: transparent !important;
  color: var(--app-primary-bright) !important;
  background: rgba(var(--app-primary-rgb), 0.12) !important;
}
@media (max-width: 700px) {
  .shortcut-import-export-settings .settings-page__setting { align-items: flex-start; flex-direction: column; gap: 0.75rem; }
  .shortcut-import-export-settings .settings-page__setting-control { justify-content: flex-start; }
}
</style>
