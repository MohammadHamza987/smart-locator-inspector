<script setup>
import { DOCS_URL } from '../../shared/constants.js';

defineEmits(['close']);
</script>

<template>
  <section class="card help" aria-labelledby="help-title">
    <div class="card-title">
      <h2 id="help-title">How it works</h2>
      <button type="button" class="icon-button" aria-label="Close help" @click="$emit('close')">×</button>
    </div>
    <dl class="help-grid">
      <dt>Inspect</dt>
      <dd>Start, hover an element, click to select. <kbd>Esc</kbd> stops; <kbd>Enter</kbd> selects the hovered element.</dd>
      <dt>Validation</dt>
      <dd>Each locator is evaluated on the live page. "Unique" means exactly one match and it is the selected element.</dd>
      <dt>Ratings</dt>
      <dd>
        <span class="badge rating-recommended">Recommended</span> best unique choice ·
        <span class="badge rating-good">Good</span> ·
        <span class="badge rating-acceptable">Acceptable</span> ·
        <span class="badge rating-fragile">Fragile</span> ambiguous or brittle ·
        <span class="badge rating-unverified">Unverified</span> could not be checked
      </dd>
      <dt>Stability</dt>
      <dd>Estimated separately from uniqueness: generated ids, hashed classes, numbers in text and positional indexes lower it.</dd>
      <dt>Privacy</dt>
      <dd>Runs only after you click Start, only in the current tab. No network requests, no storage of page content, password values are never read.</dd>
    </dl>
    <a class="docs-link" :href="DOCS_URL" target="_blank" rel="noopener noreferrer">Full documentation</a>
  </section>
</template>
