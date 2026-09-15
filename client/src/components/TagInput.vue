<script setup>
import { ref } from "vue";
const props = defineProps({ modelValue: { type: Array, default: () => [] }, placeholder: { type: String, default: "Add value" } });
const emit = defineEmits(["update:modelValue"]);
const draft = ref("");
function add() {
  const value = draft.value.trim();
  if (value) emit("update:modelValue", [...props.modelValue, value]);
  draft.value = "";
}
function remove(index) {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, itemIndex) => itemIndex !== index),
  );
}
function onRemovePointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
}
function onRemoveClick(event, index) {
  event.preventDefault();
  event.stopPropagation();
  remove(index);
}
function onRemoveKeydown(event, index) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  remove(index);
}
function removeLast() {
  if (!draft.value && props.modelValue.length) remove(props.modelValue.length - 1);
}
function onWheel(event) {
  const el = event.currentTarget;
  if (el.scrollWidth <= el.clientWidth) return;
  el.scrollLeft += event.deltaY;
  event.preventDefault();
}
</script>
<template>
  <div class="tag-input" @wheel="onWheel">
    <span v-for="(value, index) in modelValue" :key="`${value}-${index}`" class="tag-input__tag"
      ><span class="tag-input__value">{{ value }}</span
      ><span
        class="tag-input__remove-hit"
        v-tooltip.top="`Remove ${value}`"
        role="button"
        tabindex="0"
        @pointerdown="onRemovePointerDown"
        @click="onRemoveClick($event, index)"
        @keydown="onRemoveKeydown($event, index)"
        >×</span
      ></span
    ><input v-model="draft" :placeholder="modelValue.length ? '' : placeholder" @keydown.enter.prevent="add" @keydown.,.prevent="add" @keydown.backspace="removeLast" @blur="add" />
  </div>
</template>
<style scoped>
.tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.25rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  background: var(--app-control);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.tag-input:focus-within {
  border-color: var(--app-primary-bright);
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16);
}
.tag-input__tag {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  width: fit-content;
  max-width: 100%;
  gap: 0.25rem;
  padding: 0.22rem 0.42rem;
  border: 1px solid rgba(var(--app-primary-rgb), 0.28);
  border-radius: 0.4rem;
  background: rgba(var(--app-primary-rgb), 0.13);
  color: var(--app-primary-bright);
  font-size: 0.7rem;
  pointer-events: none;
}
.tag-input__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-input__remove-hit {
  display: inline-grid;
  place-items: center;
  flex: 0 0 1rem;
  width: 1rem;
  min-width: 1rem;
  max-width: 1rem;
  height: 1rem;
  min-height: 1rem;
  max-height: 1rem;
  margin: 0;
  padding: 0;
  color: var(--app-muted);
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
}
.tag-input__remove-hit:hover,
.tag-input__remove-hit:focus-visible {
  color: var(--app-red) !important;
}
.tag-input input {
  min-width: 8rem;
  flex: 1 1 8rem;
  padding: 0.2rem;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 0.72rem;
}
.tag-input input::placeholder {
  color: var(--app-muted);
}
</style>
