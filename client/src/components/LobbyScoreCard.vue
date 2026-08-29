<script setup>
import { computed, ref } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import SelectButton from "primevue/selectbutton";
import { Check, Copy, Send, SlidersHorizontal } from "@lucide/vue";
import { useChatSettings } from "../composables/useChatSettings";

const props = defineProps({
  teamAName: { type: String, default: "Team A" },
  teamBName: { type: String, default: "Team B" },
  teamAScore: { type: Number, default: 0 },
  teamBScore: { type: Number, default: 0 },
  bestOf: { type: Number, default: null },
  nextPickTeam: { type: String, default: null },
  canEdit: { type: Boolean, default: false },
  showMatchControls: { type: Boolean, default: true },
  mpLink: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:teamAScore", "update:teamBScore", "send-result", "update-settings"]);

const { redTeamColor, blueTeamColor } = useChatSettings();
const copied = ref(false);
const settingsVisible = ref(false);
const draftBestOf = ref(null);
const draftNextPickTeam = ref(null);
let copiedTimer;

const nextPickOptions = computed(() => [props.teamAName, props.teamBName].filter((team, index, teams) => team && teams.indexOf(team) === index));
const settingsValid = computed(() => draftBestOf.value === null || (Number.isInteger(draftBestOf.value) && draftBestOf.value > 0));
const winningScore = computed(() => (Number.isInteger(props.bestOf) && props.bestOf > 0 ? Math.ceil(props.bestOf / 2) : null));

const leader = computed(() => {
  if (props.teamAScore === props.teamBScore) return null;
  return props.teamAScore > props.teamBScore ? "a" : "b";
});

function changeScore(team, delta) {
  if (!props.canEdit) return;

  const prop = team === "a" ? "teamAScore" : "teamBScore";
  const event = team === "a" ? "update:teamAScore" : "update:teamBScore";
  const nextScore = Math.max(0, Math.min(winningScore.value ?? Number.POSITIVE_INFINITY, props[prop] + delta));
  if (nextScore === props[prop]) return;
  emit(event, nextScore);
}

function onScoreClick(team) {
  changeScore(team, 1);
}

function onScoreContextMenu(event, team) {
  event.preventDefault();
  changeScore(team, -1);
}

function sendResult() {
  emit("send-result", {
    teamAName: props.teamAName,
    teamBName: props.teamBName,
    teamAScore: props.teamAScore,
    teamBScore: props.teamBScore,
  });
}

function openSettings() {
  draftBestOf.value = props.bestOf;
  draftNextPickTeam.value = nextPickOptions.value.includes(props.nextPickTeam) ? props.nextPickTeam : nextPickOptions.value[0] || null;
  settingsVisible.value = true;
}

function saveSettings() {
  if (!settingsValid.value) return;
  emit("update-settings", {
    bestOf: draftBestOf.value,
    nextPickTeam: draftNextPickTeam.value,
  });
  settingsVisible.value = false;
}

async function copyMpLink() {
  const link = props.mpLink || window.location.href;

  try {
    await navigator.clipboard.writeText(link);
  } catch {
    const input = document.createElement("textarea");
    input.value = link;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  copied.value = true;
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copied.value = false;
  }, 1600);
}
</script>

<template>
  <div
    class="lobby-score-card"
    :class="{
      'lobby-score-card--red-leads': leader === 'a',
      'lobby-score-card--blue-leads': leader === 'b',
    }"
  >
    <div v-if="showMatchControls" class="lobby-score-card__scoreline">
      <button
        type="button"
        class="lobby-score-card__team-control lobby-score-card__team-control--red"
        :class="{
          'lobby-score-card__score--editable': canEdit,
          'lobby-score-card__team-control--leading': leader === 'a',
        }"
        :disabled="disabled || !canEdit"
        :aria-label="`${teamAName}, score ${teamAScore}`"
        @click="onScoreClick('a')"
        @contextmenu="onScoreContextMenu($event, 'a')"
      >
        <span class="lobby-score-card__team">{{ teamAName }}</span>
        <strong class="lobby-score-card__score">{{ teamAScore }}</strong>
      </button>
      <span class="lobby-score-card__separator">-</span>
      <button
        type="button"
        class="lobby-score-card__team-control lobby-score-card__team-control--blue"
        :class="{
          'lobby-score-card__score--editable': canEdit,
          'lobby-score-card__team-control--leading': leader === 'b',
        }"
        :disabled="disabled || !canEdit"
        :aria-label="`${teamBName}, score ${teamBScore}`"
        @click="onScoreClick('b')"
        @contextmenu="onScoreContextMenu($event, 'b')"
      >
        <strong class="lobby-score-card__score">{{ teamBScore }}</strong>
        <span class="lobby-score-card__team">{{ teamBName }}</span>
      </button>
    </div>

    <Button v-if="showMatchControls" label="Send Result" class="lobby-score-card__send" :disabled="disabled || !canEdit" @click="sendResult">
      <Send :size="14" />
      <span>Send Result</span>
    </Button>

    <Button label="Lobby Settings" text class="lobby-score-card__settings" :disabled="disabled" @click="openSettings">
      <SlidersHorizontal :size="14" />
      <span>Lobby Settings</span>
    </Button>

    <Button :label="copied ? 'Copied' : 'Copy MP Link'" text class="lobby-score-card__copy" :disabled="disabled" @click="copyMpLink">
      <Check v-if="copied" :size="14" />
      <Copy v-else :size="14" />
      <span>{{ copied ? "Copied" : "Copy MP Link" }}</span>
    </Button>
  </div>

  <Dialog v-model:visible="settingsVisible" modal dismissableMask class="lobby-settings-dialog" header="Lobby settings" :style="{ width: '26rem' }" :pt="{ mask: { class: 'app-dialog-mask' } }">
    <div class="lobby-settings__body">
      <label class="lobby-settings__field">
        <span>Best of</span>
        <InputNumber v-model="draftBestOf" :min="1" :max="99" :use-grouping="false" inputId="lobby-settings-best-of" />
      </label>

      <div class="lobby-settings__field">
        <span>Next pick</span>
        <SelectButton v-model="draftNextPickTeam" :options="nextPickOptions" :allow-empty="false" aria-label="Next pick team" />
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="settingsVisible = false" />
      <Button label="Save" :disabled="!settingsValid" @click="saveSettings" />
    </template>
  </Dialog>
