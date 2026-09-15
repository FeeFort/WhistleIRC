<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import { Ban, ChevronDown, Crosshair, ShieldCheck, Settings } from "@lucide/vue";
import { useMappool } from "../composables/useMappool";
import { useServerConnection } from "../composables/useServerConnection";
import MappoolsModal from "./MappoolsModal.vue";

const props = defineProps({
  disabled: { type: Boolean, default: false },
  lobbyId: { type: String, default: "" },
  qualificationMode: { type: Boolean, default: false },
});
const emit = defineEmits(["send-command", "pick-map"]);
const toast = useToast();
const mappoolsVisible = ref(false);
const poolMenuOpen = ref(false);
const poolSearch = ref("");
const poolTrigger = ref(null);
const poolMenu = ref(null);
const poolMenuStyle = ref({});
const { mappools, getActivePool, setActivePool, getMapState, setMapState } = useMappool();
const { setActiveWinCondition } = useServerConnection();
const lobbyKey = computed(() => props.lobbyId || "");
const activePool = computed(() => getActivePool(lobbyKey.value));
const filteredMappools = computed(() => {
  const query = poolSearch.value.trim().toLowerCase();
  if (!query) return mappools.value;
  return mappools.value.filter((pool) => `${pool.name} ${pool.stage}`.toLowerCase().includes(query));
});

const groups = computed(() => {
  if (!activePool.value) return [];

  const grouped = new Map();
  activePool.value.slots.forEach((slot) => {
    const group = slot.category || "Other";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(slot);
  });

  return [...grouped.entries()].sort(([first], [second]) => groupOrder(first) - groupOrder(second)).map(([name, maps]) => ({ name, maps }));
});

function groupOrder(group) {
  const order = ["NM", "HD", "HR", "DT", "HT", "FM", "TB", "Other"].indexOf(group);
  return order === -1 ? 999 : order;
}

function send(command) {
  if (props.disabled) return;
  emit("send-command", command);
}

function mapState(slot) {
  return getMapState(lobbyKey.value, slot.slotId);
}

function runAction(slot, action) {
  if (props.disabled) return;
  const current = mapState(slot);

  if (action === "ban") {
    setMapState(lobbyKey.value, slot.slotId, { banned: !current.banned, picked: false });
    return;
  }

  if (action === "protect") {
    setMapState(lobbyKey.value, slot.slotId, { protected: !current.protected });
    return;
  }

  if (current.banned) return;
  if (current.picked) {
    setMapState(lobbyKey.value, slot.slotId, { picked: false });
    return;
  }

  const commands = [
    `!mp map ${slot.beatmapId} ${rulesetNumber(activePool.value?.ruleset)}`,
    slot.mods.length ? `!mp mods ${slot.mods.join(" ")}` : "!mp mods",
    ...slot.commands,
    ...(activePool.value?.globalCommands || []),
  ];
  commands.forEach(send);
  setActiveWinCondition(props.lobbyId, slot.beatmapId, slot.winCondition?.source || null);
  setMapState(lobbyKey.value, slot.slotId, { picked: true });
  emit("pick-map", { ...slot, pickedBy: current.team || null });
  toast.add({
    severity: "success",
    summary: "Pick commands sent",
    detail: `${slot.slotId}: ${slot.beatmapId}`,
    life: 2200,
  });
}

function actionLabel(action) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function rulesetNumber(ruleset) {
  return ({ osu: 0, taiko: 1, fruits: 2, mania: 3 }[ruleset] ?? Number(ruleset)) || 0;
}

async function togglePoolMenu() {
  if (props.disabled || !props.lobbyId) return;
  poolMenuOpen.value = !poolMenuOpen.value;
  if (poolMenuOpen.value) {
    await nextTick();
    updatePoolMenuPosition();
    poolMenu.value?.querySelector("input")?.focus();
  }
}

function updatePoolMenuPosition() {
  if (!poolMenuOpen.value || !poolTrigger.value) return;
  const triggerRect = poolTrigger.value.getBoundingClientRect();
  poolMenuStyle.value = {
    top: `${triggerRect.bottom + 8}px`,
    left: `${triggerRect.left + triggerRect.width / 2}px`,
  };
}

