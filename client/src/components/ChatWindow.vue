<script setup>
import { ref, computed, nextTick, watch, onBeforeUnmount } from "vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import {
  Menu,
  Send,
  Hash,
  Timer,
  ClipboardCheck,
  Flag,
  Gamepad2,
  GraduationCap,
} from "@lucide/vue";
import { useNickColor } from "../composables/useNickColor";
import { useChatSettings } from "../composables/useChatSettings";
import BanchoBotCommandBar from "./BanchoBotCommandBar.vue";
import CommandBar from "./CommandBar.vue";

const { nickColor: baseNickColor } = useNickColor();
const {
  highlightReferee,
  highlightBanchoBot,
  banchoBotColor,
  redTeamColor,
  blueTeamColor,
  unassignedColorMode,
  unassignedColor,
  timestampMode,
} = useChatSettings();

const props = defineProps({
  title: { type: String, default: "Referee chat" },
  connected: { type: Boolean, default: false },
  currentUser: { type: String, default: "you" },
  refereeUsers: { type: Array, default: () => [] },
  messages: {
    type: Array,
    default: () => [],
    // each message: { id, author, text, time }
  },
  autoScrollToken: { type: Number, default: 0 },
  // room facts, shown as a small subtitle line under the title
  roomSize: { type: Number, default: 16 },
  timerActive: { type: Boolean, default: false },
  timerSeconds: { type: Number, default: 0 },
  format: { type: String, default: "HeadToHead" },
  winCondition: { type: String, default: "Score" },
  mode: { type: String, default: "osu" },
  shortcutMode: { type: String, default: "referee" },
  roomClosed: { type: Boolean, default: false },
  qualificationMode: { type: Boolean, default: false },
  showQualificationToggle: { type: Boolean, default: true },
});

function formatTimer(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const remainder = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

const timerLabel = computed(() =>
  props.timerActive ? formatTimer(props.timerSeconds) : "No timer active",
);

const statusLabel = computed(() =>
  props.connected ? "Connected" : "Disconnected",
);

const emit = defineEmits([
  "send",
  "toggle-sidebar",
  "send-command",
  "create-lobby",
  "update:qualificationMode",
]);

const draft = ref("");
const listEl = ref(null);
const shouldAutoScroll = ref(true);
const AUTO_SCROLL_THRESHOLD = 24;
const AUTO_SCROLL_DURATION = 650;
let isAutoScrolling = false;
let animationFrameId;
let autoScrollTimer;
let forceAutoScroll = false;

function nickColor(author, team) {
  if (isReferee(author)) return "var(--app-primary)";
  if (isBanchoBot(author)) return banchoBotColor.value;
  if (team?.toLowerCase() === "red") return redTeamColor.value;
  if (team?.toLowerCase() === "blue") return blueTeamColor.value;
  if (unassignedColorMode.value === "custom") {
    return unassignedColor.value;
  }
  return baseNickColor(author, props.currentUser);
}

function isReferee(author) {
  const normalizedAuthor = normalizeNick(author);
  return (
    !!normalizedAuthor &&
    props.refereeUsers.some((nick) => normalizeNick(nick) === normalizedAuthor)
  );
}

function normalizeNick(nick) {
  return String(nick || "")
    .replaceAll(" ", "_")
    .toLowerCase();
}

function isBanchoBot(author) {
  return author === "BanchoBot";
}

// Referee and BanchoBot can use filled badges when their respective toggles
// are enabled. Otherwise their names render as plain colored text.
function nickStyle(author, team) {
  const color = nickColor(author, team);
  if (isBanchoBot(author) && highlightBanchoBot.value) {
    return {
      background: banchoBotColor.value,
      color: "var(--app-bg)",
    };
  }
  if (isReferee(author) && highlightReferee.value) {
    return {
      background: "var(--app-primary-dark)",
      color: "var(--app-bg)",
    };
  }
  return { color };
}

function formatTime(time, includeSeconds) {
  if (!time) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
}

function messageMinute(time) {
  if (!time) return null;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

function shouldShowTime(index) {
  if (timestampMode.value === "full") return true;
  if (index === 0) return true;
  return (
    messageMinute(props.messages[index]?.time) !==
    messageMinute(props.messages[index - 1]?.time)
  );
}

function displayTime(time, index) {
  if (!shouldShowTime(index)) return "";
  return formatTime(time, timestampMode.value === "full");
}

function isNearBottom(el) {
  return (
    el.scrollHeight - el.clientHeight - el.scrollTop <= AUTO_SCROLL_THRESHOLD
  );
}

function finishAutoScroll(el) {
  isAutoScrolling = false;
  animationFrameId = undefined;
  autoScrollTimer = undefined;
  shouldAutoScroll.value = isNearBottom(el);
}

function cancelAutoScroll() {
  if (animationFrameId !== undefined) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = undefined;
  }
  clearTimeout(autoScrollTimer);
  autoScrollTimer = undefined;
  isAutoScrolling = false;
}

function animateScrollTo(el, target) {
  cancelAutoScroll();

  const start = el.scrollTop;
  const change = target - start;
  if (Math.abs(change) < 1) return;

  isAutoScrolling = true;

  if (document.hidden) {
    el.scrollTo({ top: target, behavior: "smooth" });
    autoScrollTimer = setTimeout(
      () => finishAutoScroll(el),
      AUTO_SCROLL_DURATION + 100,
    );
    return;
  }

  const startTime = performance.now();

  function step(now) {
    if (document.hidden) {
      el.scrollTo({ top: target, behavior: "smooth" });
      autoScrollTimer = setTimeout(
        () => finishAutoScroll(el),
        AUTO_SCROLL_DURATION + 100,
      );
      animationFrameId = undefined;
      return;
    }

    const progress = Math.min((now - startTime) / AUTO_SCROLL_DURATION, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    el.scrollTop = start + change * eased;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      finishAutoScroll(el);
    }
  }

  animationFrameId = requestAnimationFrame(step);
}

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value;
    if (!el) return;

    const target = Math.max(0, el.scrollHeight - el.clientHeight);
    if (target - el.scrollTop < 1) return;

    if (!shouldAutoScroll.value) return;

    animateScrollTo(el, target);
  });
}

