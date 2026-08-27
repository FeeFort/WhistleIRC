<script setup>
import { computed, ref } from "vue";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import { Ban, Crosshair, ShieldCheck, Trash2, Upload } from "@lucide/vue";
import { parseMappool, useMappool } from "../composables/useMappool";

const props = defineProps({ disabled: { type: Boolean, default: false } });
const emit = defineEmits(["send-command"]);
const toast = useToast();
const fileInput = ref(null);
const stateBySlot = ref({});
const { pool, qualificationMode, setPool, clearPool } = useMappool();

const groups = computed(() => {
  if (!pool.value) return [];

  const grouped = new Map();
  pool.value.maps.forEach((map) => {
    if (!grouped.has(map.group)) grouped.set(map.group, []);
    grouped.get(map.group).push(map);
  });

  return [...grouped.entries()]
    .sort(([first], [second]) => groupOrder(first) - groupOrder(second))
    .map(([name, maps]) => ({ name, maps }));
});

function groupOrder(group) {
  const order = ["NM", "HD", "HR", "DT", "HT", "FM", "TB", "Other"].indexOf(
    group,
  );
  return order === -1 ? 999 : order;
}

function openFilePicker() {
  if (props.disabled) return;
  fileInput.value?.click();
}

async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const parsed = parseMappool(await file.text());
    setPool(parsed);
    stateBySlot.value = {};
    const skippedText = parsed.skippedMaps
      ? ` Skipped ${parsed.skippedMaps} invalid map${
          parsed.skippedMaps === 1 ? "" : "s"
        }.`
      : "";
    toast.add({
      severity: "success",
      summary: "Mappool imported",
      detail: `${parsed.maps.length} map${parsed.maps.length === 1 ? "" : "s"} loaded.${skippedText}`,
      life: 3200,
    });
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Mappool import failed",
      detail:
        error instanceof Error ? error.message : "Unable to parse the file.",
      life: 4200,
    });
  }
}

function send(command) {
  if (props.disabled) return;
  emit("send-command", command);
}

function mapState(map) {
  return stateBySlot.value[map.slot] || {};
}

function setMapState(map, patch) {
  stateBySlot.value[map.slot] = {
    ...mapState(map),
    ...patch,
  };
}

function runAction(map, action) {
  if (props.disabled) return;
  const current = mapState(map);

  if (action === "ban") {
    setMapState(map, { banned: !current.banned, picked: false });
    return;
  }

  if (action === "protect") {
    setMapState(map, { protected: !current.protected });
    return;
  }

  if (current.banned) return;
  if (current.picked) {
    setMapState(map, { picked: false });
    return;
  }

  const commands = [
    `!mp map ${map.id}`,
    map.mods.length ? `!mp mods ${map.mods.join(" ")}` : "!mp mods",
    ...map.additionalCommands,
    ...(pool.value?.generalAdditionalCommands || []),
  ];
  commands.forEach(send);
  setMapState(map, { picked: true });
  toast.add({
    severity: "success",
    summary: "Pick commands sent",
    detail: `${map.slot}: ${map.name}`,
    life: 2200,
  });
}

function actionLabel(action) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function clearImportedPool() {
  if (props.disabled) return;
  clearPool();
  stateBySlot.value = {};
}
</script>

<template>
  <div class="mappool-card">
    <input
      ref="fileInput"
      class="mappool-card__file-input"
      type="file"
      accept=".json,application/json"
      @change="importFile"
    />

    <div v-if="pool" class="mappool-card__toolbar">
      <div v-if="pool" class="mappool-card__meta">
        <strong>{{ pool.tournament }}</strong>
        <span>{{ pool.stage }}</span>
      </div>

      <div class="mappool-card__toolbar-actions">
        <Button
          text
          rounded
          aria-label="Import mappool JSON"
          title="Import mappool JSON"
          :disabled="disabled"
          @click="openFilePicker"
        >
          <Upload :size="15" />
        </Button>
        <Button
          v-if="pool"
          text
          rounded
          severity="danger"
          aria-label="Clear mappool"
          title="Clear mappool"
          :disabled="disabled"
          @click="clearImportedPool"
        >
          <Trash2 :size="14" />
        </Button>
      </div>
    </div>

    <div v-if="pool" class="mappool-card__groups">
      <section v-for="group in groups" :key="group.name" class="mappool-group">
        <div class="mappool-group__heading">
          <span>{{ group.name }}</span>
          <span class="mappool-group__count">{{ group.maps.length }}</span>
        </div>

        <div class="mappool-group__maps">
          <article
            v-for="map in group.maps"
            :key="map.slot"
            class="mappool-map"
            :class="{
              'mappool-map--banned': mapState(map).banned,
              'mappool-map--protected': mapState(map).protected,
              'mappool-map--picked': mapState(map).picked,
            }"
          >
            <div class="mappool-map__info">
              <div class="mappool-map__title">
                <span class="mappool-map__slot">{{ map.slot }}</span>
                <span class="mappool-map__name"
                  >{{ map.name }} [{{ map.diff }}]</span
                >
              </div>
              <span class="mappool-map__author"
                >mapped by {{ map.author }}</span
              >
            </div>

            <div class="mappool-map__actions">
              <button
                v-if="!qualificationMode && !mapState(map).protected"
                type="button"
                class="mappool-map__action mappool-map__action--ban"
                :class="{
                  'mappool-map__action--active': mapState(map).banned,
                }"
                :aria-label="`${mapState(map).banned ? 'Unban' : 'Ban'} ${map.slot}`"
                :title="`${mapState(map).banned ? 'Unban' : 'Ban'} ${map.slot}`"
                :disabled="disabled"
                @click="runAction(map, 'ban')"
              >
                <Ban :size="13" />
              </button>
              <button
                v-if="!qualificationMode && !mapState(map).banned"
                type="button"
                class="mappool-map__action mappool-map__action--protect"
                :class="{
                  'mappool-map__action--active': mapState(map).protected,
                }"
                :aria-label="`${actionLabel('protect')} ${map.slot}`"
                :title="`${mapState(map).protected ? 'Unprotect' : 'Protect'} ${map.slot}`"
                :disabled="disabled"
                @click="runAction(map, 'protect')"
              >
                <ShieldCheck :size="13" />
              </button>
              <button
                v-if="!mapState(map).banned"
                type="button"
                class="mappool-map__action mappool-map__action--pick"
                :class="{
                  'mappool-map__action--active': mapState(map).picked,
                }"
                :aria-label="`${actionLabel('pick')} ${map.slot}`"
                :disabled="disabled || mapState(map).banned"
                :title="`${mapState(map).picked ? 'Unpick' : 'Pick'} ${map.slot}`"
                @click="runAction(map, 'pick')"
              >
                <Crosshair :size="13" />
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-else class="mappool-card__empty">
      <Upload :size="22" />
      <span>Import a JSON mappool to see its maps here.</span>
      <Button text size="small" :disabled="disabled" @click="openFilePicker"
        >Import JSON</Button
      >
    </div>
  </div>