function selectPool(poolId) {
  setActivePool(props.lobbyId, poolId);
  poolMenuOpen.value = false;
  poolSearch.value = "";
}

function closePoolMenu(event) {
  if (poolMenuOpen.value && !poolTrigger.value?.contains(event.target) && !poolMenu.value?.contains(event.target)) poolMenuOpen.value = false;
}

function handlePoolMenuEscape(event) {
  if (event.key === "Escape" && poolMenuOpen.value) {
    event.preventDefault();
    poolMenuOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("mousedown", closePoolMenu);
  document.addEventListener("keydown", handlePoolMenuEscape);
  window.addEventListener("resize", updatePoolMenuPosition);
  window.addEventListener("scroll", updatePoolMenuPosition, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", closePoolMenu);
  document.removeEventListener("keydown", handlePoolMenuEscape);
  window.removeEventListener("resize", updatePoolMenuPosition);
  window.removeEventListener("scroll", updatePoolMenuPosition, true);
});
</script>

<template>
  <div class="mappool-card">
    <div class="mappool-card__toolbar">
      <div ref="poolMenu" class="mappool-card__meta mappool-card__pool-select">
        <button ref="poolTrigger" type="button" class="mappool-card__pool-trigger" :disabled="disabled || !lobbyId" :aria-expanded="poolMenuOpen" aria-haspopup="listbox" @click="togglePoolMenu">
          <strong>{{ activePool?.name || "No active mappool" }}</strong>
          <ChevronDown :size="14" class="mappool-card__pool-chevron" :class="{ 'mappool-card__pool-chevron--open': poolMenuOpen }" />
        </button>
        <span>{{ activePool?.stage || "Select a mappool for this lobby" }}</span>
        <Teleport to="body">
          <Transition name="mappool-pool-menu">
            <div v-if="poolMenuOpen" ref="poolMenu" class="mappool-card__pool-menu" :style="poolMenuStyle" role="listbox" aria-label="Select mappool">
              <input v-model="poolSearch" type="search" class="mappool-card__pool-search" placeholder="Search mappools" aria-label="Search mappools" />
              <div class="mappool-card__pool-options">
                <button
                  v-for="poolOption in filteredMappools"
                  :key="poolOption.id"
                  type="button"
                  class="mappool-card__pool-option"
                  :class="{ 'mappool-card__pool-option--selected': poolOption.id === activePool?.id }"
                  role="option"
                  :aria-selected="poolOption.id === activePool?.id"
                  @click="selectPool(poolOption.id)"
                >
                  <strong>{{ poolOption.name }}</strong>
                  <small>{{ poolOption.stage }}</small>
                </button>
                <span v-if="!filteredMappools.length" class="mappool-card__pool-empty">No mappools found.</span>
              </div>
            </div>
          </Transition>
        </Teleport>
      </div>
      <div class="mappool-card__toolbar-actions">
        <Button text rounded class="mappool-card__settings" aria-label="Open mappools" title="Open mappools" :disabled="disabled" @click="mappoolsVisible = true"><Settings :size="16" /></Button>
      </div>
    </div>
    <MappoolsModal v-model:visible="mappoolsVisible" />

    <div v-if="activePool" class="mappool-card__groups">
      <section v-for="group in groups" :key="group.name" class="mappool-group">
        <div class="mappool-group__heading">
          <span>{{ group.name }}</span>
          <span class="mappool-group__count">{{ group.maps.length }}</span>
        </div>

        <div class="mappool-group__maps">
          <article
            v-for="map in group.maps"
            :key="map.slotId"
            class="mappool-map"
            :class="{
              'mappool-map--banned': mapState(map).banned,
              'mappool-map--protected': mapState(map).protected,
              'mappool-map--picked': mapState(map).picked,
            }"
          >
            <div class="mappool-map__info">
              <div class="mappool-map__title">
                <span class="mappool-map__slot">{{ map.slotId }}</span>
                <span class="mappool-map__name">{{ map.preview?.title || `Beatmap ${map.beatmapId}` }} [{{ map.preview?.diff || "" }}]</span>
              </div>
              <span class="mappool-map__author">mapped by {{ map.preview?.author || "unknown" }}</span>
            </div>

            <div class="mappool-map__actions">
              <button
                v-if="!qualificationMode && !mapState(map).protected"
                type="button"
                class="mappool-map__action mappool-map__action--ban"
                :class="{
                  'mappool-map__action--active': mapState(map).banned,
                }"
                :aria-label="`${mapState(map).banned ? 'Unban' : 'Ban'} ${map.slotId}`"
                :title="`${mapState(map).banned ? 'Unban' : 'Ban'} ${map.slotId}`"
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
                :aria-label="`${actionLabel('protect')} ${map.slotId}`"
                :title="`${mapState(map).protected ? 'Unprotect' : 'Protect'} ${map.slotId}`"
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
                :aria-label="`${actionLabel('pick')} ${map.slotId}`"
                :disabled="disabled || mapState(map).banned"
                :title="`${mapState(map).picked ? 'Unpick' : 'Pick'} ${map.slotId}`"
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
      <Settings :size="22" />
      <span>Select an active mappool for this lobby.</span>
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
  overflow: visible;
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