function onScroll() {
  if (!isAutoScrolling && listEl.value) {
    shouldAutoScroll.value = isNearBottom(listEl.value);
  }
}

function onWheel(event) {
  cancelAutoScroll();
  if (event.deltaY < 0) {
    shouldAutoScroll.value = false;
  } else if (listEl.value) {
    shouldAutoScroll.value = isNearBottom(listEl.value);
  }
}

watch(
  () => props.messages.length,
  () => {
    const stickToBottom =
      forceAutoScroll ||
      !listEl.value ||
      isAutoScrolling ||
      isNearBottom(listEl.value);
    forceAutoScroll = false;
    if (!stickToBottom) return;
    shouldAutoScroll.value = true;
    scrollToBottom();
  },
);

watch(
  () => props.autoScrollToken,
  () => {
    forceAutoScroll = true;
    shouldAutoScroll.value = true;
    scrollToBottom();
  },
  { flush: "post" },
);

onBeforeUnmount(cancelAutoScroll);

function send() {
  if (props.roomClosed) return;
  const text = draft.value.trim();
  if (!text) return;
  forceAutoScroll = true;
  shouldAutoScroll.value = true;
  emit("send", text);
  draft.value = "";
  scrollToBottom();
}

function onKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function forwardCommand(command) {
  if (props.roomClosed) return;
  forceAutoScroll = true;
  shouldAutoScroll.value = true;
  emit("send-command", command);
}
</script>

