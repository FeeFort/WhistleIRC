<script setup>
import { ref, nextTick, watch, onBeforeUnmount } from "vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import Tag from "primevue/tag";
import { useDarkMode } from "../composables/useDarkMode";
import { useNickColor } from "../composables/useNickColor";

const { isDark, toggleDark } = useDarkMode();
const { nickColor: baseNickColor } = useNickColor();

const props = defineProps({
  title: { type: String, default: "Referee chat" },
  connected: { type: Boolean, default: false },
  currentUser: { type: String, default: "you" },
  // nick of the match host/referee - the only author eligible for the
  // highlighted badge treatment
  refereeUser: { type: String, default: "" },
  // toggles whether the referee's nick renders as a filled badge
  // (black text on colored bg) or as plain colored text like everyone else
  highlightReferee: { type: Boolean, default: true },
  messages: {
    type: Array,
    default: () => [],
    // each message: { id, author, text, time }
  },
});

const emit = defineEmits(["send"]);

const draft = ref("");
const listEl = ref(null);
const shouldAutoScroll = ref(true);
const AUTO_SCROLL_THRESHOLD = 24;
const AUTO_SCROLL_DURATION = 650;
let isAutoScrolling = false;
let animationFrameId;
let autoScrollTimer;
let forceAutoScroll = false;

function nickColor(author) {
  return baseNickColor(author, props.currentUser);
}

function isReferee(author) {
  return !!props.refereeUser && author === props.refereeUser;
}

// Only the referee ever gets a filled badge, and only when the toggle is
// on - black text on the colored fill. Everyone else (and the referee
// with the toggle off) just gets colored text, no background.
function nickStyle(author) {
  const color = nickColor(author);
  if (isReferee(author) && props.highlightReferee) {
    return { background: color, color: "#000" };
  }
  return { color };
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
    if (forceAutoScroll) {
      forceAutoScroll = false;
      shouldAutoScroll.value = true;
    } else if (listEl.value && !isAutoScrolling) {
      shouldAutoScroll.value = isNearBottom(listEl.value);
    }
    scrollToBottom();
  },
  { flush: "post" },
);

onBeforeUnmount(cancelAutoScroll);

function send() {
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
</script>

<template>
  <div class="chat-window">
    <div class="chat-header">
      <span class="chat-title">{{ title }}</span>
      <div class="chat-header__right">
        <Tag
          :value="connected ? 'Connected' : 'Disconnected'"
          :severity="connected ? 'success' : 'danger'"
        />
        <Button
          :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
          text
          rounded
          size="small"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleDark"
        />
      </div>
    </div>

    <div ref="listEl" class="chat-log" @scroll="onScroll" @wheel="onWheel">
      <div class="chat-log__inner">
        <div v-for="msg in messages" :key="msg.id" class="chat-line">
          <span class="chat-line__time">{{ msg.time || "" }}</span>
          <span
            class="chat-line__nick"
            :class="{
              'chat-line__nick--badge':
                isReferee(msg.author) && highlightReferee,
            }"
            :style="nickStyle(msg.author)"
            >{{ msg.author }}</span
          >
          <span class="chat-line__text">{{ msg.text }}</span>
        </div>
      </div>
    </div>

    <div class="chat-input">
      <Textarea
        v-model="draft"
        placeholder="Write a message"
        rows="1"
        autoResize
        class="chat-input__field"
        @keydown="onKeydown"
      />
      <Button
        icon="pi pi-send"
        rounded
        aria-label="Send message"
        :disabled="!draft.trim()"
        @click="send"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  overflow: hidden;
  background: var(--p-content-background);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.chat-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.chat-header__right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.chat-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  z-index: 0;
  padding: 0.6rem 0.9rem;
  font-family: var(--font-mono, ui-monospace, Consolas, monospace);
}

.chat-log__inner {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.chat-line {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.15rem 0;
  flex-wrap: wrap;
}

.chat-line__time {
  flex-shrink: 0;
  width: 4.2rem;
  text-align: right;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.chat-line__nick {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.4;
}

.chat-line__nick--badge {
  padding: 0.06rem 0.5rem;
  border-radius: 8px;
}

.chat-line__text {
  color: var(--p-text-color);
  font-size: 0.85rem;
  line-height: 1.4;
  word-break: break-word;
  flex: 1 1 auto;
  min-width: 0;
}

.chat-input {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.6rem;
  border-top: 1px solid var(--p-content-border-color);
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  background: var(--p-content-background);
}

.chat-input__field {
  flex: 1;
  resize: none;
  max-height: 6rem;
}
</style>
