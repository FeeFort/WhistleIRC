<script setup>
import { computed } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import ProgressBar from "primevue/progressbar";
import { Download, Link, RefreshCw } from "@lucide/vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: "available" },
  currentVersion: { type: String, default: "" },
  latestVersion: { type: String, default: "" },
  releaseNotesUrl: { type: String, default: "" },
  downloadedBytes: { type: Number, default: 0 },
  totalBytes: { type: Number, default: 0 },
  speedBytesPerSecond: { type: Number, default: 0 },
});

const emit = defineEmits(["update:visible", "update", "cancel"]);

const progress = computed(() => (props.totalBytes > 0 ? Math.min(100, (props.downloadedBytes / props.totalBytes) * 100) : 0));
const downloadedMb = computed(() => formatMb(props.downloadedBytes));
const totalMb = computed(() => formatMb(props.totalBytes));
const speedMb = computed(() => `${formatMb(props.speedBytesPerSecond)} MB/s`);
const eta = computed(() => {
  if (!props.speedBytesPerSecond || props.totalBytes <= props.downloadedBytes) return "calculating";
  return formatDuration((props.totalBytes - props.downloadedBytes) / props.speedBytesPerSecond);
});

function formatMb(bytes) {
  return (Math.max(0, Number(bytes) || 0) / 1024 / 1024).toFixed(1);
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  if (value < 60) return `${value}s`;
  return `${Math.floor(value / 60)}m ${value % 60}s`;
}

function openReleaseNotes() {
  if (props.releaseNotesUrl) window.open(props.releaseNotesUrl, "_blank", "noopener,noreferrer");
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="mode === 'available'"
    :dismissable-mask="mode === 'available'"
    class="update-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    :style="{ width: '28rem' }"
    @update:visible="(value) => emit('update:visible', value)"
  >
    <template #header>
      <div class="update-dialog__heading">
        <Download v-if="mode === 'available'" :size="20" />
        <RefreshCw v-else :size="20" class="update-dialog__spin" />
        <h2>{{ mode === "available" ? "Update available" : mode === "downloading" ? "Downloading update" : "Installing update" }}</h2>
      </div>
    </template>
    <div v-if="mode === 'available'" class="update-dialog__content">
      <p class="update-dialog__subtitle">The new version is out!</p>
      <p class="update-dialog__versions">{{ currentVersion }} → {{ latestVersion }}</p>
      <button v-if="releaseNotesUrl" type="button" class="update-dialog__release-link" @click="openReleaseNotes"><Link :size="15" /> <span>View release notes</span></button>
      <div class="update-dialog__actions">
        <Button label="Later" text severity="secondary" @click="emit('update:visible', false)" />
        <Button label="Update now" @click="emit('update')" />
      </div>
    </div>
    <div v-else-if="mode === 'downloading'" class="update-dialog__content">
      <p class="update-dialog__subtitle">Don't close the app while this is in progress</p>
      <div class="update-dialog__progress-meta"><span>{{ downloadedMb }} MB of {{ totalMb }} MB</span><strong>{{ Math.round(progress) }}%</strong></div>
      <ProgressBar :value="progress" :show-value="false" class="update-dialog__progress" />
      <p class="update-dialog__download-meta">{{ speedMb }} · {{ eta }} left</p>
      <Button label="Cancel" text severity="secondary" class="update-dialog__cancel" @click="emit('cancel')" />
    </div>
    <div v-else class="update-dialog__content">
      <p class="update-dialog__subtitle">The update is being installed now.</p>
      <p class="update-dialog__installing-message">This window will close shortly and the updated app will open. Please wait.</p>
    </div>
  </Dialog>
</template>

<style scoped>
.update-dialog__content { display: flex; flex-direction: column; gap: 0.55rem; }
.update-dialog__heading { display: flex; align-items: center; gap: 0.6rem; }
.update-dialog__heading svg { color: var(--app-primary-bright); }
.update-dialog__heading h2 { margin: 0; color: var(--app-text); font-size: 1rem; font-weight: 800; }
.update-dialog__subtitle { margin: 0.1rem 0 0; color: var(--app-muted); font-size: 0.8rem; }
.update-dialog__versions { margin: 0; color: var(--app-muted); opacity: 0.7; font-size: 0.72rem; }
.update-dialog__release-link { display: inline-flex; align-items: center; gap: 0.35rem; align-self: flex-start; margin-top: 0.65rem; padding: 0; border: 0; background: transparent; color: var(--app-primary-bright); font: inherit; font-size: 0.78rem; cursor: pointer; }
.update-dialog__release-link:hover { text-decoration: underline; }
.update-dialog__actions { display: flex; gap: 0.55rem; margin-top: 1rem; }
.update-dialog__actions .p-button { flex: 1 1 0; justify-content: center; }
.update-dialog__progress-meta { display: flex; justify-content: space-between; margin-top: 1rem; color: var(--app-muted); font-size: 0.78rem; }
.update-dialog__progress-meta strong { color: var(--app-text); }
.update-dialog__progress { height: 0.5rem; margin-top: 0.05rem; overflow: hidden; border-radius: 999px; }
.update-dialog__download-meta { margin: 0.05rem 0 0.75rem; color: var(--app-muted); opacity: 0.72; font-size: 0.72rem; }
.update-dialog__cancel { align-self: flex-end; }
.update-dialog__installing-message { margin: 0.2rem 0 0.35rem; color: var(--app-muted); font-size: 0.78rem; line-height: 1.45; }
.update-dialog__spin { animation: update-dialog-spin 1.2s linear infinite; }
@keyframes update-dialog-spin { to { transform: rotate(360deg); } }
</style>
