<script setup>
import Dialog from "primevue/dialog";
defineProps({ visible: Boolean });
defineEmits(["update:visible"]);
</script>
<template>
  <Dialog :visible="visible" modal :close-on-escape="true" header="Lobby referees" class="players-dialog referees-dialog" :style="{ width: '30rem' }" :pt="{ mask: { class: 'app-dialog-mask' } }" @keydown.esc.stop.prevent="$emit('update:visible', false)" @update:visible="$emit('update:visible', $event)">
    <div class="player-list__empty">No referees yet</div>
  </Dialog>
</template>
