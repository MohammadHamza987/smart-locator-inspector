<script setup>
import { nextTick, ref } from 'vue';
import { FRAMEWORKS, FRAMEWORK_LABELS } from '../../shared/constants.js';

defineProps({
  modelValue: { type: String, required: true },
  counts: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['update:modelValue']);

const tabs = Object.values(FRAMEWORKS);
const tabRefs = ref([]);

async function onKeydown(event, index) {
  let next = null;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  if (next === null) return;
  event.preventDefault();
  emit('update:modelValue', tabs[next]);
  await nextTick();
  tabRefs.value[next]?.focus();
}
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Framework">
    <button
      v-for="(framework, index) in tabs"
      :id="`tab-${framework}`"
      :key="framework"
      ref="tabRefs"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="modelValue === framework"
      :aria-controls="`panel-${framework}`"
      :tabindex="modelValue === framework ? 0 : -1"
      @click="emit('update:modelValue', framework)"
      @keydown="onKeydown($event, index)"
    >
      {{ FRAMEWORK_LABELS[framework] }}
      <span class="tab-count">{{ counts[framework] ?? 0 }}</span>
    </button>
  </div>
</template>
