<script setup>
import { ref, watch } from "vue";
import InputNumber from "primevue/inputnumber";
import Button from "primevue/button";
import { DEFAULT_WIN_CONDITION } from "../composables/useMappool";
import MonacoEditor from "./MonakoEditor.vue";
const props = defineProps({ modelValue: { type: String, default: "" }, slotId: { type: String, default: "" } });
const emit = defineEmits(["update:modelValue", "test"]);
const redScore = ref(1); const blueScore = ref(0); const result = ref(null);
watch(() => props.modelValue, () => {}, { immediate: true });
function test() { result.value = null; emit("test", { source: props.modelValue || DEFAULT_WIN_CONDITION, sampleContext: { redScore: redScore.value, blueScore: blueScore.value, redBeatmapScore: redScore.value, blueBeatmapScore: blueScore.value, teamRedScore: redScore.value, teamBlueScore: blueScore.value, beatmapTeamRedScore: redScore.value, beatmapTeamBlueScore: blueScore.value, scoreDifference: Math.abs(redScore.value - blueScore.value), redCombo: 0, blueCombo: 0, redAccuracy: 0, blueAccuracy: 0, redMisses: 0, blueMisses: 0 } }); }
function applyTestResult(value) { result.value = value; }
defineExpose({ applyTestResult });
</script>
<template>
  <div class="win-editor">
    <MonacoEditor :model-value="modelValue || DEFAULT_WIN_CONDITION" @update:model-value="(value) => emit('update:modelValue', value)" />
    <small>Call <code>await parseRoom()</code> to get { teamRed, teamBlue: { score, combo, misses, accuracy } }. Call <code>system.sendMessage(text)</code> for a referee-only note. Call <code>calculateWinner({'{ red, blue }'}, { '{ reverse, onTie }' })</code> to pick the winner — this also fills the beatmapWinner / beatmapTeamRedScore / beatmapTeamBlueScore / scoreDifference result variables. Decimal comma is supported.</small>
    <div class="win-editor__test">
      <InputNumber v-model="redScore" :min="0" placeholder="Red score" />
      <InputNumber v-model="blueScore" :min="0" placeholder="Blue score" />
      <Button text v-tooltip.top="'Test script'" aria-label="Test script" @click="test">Test</Button>
    </div>
    <div v-if="result" class="win-editor__result">
      <p :class="{ 'win-editor__error': result.error }">{{ result.error || `Winner: ${result.winner}` }}</p>
      <ul v-if="result.systemMessages?.length" class="win-editor__messages">
        <li v-for="(message, index) in result.systemMessages" :key="index">{{ message }}</li>
      </ul>
      <p v-if="result.result" class="win-editor__scoreline">{{ result.result.beatmapTeamRedScore }} — {{ result.result.beatmapTeamBlueScore }} (Δ {{ result.result.scoreDifference }})</p>
    </div>
  </div>
</template>
<style scoped>.win-editor{display:flex;flex-direction:column;gap:.7rem}.win-editor textarea{width:100%;resize:vertical;box-sizing:border-box;font:.76rem/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--app-control);color:var(--app-text);border:1px solid var(--app-border);border-radius:.6rem;padding:.7rem;outline:0;transition:border-color .16s ease,box-shadow .16s ease}.win-editor textarea:hover{border-color:var(--app-border-strong)}.win-editor textarea:focus{border-color:var(--app-primary-bright);box-shadow:0 0 0 .15rem rgba(var(--app-primary-rgb),.16)}.win-editor small{color:var(--app-muted);font-size:.68rem;line-height:1.45}.win-editor small code{font:inherit;background:var(--app-control);border:1px solid var(--app-border);border-radius:.3rem;padding:0 .25rem}.win-editor__test{display:flex;gap:.5rem;align-items:center}.win-editor__test :deep(.p-inputnumber){width:8rem}.win-editor__test :deep(.p-inputnumber-input){width:100%;border:1px solid var(--app-border)!important;border-radius:.6rem!important;background:var(--app-control)!important;color:var(--app-text)!important;box-shadow:none!important}.win-editor__test :deep(.p-inputnumber-input:focus){border-color:var(--app-primary-bright)!important;box-shadow:0 0 0 .15rem rgba(var(--app-primary-rgb),.16)!important}.win-editor__test :deep(.p-button){margin-left:auto;border:1px solid var(--app-primary)!important;border-radius:.6rem!important;background:var(--app-primary)!important;color:#fff!important;font-size:.72rem}.win-editor__test :deep(.p-button:hover){border-color:var(--app-primary-bright)!important;background:var(--app-primary-bright)!important}.win-editor__result{display:flex;flex-direction:column;gap:.4rem}.win-editor p{margin:0;padding:.6rem .7rem;border:1px solid rgba(var(--app-primary-rgb),.25);border-radius:.55rem;background:rgba(var(--app-primary-rgb),.09);color:var(--app-primary-bright);font-size:.74rem}.win-editor__error{border-color:rgba(239,123,123,.3)!important;background:rgba(239,123,123,.08)!important;color:var(--app-red)!important}.win-editor__messages{margin:0;padding:.6rem .7rem .6rem 1.4rem;border:1px solid var(--app-border);border-radius:.55rem;background:var(--app-control);color:var(--app-muted);font-size:.72rem;display:flex;flex-direction:column;gap:.25rem}.win-editor__scoreline{color:var(--app-muted)!important;background:var(--app-control)!important;border-color:var(--app-border)!important}</style>
