<script setup>
defineProps({
  unavailable: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
});
</script>

<template>
  <section class="empty-state" aria-live="polite">
    <template v-if="unavailable">
      <h2>This page can't be inspected</h2>
      <p>
        Chrome protects browser pages (chrome://, the Web Store, other extensions, PDF viewer).
        Open a regular website and click the extension icon again.
      </p>
    </template>
    <template v-else-if="active">
      <h2>Hover an element on the page</h2>
      <p>Click it to lock the selection. Ranked locators appear here and in the on-page panel.</p>
    </template>
    <template v-else>
      <h2>Find reliable locators in seconds</h2>
      <ol class="steps">
        <li>Click <strong>Start Inspection</strong>.</li>
        <li>Hover any button, link, input or other element.</li>
        <li>Click to select it and copy a validated locator.</li>
      </ol>
      <p class="muted small">Every candidate is checked against the live page for uniqueness before it is ranked.</p>
    </template>
  </section>
</template>
