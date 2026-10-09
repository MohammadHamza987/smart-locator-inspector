<script setup>
import { computed } from 'vue';

const props = defineProps({
  candidate: { type: Object, required: true },
  framework: { type: String, required: true },
  copiedKey: { type: String, default: null },
  canHighlight: { type: Boolean, default: true },
});
const emit = defineEmits(['copy', 'highlight']);

const validation = computed(() => props.candidate.validation);

const matchLabel = computed(() => {
  const v = validation.value;
  if (v.status === 'error') return 'Invalid selector';
  if (v.status !== 'verified') return 'Unverified';
  if (v.matchesTarget) return 'Unique · selected element';
  return `${v.matchCount} matches · selected is #${v.targetIndex + 1}`;
});

const stabilityBars = computed(() => ({ high: 3, medium: 2, low: 1 })[props.candidate.stabilityLevel] ?? 1);

function copy(variant, text) {
  emit('copy', { key: `${props.candidate.key}:${variant}`, text });
}

const isCopied = (variant) => props.copiedKey === `${props.candidate.key}:${variant}`;
</script>

<template>
  <article class="locator-card" :class="`rating-${candidate.rating}`">
    <header class="locator-head">
      <span class="badge" :class="`rating-${candidate.rating}`">{{ candidate.ratingLabel }}</span>
      <span class="strategy">{{ candidate.strategy }}</span>
      <span class="score" :title="`Score ${candidate.score} / 100`">{{ candidate.score }}</span>
    </header>

    <pre class="code"><code>{{ candidate.code }}</code></pre>

    <div class="locator-meta">
      <span class="match" :class="validation.matchesTarget ? 'match-ok' : 'match-bad'">
        <span aria-hidden="true">{{ validation.matchesTarget ? '✓' : '!' }}</span>
        {{ matchLabel }}
      </span>
      <span class="stability" :title="`Estimated stability ${Math.round(candidate.stability * 100)}%`">
        <span class="bars" :class="`level-${candidate.stabilityLevel}`" aria-hidden="true">
          <span v-for="bar in 3" :key="bar" :class="{ on: bar <= stabilityBars }"></span>
        </span>
        Stability: {{ candidate.stabilityLevel }}
      </span>
    </div>

    <p class="explanation">{{ candidate.explanation }}</p>
    <ul v-if="candidate.warnings.length" class="warnings">
      <li v-for="warning in candidate.warnings" :key="warning">{{ warning }}</li>
    </ul>
    <p v-if="candidate.convertedFrom" class="conversion">
      Selenium alternative to <code>{{ candidate.convertedFrom }}</code>, which has no direct Selenium equivalent.
    </p>
    <p v-if="candidate.seleniumAlternative" class="conversion">
      Selenium equivalent: <code>{{ candidate.seleniumAlternative }}</code>
    </p>

    <div class="locator-actions">
      <button type="button" class="button small primary" @click="copy('code', candidate.code)">
        {{ isCopied('code') ? 'Copied ✓' : 'Copy locator' }}
      </button>
      <button v-if="candidate.by" type="button" class="button small" @click="copy('by', candidate.by)">
        {{ isCopied('by') ? 'Copied ✓' : 'Copy By' }}
      </button>
      <button type="button" class="button small" :title="candidate.example" @click="copy('example', candidate.example)">
        {{ isCopied('example') ? 'Copied ✓' : 'Copy example' }}
      </button>
      <button
        v-if="canHighlight"
        type="button"
        class="button small ghost"
        title="Outline every element this locator matches on the page"
        @click="emit('highlight')"
      >
        Show matches
      </button>
    </div>
  </article>
</template>
