<script setup>
import { computed } from 'vue';

const props = defineProps({
  hovered: { type: Object, required: true },
  framework: { type: String, required: true },
});

const best = computed(() => props.hovered.best?.[props.framework] ?? null);
</script>

<template>
  <section class="card hover-preview" aria-label="Hovered element" aria-live="polite">
    <div class="card-title">
      <span>Hovering</span>
      <code class="element-tag">&lt;{{ hovered.details.summary }}&gt;</code>
    </div>
    <p v-if="best" class="hover-best">
      <span class="badge" :class="`rating-${best.rating}`">{{ best.ratingLabel }}</span>
      <code>{{ best.code }}</code>
    </p>
    <p v-else class="muted">No unique locator for this element yet.</p>
    <p class="muted small">Click the element on the page to select it and see every candidate.</p>
  </section>
</template>
