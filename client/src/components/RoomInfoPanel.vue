<script setup>
import { Hash, Timer, ClipboardCheck, Flag, Gamepad2 } from "@lucide/vue";

const props = defineProps({
  size: { type: Number, default: 16 },
  timerActive: { type: Boolean, default: false },
  timerSeconds: { type: Number, default: 0 },
  format: { type: String, default: "HeadToHead" },
  winCondition: { type: String, default: "Score" },
  mode: { type: String, default: "osu" },
});

const timerLabel = props.timerActive
  ? `${props.timerSeconds}s left`
  : "No timer active";
</script>

<template>
  <div class="room-info">
    <span class="room-info__title">Room</span>

    <ul class="room-info__stats">
      <li class="room-info__stat">
        <Hash :size="14" class="room-info__icon" />
        <span class="room-info__label">Size</span>
        <span class="room-info__value">{{ size }}</span>
      </li>
      <li class="room-info__stat">
        <Timer :size="14" class="room-info__icon" />
        <span class="room-info__label">Timer</span>
        <span class="room-info__value">{{ timerLabel }}</span>
      </li>
      <li class="room-info__stat">
        <ClipboardCheck :size="14" class="room-info__icon" />
        <span class="room-info__label">Format</span>
        <span class="room-info__value">{{ format }}</span>
      </li>
      <li class="room-info__stat">
        <Flag :size="14" class="room-info__icon" />
        <span class="room-info__label">WC</span>
        <span class="room-info__value">{{ winCondition }}</span>
      </li>
      <li class="room-info__stat">
        <Gamepad2 :size="14" class="room-info__icon" />
        <span class="room-info__label">Mode</span>
        <span class="room-info__value">{{ mode }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.room-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  background: var(--p-content-background);
}

.room-info__title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.room-info__stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.room-info__stat {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
}

.room-info__icon {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.room-info__label {
  color: var(--p-text-muted-color);
  flex: 1 1 auto;
}

.room-info__value {
  color: var(--p-text-color);
  font-weight: 500;
  text-align: right;
}
</style>
