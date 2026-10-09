<script setup>
defineProps({
  type: { type: String, default: 'info', validator: (value) => ['info', 'success', 'warning', 'error'].includes(value) },
  text: { type: String, required: true },
});
defineEmits(['dismiss']);
</script>

<template>
  <div class="message" :class="`message-${type}`" :role="type === 'error' ? 'alert' : 'status'">
    <span class="message-text">{{ text }}</span>
    <button type="button" class="icon-button" aria-label="Dismiss message" @click="$emit('dismiss')">×</button>
  </div>
</template>
