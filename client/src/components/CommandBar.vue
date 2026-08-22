<script setup>
import { ref } from "vue";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import {
  Play,
  Square,
  TimerOff,
  Settings2,
  Lock,
  LockOpen,
  DoorClosed,
  Timer,
} from "@lucide/vue";

defineEmits(["send-command"]);

const timerSeconds = ref(30);

const commands = [
  {
    label: "Start",
    command: "!mp start",
    icon: Play,
    severity: "success",
    tooltip: "Start the match (!mp start)",
  },
  {
    label: "Abort",
    command: "!mp abort",
    icon: Square,
    severity: "danger",
    tooltip: "Abort the current map (!mp abort)",
  },
  {
    label: "Abort timer",
    command: "!mp aborttimer",
    icon: TimerOff,
    severity: "danger",
    tooltip: "Cancel a running timer (!mp aborttimer)",
  },
  {
    label: "Settings",
    command: "!mp settings",
    icon: Settings2,
    severity: "secondary",
    tooltip: "Print room settings and player list (!mp settings)",
  },
  {
    label: "Lock",
    command: "!mp lock",
    icon: Lock,
    severity: "warn",
    tooltip: "Lock the room slots (!mp lock)",
  },
  {
    label: "Unlock",
    command: "!mp unlock",
    icon: LockOpen,
    severity: "success",
    tooltip: "Unlock the room slots (!mp unlock)",
  },
  {
    label: "Close",
    command: "!mp close",
    icon: DoorClosed,
    severity: "danger",
    tooltip: "Close the room permanently (!mp close)",
  },
];
</script>

<template>
  <div class="command-bar">
    <span class="command-bar__title">Quick commands</span>

    <div class="command-bar__grid">
      <Button
        v-for="cmd in commands"
        :key="cmd.command"
        v-tooltip.top="cmd.tooltip"
        :severity="cmd.severity"
        :aria-label="cmd.label"
        text
        rounded
        class="command-bar__btn"
        @click="$emit('send-command', cmd.command)"
      >
        <component :is="cmd.icon" :size="17" />
      </Button>

      <div
        v-tooltip.top="`Set a countdown timer (!mp timer)`"
        class="command-bar__timer"
      >
        <InputNumber
          v-model="timerSeconds"
          :min="5"
          :max="600"
          :step="5"
          size="small"
          suffix="s"
          :inputStyle="{ width: '3.2rem' }"
        />
        <Button
          text
          rounded
          severity="secondary"
          aria-label="Set timer"
          class="command-bar__btn"
          @click="$emit('send-command', `!mp timer ${timerSeconds}`)"
        >
          <Timer :size="17" />
        </Button>
      </div>
    </div>

    <!-- reserved spot for the panic (forced reconnect) button once the
         WebSocket bridge exists - intentionally left as a placeholder -->
    <div class="command-bar__panic-slot" aria-hidden="true" />
  </div>
</template>

<style scoped>
.command-bar {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  background: var(--p-content-background);
}

.command-bar__title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.command-bar__grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}

.command-bar__btn {
  width: 2.1rem;
  height: 2.1rem;
}

.command-bar__timer {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.command-bar__panic-slot {
  min-height: 2.25rem;
}
</style>
