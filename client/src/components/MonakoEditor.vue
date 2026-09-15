<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return label === "typescript" || label === "javascript" ? new TypeScriptWorker() : new EditorWorker();
  },
};

const props = defineProps({
  modelValue: { type: String, default: "" },
  language: { type: String, default: "javascript" },
});
const emit = defineEmits(["update:modelValue"]);

const container = ref(null);
let editor = null;
// Guards against feedback loops: an external modelValue change (e.g. switching
// slots) shouldn't re-fire update:modelValue, and vice versa.
let applyingExternalValue = false;

onMounted(() => {
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 13,
    tabSize: 2,
    insertSpaces: true,
    scrollBeyondLastLine: false,
  });
  editor.onDidChangeModelContent(() => {
    if (applyingExternalValue) return;
    emit("update:modelValue", editor.getValue());
  });
});

watch(() => props.modelValue, (value) => {
  if (!editor || value === editor.getValue()) return;
  applyingExternalValue = true;
  // Preserve cursor/scroll position instead of a full reset — matters when the
  // update round-trips back in (e.g. through a parent-held ref).
  const position = editor.getPosition();
  editor.setValue(value);
  if (position) editor.setPosition(position);
  applyingExternalValue = false;
});

onBeforeUnmount(() => editor?.dispose());
</script>
<template>
  <div ref="container" class="monaco-editor-host" />
</template>
<style scoped>
.monaco-editor-host { width: 100%; height: 22rem; border: 1px solid var(--app-border); border-radius: .6rem; overflow: hidden; }
</style>