</template>

<style scoped>
.mappool-card {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
  width: auto;
  margin-right: -1.2rem;
  overflow-y: auto;
  padding-right: 1.2rem;
}

.mappool-card__toolbar,
.mappool-card__mode-row,
.mappool-map,
.mappool-card__toolbar-actions {
  display: flex;
  align-items: center;
}

.mappool-card__toolbar {
  justify-content: space-between;
  gap: 0.45rem;
  min-width: 0;
}

.mappool-card__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.1rem;
}

.mappool-card__meta strong {
  overflow: hidden;
  color: var(--app-text);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mappool-card__meta span {
  color: var(--app-muted);
  font-size: 0.66rem;
}

.mappool-card__toolbar-actions {
  flex-shrink: 0;
}

.mappool-card__toolbar-actions :deep(.p-button) {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border-color: transparent !important;
  background: transparent !important;
  color: var(--app-primary-bright) !important;
}

.mappool-card__toolbar-actions :deep(.p-button:hover:not(:disabled)) {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}

.mappool-card__toolbar-actions :deep(.p-button.p-button-danger) {
  color: var(--app-red) !important;
}

.mappool-card__toolbar-actions
  :deep(.p-button.p-button-danger:hover:not(:disabled)) {
  background: rgba(255, 109, 120, 0.12) !important;
  color: var(--app-red) !important;
}

.mappool-card__file-input {
  display: none;
}

.mappool-card__mode-row {
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.mappool-card__mode-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--app-muted);
  font-size: 0.68rem;
  font-weight: 700;
}

.mappool-card__groups {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.mappool-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mappool-group__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--app-primary-bright);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.mappool-group__count {
  min-width: 1.25rem;
  padding: 0.1rem 0.3rem;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-muted);
  font-size: 0.6rem;
  text-align: center;
}

.mappool-group__maps {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mappool-map {
  justify-content: space-between;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.45rem 0.35rem;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  opacity: 1;
  transition:
    opacity 220ms ease,
    filter 220ms ease,
    background-color 220ms ease,
    border-color 220ms ease;
}

.mappool-map:hover,
.mappool-map--protected,
.mappool-map--picked {
  border-color: var(--app-border);
  background: rgba(255, 255, 255, 0.025);
}

.mappool-map--banned {
  opacity: 0.42;
  filter: grayscale(0.85);
}

.mappool-map__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.12rem;
}

.mappool-map__title {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
}

.mappool-map__slot {
  flex-shrink: 0;
  color: var(--app-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.6rem;
  font-weight: 700;
}

.mappool-map__name {
  overflow: hidden;
  color: var(--app-text);
  font-size: 0.7rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mappool-map__author {
  overflow: hidden;
  color: var(--app-muted);
  font-size: 0.6rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mappool-map__actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.2rem;
}

.mappool-map__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.3rem;
  background: var(--app-control);
  cursor: pointer;
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.mappool-map__action:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.mappool-map__action--ban {
  color: var(--app-red);
}

.mappool-map__action--protect {
  color: var(--app-amber);
}

.mappool-map__action--pick {
  color: var(--app-green);
}

.mappool-map__action:hover,
.mappool-map__action--active {
  transform: translateY(-1px);
}

.mappool-map__action--ban:hover,
.mappool-map__action--ban.mappool-map__action--active {
  border-color: rgba(255, 109, 120, 0.55);
  background: rgba(255, 109, 120, 0.16);
}

.mappool-map__action--protect:hover,
.mappool-map__action--protect.mappool-map__action--active {
  border-color: rgba(242, 184, 75, 0.55);
  background: rgba(242, 184, 75, 0.16);
}

.mappool-map__action--pick:hover,
.mappool-map__action--pick.mappool-map__action--active {
  border-color: rgba(84, 213, 150, 0.55);
  background: rgba(84, 213, 150, 0.16);
}

.mappool-card__empty {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.4rem 0.4rem 0.35rem;
  color: var(--app-muted);
  font-size: 0.68rem;
  text-align: center;
}

.mappool-card__empty svg {
  color: var(--app-primary-bright);
}

.mappool-card__empty :deep(.p-button) {
  padding: 0.3rem 0.45rem;
  border-color: transparent !important;
  background: transparent !important;
  color: var(--app-primary-bright) !important;
  font-size: 0.68rem;
}

.mappool-card__empty :deep(.p-button:hover:not(:disabled)) {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}

.mappool-card__empty :deep(.p-button:focus-visible) {
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}
</style>