</template>

<style scoped>
.lobby-score-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  overflow: visible;
  isolation: isolate;
}

.lobby-score-card::before {
  position: absolute;
  z-index: 0;
  top: -3.25rem;
  bottom: -1.15rem;
  left: -1.55rem;
  width: calc(65% + 1.55rem);
  border-radius: 0;
  background: transparent;
  content: "";
  opacity: 0;
  filter: blur(0.7rem);
  transition:
    left 360ms ease,
    right 360ms ease,
    background-color 360ms ease,
    box-shadow 360ms ease,
    opacity 360ms ease;
}

.lobby-score-card--red-leads::before {
  background: linear-gradient(90deg, v-bind(redTeamColor) 0%, v-bind(redTeamColor) 22%, transparent 100%);
  opacity: 0.18;
}

.lobby-score-card--blue-leads::before {
  right: -1.55rem;
  left: auto;
  background: linear-gradient(270deg, v-bind(blueTeamColor) 0%, v-bind(blueTeamColor) 22%, transparent 100%);
  opacity: 0.18;
}

.lobby-score-card > * {
  position: relative;
  z-index: 1;
}

.lobby-score-card__scoreline {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.38rem;
  min-width: 0;
  font-size: 0.88rem;
  font-weight: 800;
}

.lobby-score-card__team {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby-score-card__team-control--red {
  color: v-bind(redTeamColor);
}

.lobby-score-card__team-control--blue {
  color: v-bind(blueTeamColor);
}

.lobby-score-card__team-control {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  min-width: 0;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  font: inherit;
  line-height: 1.3;
}

.lobby-score-card__team-control--red {
  justify-content: flex-end;
}

.lobby-score-card__team-control--blue {
  justify-content: flex-start;
}

.lobby-score-card__score--editable {
  cursor: pointer;
}

.lobby-score-card__score--editable:hover,
.lobby-score-card__score--editable:focus-visible {
  background: var(--app-surface-hover);
  outline: none;
}

.lobby-score-card__team-control:disabled {
  opacity: 1;
}

.lobby-score-card__score {
  min-width: 1.15rem;
}

.lobby-score-card__separator {
  color: var(--app-muted);
}

.lobby-score-card__send {
  align-self: stretch;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.15rem;
  border-color: var(--app-primary) !important;
  background: var(--app-primary) !important;
  color: var(--app-bg) !important;
  font-size: 0.74rem;
  font-weight: 800;
}

.lobby-score-card__send:hover:not(:disabled) {
  border-color: var(--app-primary-bright) !important;
  background: var(--app-primary-bright) !important;
}

.lobby-score-card__send:disabled {
  opacity: 0.55;
}

.lobby-score-card__copy {
  align-self: stretch;
  justify-content: center;
  gap: 0.4rem;
  min-height: 1.9rem;
  color: var(--app-muted) !important;
  font-size: 0.7rem;
}

.lobby-score-card__copy:hover {
  color: var(--app-primary-bright) !important;
  background: rgba(var(--app-primary-rgb), 0.1) !important;
}

.lobby-score-card__settings {
  align-self: stretch;
  justify-content: center;
  gap: 0.4rem;
  min-height: 1.9rem;
  color: var(--app-muted) !important;
  font-size: 0.7rem;
}

.lobby-score-card__settings:hover {
  color: var(--app-primary-bright) !important;
  background: rgba(var(--app-primary-rgb), 0.1) !important;
}

.lobby-settings__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.lobby-settings__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.lobby-settings__field > span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.lobby-settings__field :deep(.p-inputnumber),
.lobby-settings__field :deep(.p-inputnumber-input) {
  width: 100%;
}

.lobby-settings__field :deep(.p-selectbutton) {
  display: flex;
  width: 100%;
}

.lobby-settings__field :deep(.p-selectbutton .p-togglebutton) {
  flex: 1 1 0;
}
</style>
