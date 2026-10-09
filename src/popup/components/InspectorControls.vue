<script setup>
import { computed } from 'vue';

const props = defineProps({
  state: { type: String, required: true },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
defineEmits(['start', 'stop']);

const STATUS = {
  loading: { label: 'Checking page…', tone: 'muted' },
  idle: { label: 'Not inspecting', tone: 'muted' },
  inspecting: { label: 'Inspecting: hover the page', tone: 'active' },
  selected: { label: 'Element selected', tone: 'success' },
};

const status = computed(() => (props.disabled ? { label: 'Unavailable on this page', tone: 'error' } : STATUS[props.state] ?? STATUS.idle));
const active = computed(() => props.state === 'inspecting' || props.state === 'selected');
</script>

<template>
  <section class="controls" aria-label="Inspector controls">
    <div class="status-pill" :class="`tone-${status.tone}`" role="status" aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      {{ status.label }}
    </div>
    <div class="control-buttons">
      <button
        type="button"
        class="button primary"
        :disabled="disabled || busy || state === 'loading' || state === 'inspecting'"
        @click="$emit('start')"
      >
        {{ state === 'selected' ? 'Inspect again' : 'Start Inspection' }}
      </button>
      <button
        type="button"
        class="button danger"
        :disabled="disabled || busy || !active"
        @click="$emit('stop')"
      >
        Stop Inspection
      </button>
    </div>
  </section>
</template>
