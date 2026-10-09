<script setup>
import LocatorCard from './LocatorCard.vue';

defineProps({
  candidates: { type: Array, required: true },
  framework: { type: String, required: true },
  copiedKey: { type: String, default: null },
  canHighlight: { type: Boolean, default: true },
});
defineEmits(['copy', 'highlight']);
</script>

<template>
  <div class="locator-list">
    <ol v-if="candidates.length" class="locator-items">
      <li v-for="candidate in candidates" :key="candidate.key">
        <LocatorCard
          :candidate="candidate"
          :framework="framework"
          :copied-key="copiedKey"
          :can-highlight="canHighlight"
          @copy="$emit('copy', $event)"
          @highlight="$emit('highlight', candidate)"
        />
      </li>
    </ol>
    <p v-else class="empty-list">
      No locator could be generated for this framework. Try selecting the parent element.
    </p>
  </div>
</template>
