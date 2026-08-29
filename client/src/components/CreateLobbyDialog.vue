<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import ToggleSwitch from "primevue/toggleswitch";
import { DoorOpen } from "@lucide/vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(["update:visible", "create"]);

const acronym = ref("");
const teamRed = ref("");
const teamBlue = ref("");
const qualifiersLobby = ref("");
const qualifiers = ref(false);
const bestOf = ref(13);
const includeParentheses = ref(true);

const command = computed(() => {
  const name = acronym.value.trim() || "ACRONYM";
  const wrap = (value) => (includeParentheses.value ? `(${value})` : value);

  if (qualifiers.value) {
    const lobby = qualifiersLobby.value.trim() || "Lobby ID";
    return `!mp make ${name}: ${wrap("Qualifiers")} vs ${wrap(`Lobby ${lobby}`)}`;
  }

  const red = teamRed.value.trim() || "Team Red";
  const blue = teamBlue.value.trim() || "Team Blue";
  return `!mp make ${name}: ${wrap(red)} vs ${wrap(blue)}`;
});

const isValid = computed(() => {
  if (!acronym.value.trim()) return false;
  if (qualifiers.value) return Boolean(qualifiersLobby.value.trim());
  return Boolean(teamRed.value.trim() && teamBlue.value.trim());
});

function close() {
  emit("update:visible", false);
}

function create() {
  if (!isValid.value) return;
  const name = command.value.replace(/^!mp\s+make\s+/i, "");
  const teamRedValue = qualifiers.value ? "Qualifiers" : teamRed.value.trim();
  const teamBlueValue = qualifiers.value ? `Lobby ${qualifiersLobby.value.trim()}` : teamBlue.value.trim();
  emit("create", {
    command: command.value,
    lobby: {
      name,
      qualifiers: qualifiers.value,
      qualificationMode: qualifiers.value,
      teamRed: teamRedValue,
      teamBlue: teamBlueValue,
      bestOf: bestOf.value,
    },
  });
  close();
}

function resetForm() {
  acronym.value = "";
  teamRed.value = "";
  teamBlue.value = "";
  qualifiersLobby.value = "";
  qualifiers.value = false;
  bestOf.value = 13;
  includeParentheses.value = true;
}

watch(
  () => props.visible,
  (value) => {
    if (value) resetForm();
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissableMask
    class="create-lobby-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    header="Create lobby"
    :style="{ width: '32rem' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="create-lobby-dialog__body">
      <div class="create-lobby-dialog__intro">
        <div class="create-lobby-dialog__icon">
          <DoorOpen :size="19" />
        </div>
        <div>
          <strong>Create a new multiplayer lobby</strong>
          <span>Set the lobby name and teams before sending the command.</span>
        </div>
      </div>

      <label class="create-lobby-dialog__field">
        <span>Tournament acronym</span>
        <InputText v-model="acronym" placeholder="e.g. OPTC2" autofocus />
      </label>

      <label class="create-lobby-dialog__field">
        <span>Best of</span>
        <InputNumber v-model="bestOf" :min="1" :max="99" :use-grouping="false" inputId="create-lobby-best-of" />
      </label>

      <div class="create-lobby-dialog__toggle-row">
        <div>
          <strong>Qualifications</strong>
          <span>Use a qualifications lobby instead of two teams.</span>
        </div>
        <ToggleSwitch v-model="qualifiers" class="app-solid-switch" />
      </div>

      <label v-if="!qualifiers" class="create-lobby-dialog__field">
        <span>Red team name</span>
        <InputText v-model="teamRed" placeholder="e.g. Team Red" />
      </label>

      <label v-if="!qualifiers" class="create-lobby-dialog__field">
        <span>Blue team name</span>
        <InputText v-model="teamBlue" placeholder="e.g. Team Blue" />
      </label>

      <label v-else class="create-lobby-dialog__field">
        <span>Qualifiers lobby ID</span>
        <InputText v-model="qualifiersLobby" placeholder="e.g. 12345678" />
      </label>

      <div class="create-lobby-dialog__toggle-row">
        <div>
          <strong>Include names in parentheses</strong>
          <span>Wrap teams and lobby labels in parentheses.</span>
        </div>
        <ToggleSwitch v-model="includeParentheses" class="app-solid-switch" />
      </div>

      <div class="create-lobby-dialog__preview">
        <span>Lobby preview</span>
        <code>{{ command }}</code>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="close" />
      <Button label="Create" :disabled="!isValid" @click="create" />
    </template>
  </Dialog>
</template>

<style scoped>
.create-lobby-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.create-lobby-dialog__intro {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  margin-bottom: 0.15rem;
}

.create-lobby-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  border: 1px solid rgba(var(--app-primary-rgb), 0.25);
  border-radius: 0.65rem;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
}

.create-lobby-dialog__intro div:last-child,
.create-lobby-dialog__toggle-row > div {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.create-lobby-dialog__intro strong,
.create-lobby-dialog__toggle-row strong {
  color: var(--app-text);
  font-size: 0.78rem;
}

.create-lobby-dialog__intro span,
.create-lobby-dialog__toggle-row span {
  color: var(--app-muted);
  font-size: 0.7rem;
  line-height: 1.4;
}

.create-lobby-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.create-lobby-dialog__field > span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.create-lobby-dialog__field :deep(.p-inputtext) {
  width: 100%;
}

.create-lobby-dialog__toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.15rem 0;
}

.create-lobby-dialog__preview {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
}

.create-lobby-dialog__preview > span {
  color: var(--app-muted);
  font-size: 0.68rem;
  font-weight: 700;
}

.create-lobby-dialog__preview code {
  overflow-wrap: anywhere;
  color: var(--app-primary-bright);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.73rem;
}
</style>