.mappool-card__pool-select {
  position: relative;
  max-width: min(100%, 16rem);
}

.mappool-card__pool-trigger {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  max-width: 100%;
  gap: 0.28rem;
  min-width: 0;
  padding: 0.08rem 0.25rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transform: translateX(-0.25rem);
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.mappool-card__pool-trigger:hover:not(:disabled),
.mappool-card__pool-trigger[aria-expanded="true"] {
  border-color: var(--app-border);
  background: rgba(var(--app-primary-rgb), 0.08);
  box-shadow: 0 0 0 1px var(--app-border);
}

.mappool-card__pool-trigger[aria-expanded="true"] {
  box-shadow: 0 0 0 0.12rem rgba(var(--app-primary-rgb), 0.12);
}

.mappool-card__pool-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.mappool-card__pool-trigger strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mappool-card__pool-chevron {
  flex-shrink: 0;
  color: var(--app-muted);
  transition: transform 160ms ease;
}

.mappool-card__pool-chevron--open {
  transform: rotate(180deg);
}

.mappool-card__pool-menu {
  position: fixed;
  z-index: 30;
  width: min(12rem, calc(100vw - 2rem));
  padding: 0.4rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-surface-raised);
  box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.35);
  transform: translateX(-50%);
  transform-origin: top center;
}

.mappool-card__pool-search {
  width: 100%;
  min-width: 0;
  padding: 0.48rem 0.6rem;
  border: 1px solid var(--app-border);
  border-radius: 0.45rem;
  background: var(--app-control);
  color: var(--app-text);
  font: inherit;
  font-size: 0.68rem;
}

.mappool-card__pool-search:focus {
  border-color: var(--app-primary-bright);
  outline: none;
  box-shadow: 0 0 0 0.1rem rgba(var(--app-primary-rgb), 0.14);
}

.mappool-card__pool-search::placeholder {
  color: var(--app-muted);
}

.mappool-card__pool-options {
  display: flex;
  flex-direction: column;
  max-height: 15rem;
  gap: 0.15rem;
  margin-top: 0.35rem;
  overflow-y: auto;
}

.mappool-card__pool-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.7rem;
  padding: 0.48rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 0.7rem;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.mappool-card__pool-option:hover,
.mappool-card__pool-option--selected {
  border-color: rgba(var(--app-primary-rgb), 0.25);
  background: rgba(var(--app-primary-rgb), 0.12);
}

.mappool-card__pool-option--selected {
  color: var(--app-primary-bright);
}

.mappool-card__pool-option strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mappool-card__pool-option small {
  flex-shrink: 0;
  color: var(--app-muted);
  font-size: 0.62rem;
}

.mappool-card__pool-empty {
  padding: 0.65rem 0.6rem;
  color: var(--app-muted);
  font-size: 0.68rem;
  text-align: center;
}

.mappool-pool-menu-enter-active,
.mappool-pool-menu-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.mappool-pool-menu-enter-from,
.mappool-pool-menu-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-0.35rem) scale(0.98);
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

.mappool-card__toolbar-actions :deep(.p-button.p-button-danger:hover:not(:disabled)) {
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
  flex: 1 1 auto;
  min-height: 0;
  gap: 0.8rem;
  overflow-y: auto;
  padding-right: 0.35rem;
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
