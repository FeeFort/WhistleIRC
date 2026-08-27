<script setup>
import {
  Hash,
  Timer,
  ClipboardCheck,
  Flag,
  Gamepad2,
  Users,
} from "@lucide/vue";

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
    <div class="room-info__heading">
      <Users :size="18" class="room-info__heading-icon" />
      <span class="room-info__title">Room</span>
    </div>

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
  gap: 0.8rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  background: var(--app-panel-gradient);
}

.room-info__heading {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.room-info__heading-icon {
  color: var(--app-purple-bright);
}

.room-info__title {
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--app-text);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.room-info__stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.room-info__stat {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
}

.room-info__icon {
  flex-shrink: 0;
  color: var(--app-muted);
}

.room-info__label {
  color: var(--app-muted);
  flex: 1 1 auto;
}

.room-info__value {
  color: var(--app-text);
  font-weight: 700;
  text-align: right;
}
</style>
