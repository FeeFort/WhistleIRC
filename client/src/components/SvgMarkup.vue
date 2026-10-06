<script setup>
defineProps({
  svg: { type: String, default: "" },
});
</script>

<template>
  <!-- The SVG comes only from local, bundled assets. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span class="svg-markup" aria-hidden="true" v-html="svg" />
</template>