<template>
  <div class="chat-window">
    <div class="chat-header">
      <div class="chat-header__title">
        <button
          type="button"
          class="chat-menu"
          aria-label="Toggle sidebar"
          @click.stop="emit('toggle-sidebar')"
        >
          <Menu :size="18" />
        </button>
        <div class="chat-header__titlegroup">
          <span class="chat-title">{{ title }}</span>
          <div v-if="shortcutMode !== 'bancho'" class="chat-subtitle">
            <span class="chat-subtitle__item"
              ><Hash :size="12" />{{ roomSize }}</span
            >
            <span class="chat-subtitle__dot">·</span>
            <span class="chat-subtitle__item"
              ><Timer :size="12" />{{ timerLabel }}</span
            >
            <span class="chat-subtitle__dot">·</span>
            <span class="chat-subtitle__item"
              ><ClipboardCheck :size="12" />{{ format }}</span
            >
            <span class="chat-subtitle__dot">·</span>
            <span class="chat-subtitle__item"
              ><Flag :size="12" />{{ winCondition }}</span
            >
            <span class="chat-subtitle__dot">·</span>
            <span class="chat-subtitle__item"
              ><Gamepad2 :size="12" />{{ mode }}</span
            >
          </div>
        </div>
      </div>
      <div class="chat-header__right">
        <div v-if="showQualificationToggle" class="chat-qualification-control">
          <GraduationCap :size="15" />
          <span>Qualifications</span>
          <ToggleSwitch
            :model-value="qualificationMode"
            class="app-solid-switch"
            inputId="chat-qualification-mode"
            @update:model-value="emit('update:qualificationMode', $event)"
          />
        </div>
        <div
          class="chat-status-card"
          :class="{
            'chat-status-card--offline': !connected,
          }"
        >
          <div class="chat-status-card__main">
            <span class="chat-status-card__dot" aria-hidden="true"></span>
            <span>{{ statusLabel }}</span>
          </div>
        </div>
      </div>
    </div>

    <div ref="listEl" class="chat-log" @scroll="onScroll" @wheel="onWheel">
      <div class="chat-log__inner">
        <div
          v-for="(msg, index) in messages"
          :key="msg.id"
          class="chat-line"
          :class="{ 'chat-line--system': msg.type === 'system' }"
        >
          <template v-if="msg.type === 'system'">
            <span class="chat-line__system-rule" aria-hidden="true"></span>
            <span class="chat-line__system-text">{{ msg.text }}</span>
            <span class="chat-line__system-rule" aria-hidden="true"></span>
          </template>
          <template v-else>
            <span class="chat-line__time">{{
              displayTime(msg.time, index)
            }}</span>
            <span
              class="chat-line__nick"
              :class="{
                'chat-line__nick--badge':
                  (isReferee(msg.author) && highlightReferee) ||
                  (isBanchoBot(msg.author) && highlightBanchoBot),
              }"
              :style="nickStyle(msg.author, msg.team)"
              >{{ msg.author }}</span
            >
            <span class="chat-line__text">{{ msg.text }}</span>
          </template>
        </div>
      </div>
    </div>

    <BanchoBotCommandBar
      v-if="shortcutMode === 'bancho'"
      :disabled="roomClosed"
      @send-command="forwardCommand"
      @create="emit('create-lobby')"
    />
    <CommandBar
      v-else
      docked
      :disabled="roomClosed"
      @send-command="forwardCommand"
    />

    <div class="chat-input">
      <Textarea
        v-model="draft"
        placeholder="Write a message"
        rows="1"
        autoResize
        class="chat-input__field"
        :disabled="roomClosed"
        @keydown="onKeydown"
      />
      <Button
        rounded
        aria-label="Send message"
        class="chat-input__send"
        :disabled="roomClosed || !draft.trim()"
        @click="send"
      >
        <Send :size="17" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  overflow: hidden;
  background: var(--app-panel-gradient);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.22);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 1.05rem 1.25rem;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.chat-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--app-text);
}

.chat-header__title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.chat-header__titlegroup {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.chat-subtitle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--app-muted);
}

.chat-subtitle__item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.chat-subtitle__item svg {
  flex-shrink: 0;
  opacity: 0.85;
}

.chat-subtitle__dot {
  opacity: 0.5;
}

.chat-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}

.chat-header__right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chat-qualification-control {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 2.65rem;
  padding: 0.45rem 0.2rem;
  color: var(--app-muted);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}

