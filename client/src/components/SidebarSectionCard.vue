<script setup>
defineProps({
  title: { type: String, required: true },
  icon: { type: Object, required: true },
  scrollable: { type: Boolean, default: false },
});
</script>

<template>
  <section
    class="sidebar-section-card"
    :class="{ 'sidebar-section-card--scrollable': scrollable }"
  >
    <div class="sidebar-section-card__heading">
      <component :is="icon" :size="18" />
      <span>{{ title }}</span>
    </div>
    <div v-if="$slots.default" class="sidebar-section-card__content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.sidebar-section-card {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-height: 4.2rem;
  padding: 1.1rem 1.2rem;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  background: var(--app-panel-gradient);
}

.sidebar-section-card__heading {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--app-text);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.sidebar-section-card__heading svg {
  color: var(--app-purple-bright);
}

.sidebar-section-card__content {
  min-width: 0;
}

.sidebar-section-card--scrollable {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.sidebar-section-card--scrollable .sidebar-section-card__content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: visible;
}
</style>
