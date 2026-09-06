<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import SelectButton from "primevue/selectbutton";
import ToggleSwitch from "primevue/toggleswitch";
import { AlertTriangle, Check, Copy, Send, SlidersHorizontal } from "@lucide/vue";
import { useChatSettings } from "../composables/useChatSettings";

const props = defineProps({
  lobbyId: { type: String, default: "" },
  teamAName: { type: String, default: "Team A" },
  teamBName: { type: String, default: "Team B" },
  teamAScore: { type: Number, default: 0 },
  teamBScore: { type: Number, default: 0 },
  bestOf: { type: Number, default: null },
  nextPickTeam: { type: String, default: null },
  canEdit: { type: Boolean, default: false },
  showMatchControls: { type: Boolean, default: true },
  showQualificationToggle: { type: Boolean, default: true },
  qualificationMode: { type: Boolean, default: false },
  mpLink: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:teamAScore", "update:teamBScore", "update:qualificationMode", "send-result", "update-settings"]);

const { redTeamColor, blueTeamColor } = useChatSettings();
const copied = ref(false);
const settingsVisible = ref(false);
const resultVisible = ref(false);
const accuracyMode = ref(false);
const manualScoreWarningPending = ref(false);
const draftBestOf = ref(null);
const draftNextPickTeam = ref(null);
const draftResult = ref({
  beatmapWinner: "",
  beatmapTeamRedScore: 0,
  beatmapTeamBlueScore: 0,
});
const committedScoreState = ref({
  lobbyId: props.lobbyId,
  teamAScore: props.teamAScore,
  teamBScore: props.teamBScore,
});
let copiedTimer;

const qualificationModeModel = computed({
  get: () => props.qualificationMode,
  set: (value) => emit("update:qualificationMode", value),
});
const nextPickOptions = computed(() => [props.teamAName, props.teamBName].filter((team, index, teams) => team && teams.indexOf(team) === index));
const resultWinnerOptions = computed(() => [props.teamAName, props.teamBName, "Draw"].filter((team, index, teams) => team && teams.indexOf(team) === index));
const settingsValid = computed(() => draftBestOf.value === null || (Number.isInteger(draftBestOf.value) && draftBestOf.value > 0));
const winningScore = computed(() => (Number.isInteger(props.bestOf) && props.bestOf > 0 ? Math.ceil(props.bestOf / 2) : null));
const hasMissingLobbySettings = computed(() => !Number.isInteger(props.bestOf) || props.bestOf <= 0 || !nextPickOptions.value.includes(props.nextPickTeam));
const hasManualScoreChanges = computed(() => manualScoreWarningPending.value);
const resultScoreDifference = computed(() => {
  const difference = Math.abs(normalizeScore(draftResult.value.beatmapTeamRedScore) - normalizeScore(draftResult.value.beatmapTeamBlueScore));
  return Math.round((difference + Number.EPSILON) * 100) / 100;
});

const leader = computed(() => {
  if (props.teamAScore === props.teamBScore) return null;
  return props.teamAScore > props.teamBScore ? "a" : "b";
});

watch(
  () => props.lobbyId,
  (lobbyId) => {
    committedScoreState.value = {
      lobbyId,
      teamAScore: props.teamAScore,
      teamBScore: props.teamBScore,
    };
    resultVisible.value = false;
    manualScoreWarningPending.value = false;
    accuracyMode.value = false;
  },
  { immediate: true },
);

watch(
  () => [props.teamAScore, props.teamBScore],
  ([teamAScore, teamBScore]) => {
    if (props.lobbyId !== committedScoreState.value.lobbyId) return;
    if (teamAScore !== committedScoreState.value.teamAScore || teamBScore !== committedScoreState.value.teamBScore) {
      manualScoreWarningPending.value = true;
    }
  },
);

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

function normalizeScore(value) {
  if (accuracyMode.value) {
    const score = Math.max(0, Number(value) || 0);
    return Math.round((score + Number.EPSILON) * 100) / 100;
  }
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

function normalizeBestOf(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeNextPickTeam(value) {
  return nextPickOptions.value.includes(value) ? value : null;
}

function resolveWinner(redScore, blueScore) {
  if (redScore === blueScore) return "Draw";
  return redScore > blueScore ? props.teamAName : props.teamBName;
}

function openResultDialog() {
  accuracyMode.value = false;
  draftBestOf.value = props.bestOf;
  draftNextPickTeam.value = normalizeNextPickTeam(props.nextPickTeam);
  draftResult.value = {
    beatmapWinner: resolveWinner(props.teamAScore, props.teamBScore),
    beatmapTeamRedScore: props.teamAScore,
    beatmapTeamBlueScore: props.teamBScore,
  };
  resultVisible.value = true;
}

function sendResult() {
  if (hasManualScoreChanges.value || hasMissingLobbySettings.value) {
    openResultDialog();
    return;
  }
  emit("send-result", {
    teamAName: props.teamAName,
    teamBName: props.teamBName,
  });
}

function sendEditedResult() {
  const bestOf = normalizeBestOf(draftBestOf.value);
  const nextPickTeam = normalizeNextPickTeam(draftNextPickTeam.value);
  if (bestOf !== props.bestOf || nextPickTeam !== props.nextPickTeam) {
    emit("update-settings", {
      bestOf,
      nextPickTeam,
    });
  }

  const result = {
    teamAName: props.teamAName,
    teamBName: props.teamBName,
  };
  if (hasManualScoreChanges.value) {
    result.beatmapWinner = draftResult.value.beatmapWinner;
    result.beatmapTeamRedScore = normalizeScore(draftResult.value.beatmapTeamRedScore);
    result.beatmapTeamBlueScore = normalizeScore(draftResult.value.beatmapTeamBlueScore);
    result.accuracy = accuracyMode.value;
  }
  emit("send-result", result);
  committedScoreState.value = {
    lobbyId: props.lobbyId,
    teamAScore: props.teamAScore,
    teamBScore: props.teamBScore,
  };
  manualScoreWarningPending.value = false;
  resultVisible.value = false;
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
      <div v-if="showQualificationToggle" class="lobby-settings__toggle-row">
        <div>
          <strong>Qualifications</strong>
          <span>Use a qualifications lobby instead of match controls.</span>
        </div>
        <ToggleSwitch v-model="qualificationModeModel" class="app-solid-switch" />
      </div>

      <template v-if="!qualificationModeModel">
        <label class="lobby-settings__field">
          <span>Best of</span>
          <InputNumber v-model="draftBestOf" :min="1" :max="99" :use-grouping="false" inputId="lobby-settings-best-of" />
        </label>

        <div class="lobby-settings__field">
          <span>Next pick</span>
          <SelectButton v-model="draftNextPickTeam" :options="nextPickOptions" :allow-empty="false" aria-label="Next pick team" />
        </div>
      </template>
      <template v-else>
        <div class="lobby-settings__hidden-note">
          <span>Best of and next pick are hidden while qualifications is enabled.</span>
        </div>
      </template>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="settingsVisible = false" />
      <Button label="Save" :disabled="!settingsValid" @click="saveSettings" />
    </template>
  </Dialog>

  <Dialog
    v-model:visible="resultVisible"
    modal
    dismissableMask
    class="lobby-settings-dialog lobby-result-dialog"
    header="Send result"
    :style="{ width: '32rem' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
  >
    <div class="lobby-result__body">
      <div v-if="hasManualScoreChanges" class="lobby-result__warning">
        <AlertTriangle :size="18" class="lobby-result__warning-icon" />
        <div class="lobby-result__warning-text">
          <strong>Manual score changes detected</strong>
          <span>Edit the beatmap variables below, or send the current values as they are.</span>
        </div>
      </div>

      <template v-if="hasManualScoreChanges">
        <div class="lobby-result__accuracy-toggle">
          <div>
            <strong>Accuracy</strong>
            <span>Allow decimal score values.</span>
          </div>
          <ToggleSwitch v-model="accuracyMode" class="app-solid-switch" />
        </div>

        <div class="lobby-result__field">
          <span class="lobby-result__label">Beatmap winner</span>
          <SelectButton v-model="draftResult.beatmapWinner" :options="resultWinnerOptions" :allow-empty="false" aria-label="Beatmap winner" />
        </div>

        <div class="lobby-result__scores">
          <label class="lobby-result__field">
            <span class="lobby-result__label">Red score</span>
            <InputNumber
              v-model="draftResult.beatmapTeamRedScore"
              :min="0"
              :maxFractionDigits="accuracyMode ? 2 : 0"
              :use-grouping="false"
              :suffix="accuracyMode ? '%' : ''"
              aria-label="Beatmap red score"
            />
          </label>
          <label class="lobby-result__field">
            <span class="lobby-result__label">Blue score</span>
            <InputNumber
              v-model="draftResult.beatmapTeamBlueScore"
              :min="0"
              :maxFractionDigits="accuracyMode ? 2 : 0"
              :use-grouping="false"
              :suffix="accuracyMode ? '%' : ''"
              aria-label="Beatmap blue score"
            />
          </label>
        </div>

        <div class="lobby-result__preview">
          <span>Score difference</span>
          <strong>{{ resultScoreDifference }}</strong>
        </div>
      </template>

      <div v-if="hasMissingLobbySettings" class="lobby-result__warning lobby-result__warning--settings">
        <AlertTriangle :size="18" class="lobby-result__warning-icon" />
        <div class="lobby-result__warning-text">
          <strong>Lobby settings are missing</strong>
          <span>Set Best of and Next pick here, or send the result with the current values.</span>
        </div>
      </div>

      <div v-if="hasMissingLobbySettings" class="lobby-result__settings">
        <div class="lobby-result__field">
          <span class="lobby-result__label">Best of</span>
          <InputNumber v-model="draftBestOf" :min="1" :max="99" :use-grouping="false" aria-label="Best of" />
        </div>

        <div class="lobby-result__field">
          <span class="lobby-result__label">Next pick</span>
          <SelectButton v-model="draftNextPickTeam" :options="nextPickOptions" :allow-empty="false" aria-label="Next pick team" />
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="resultVisible = false" />
      <Button label="Send Result" @click="sendEditedResult" />
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

.lobby-settings__toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.lobby-settings__toggle-row > div {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.lobby-settings__toggle-row strong {
  color: var(--app-text);
  font-size: 0.78rem;
}

.lobby-settings__toggle-row span,
.lobby-settings__hidden-note span {
  color: var(--app-muted);
  font-size: 0.7rem;
  line-height: 1.4;
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

.lobby-settings__hidden-note {
  padding: 0.25rem 0 0;
}

.lobby-result__body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.lobby-result__warning {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
  padding: 0.8rem 0.85rem;
  border: 1px solid rgba(var(--app-amber-rgb), 0.3);
  border-radius: 0.6rem;
  background: rgba(var(--app-amber-rgb), 0.1);
}

.lobby-result__warning-icon {
  flex-shrink: 0;
  margin-top: 0.05rem;
  color: var(--app-amber);
}

.lobby-result__warning-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.lobby-result__warning-text strong {
  color: var(--app-text);
  font-size: 0.85rem;
  font-weight: 800;
}

.lobby-result__warning-text span {
  color: var(--app-muted);
  font-size: 0.72rem;
  line-height: 1.4;
}

.lobby-result__accuracy-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.1rem 0;
}

.lobby-result__accuracy-toggle > div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.lobby-result__accuracy-toggle strong {
  color: var(--app-text);
  font-size: 0.78rem;
}

.lobby-result__accuracy-toggle span {
  color: var(--app-muted);
  font-size: 0.7rem;
}

.lobby-result__settings {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.lobby-result__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.lobby-result__label {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.lobby-result__scores {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.lobby-result__scores :deep(.p-inputnumber),
.lobby-result__scores :deep(.p-inputnumber-input) {
  width: 100%;
}

.lobby-result__preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  background: var(--app-control);
}

.lobby-result__preview span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.lobby-result__preview strong {
  color: var(--app-primary-bright);
  font-size: 0.9rem;
  font-weight: 800;
}

@media (max-width: 720px) {
  .lobby-result__scores {
    grid-template-columns: 1fr;
  }
}
</style>