.chat-qualification-control > svg {
  color: var(--app-purple-bright);
}

.chat-qualification-control :deep(.p-toggleswitch) {
  flex-shrink: 0;
}

.chat-status-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 8rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid rgba(84, 213, 150, 0.2);
  border-radius: 0.65rem;
  background: rgba(84, 213, 150, 0.08);
  color: var(--app-green);
}

.chat-status-card__main {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
}

.chat-status-card__dot {
  width: 0.42rem;
  height: 0.42rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 0.18rem rgba(84, 213, 150, 0.12);
}

.chat-status-card--offline {
  border-color: rgba(255, 107, 126, 0.2);
  background: rgba(255, 107, 126, 0.08);
  color: var(--app-red);
}

.chat-status-card--offline .chat-status-card__dot {
  box-shadow: 0 0 0 0.18rem rgba(255, 107, 126, 0.12);
}

.chat-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  z-index: 0;
  padding: 1rem 1.25rem;
  font-family: "DM Sans", sans-serif;
  background: var(--app-log-background);
}

.chat-log__inner {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.chat-line {
  display: grid;
  grid-template-columns: 4.2rem max-content minmax(0, 1fr);
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.18rem 0;
}

.chat-line__time {
  flex-shrink: 0;
  width: 4.2rem;
  text-align: right;
  font-size: 0.7rem;
  color: var(--app-muted);
}

.chat-line__nick {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.4;
}

.chat-line__details {
  margin-left: 0.25rem;
  color: var(--app-muted);
  font-size: 0.7rem;
  font-weight: 600;
}

.chat-line__nick--badge {
  padding: 0.06rem 0.5rem;
  border-radius: 8px;
}

.chat-line__text {
  min-width: 0;
  color: var(--app-message-text);
  font-size: 0.8rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}

.chat-line--system {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem 0;
}

@media (max-width: 640px) {
  .chat-header__right {
    gap: 0.25rem;
  }

  .chat-status-card {
    min-width: auto;
  }

  .chat-qualification-control {
    min-height: 2.35rem;
    padding: 0.35rem 0.45rem;
  }

  .chat-qualification-control > span {
    display: none;
  }

  .chat-line {
    grid-template-columns: 3.2rem max-content minmax(0, 1fr);
    gap: 0.4rem;
  }

  .chat-line__time {
    width: auto;
  }
}

.chat-line__system-rule {
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--app-primary-rgb), 0.55)
  );
}

.chat-line__system-rule:last-child {
  background: linear-gradient(
    90deg,
    rgba(var(--app-primary-rgb), 0.55),
    transparent
  );
}

.chat-line__system-text {
  flex: 0 0 auto;
  color: var(--app-primary-bright);
  font-size: 0.76rem;
  font-weight: 700;
  text-align: center;
}

.chat-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  border-top: 1px solid var(--app-border);
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  background: var(--app-surface);
}

.chat-input__field {
  flex: 1;
  resize: none;
  max-height: 6rem;
  min-height: 2.7rem;
  padding: 0.55rem 0.75rem;
  line-height: 1.4rem;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.chat-input__field:enabled:focus {
  border-color: rgba(var(--app-primary-rgb), 0.85);
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.18);
}

.chat-input__field:disabled {
  border-color: var(--app-border-strong);
  background: var(--app-surface-hover) !important;
  color: var(--app-muted);
  opacity: 1;
}

.chat-input__field:disabled::placeholder {
  color: var(--app-muted);
  opacity: 0.7;
}

.chat-input__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  width: 2.7rem;
  height: 2.7rem;
  min-height: 2.7rem;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(var(--app-primary-bright-rgb), 0.55);
  background: var(--app-purple);
  color: #ffffff;
  transition: 180ms ease;
}

.chat-input__send:hover:not(:disabled) {
  border-color: rgba(var(--app-primary-bright-rgb), 0.8);
  background: var(--app-purple-bright);
  transform: translateY(-1px);
}

.chat-input__send:disabled {
  opacity: 0.45;
}
</style>
