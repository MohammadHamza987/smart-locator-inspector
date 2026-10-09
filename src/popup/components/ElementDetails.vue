<script setup>
import { computed } from 'vue';

const props = defineProps({
  details: { type: Object, required: true },
  stats: { type: Object, default: null },
  canSelectParent: { type: Boolean, default: false },
});
defineEmits(['select-parent']);

const NAME_SOURCES = {
  'aria-labelledby': 'aria-labelledby',
  'aria-label': 'aria-label',
  label: 'label',
  content: 'text',
  value: 'value',
  alt: 'alt',
  title: 'title',
  placeholder: 'placeholder',
  legend: 'legend',
  caption: 'caption',
  default: 'default',
};

const rows = computed(() => {
  const d = props.details;
  return [
    ['Tag', d.tag + (d.type && d.tag === 'input' ? `[type=${d.type}]` : '')],
    ['ID', d.id],
    ['Classes', d.classes?.length ? d.classes.join(' ') : null],
    ['Name', d.name],
    ['Role', d.role ? `${d.role}${d.explicitRole ? ' (explicit)' : ''}` : null],
    ['Accessible name', d.accessibleName ? `${d.accessibleName}  · from ${NAME_SOURCES[d.accessibleNameSource] ?? 'unknown'}` : null],
    ['Label', d.label],
    ['aria-label', d.ariaLabel],
    ['Placeholder', d.placeholder],
    ['Test id', d.testId ? `${d.testId.name}="${d.testId.value}"` : null],
    ['Title', d.title],
    ['Alt', d.alt],
    ['Href', d.href],
    ['Text', d.textPreview ? `“${d.textPreview}”` : null],
  ].filter(([, value]) => value);
});
</script>

<template>
  <section class="card" aria-labelledby="selected-element-title">
    <div class="card-title">
      <h2 id="selected-element-title">Selected element</h2>
      <button
        v-if="canSelectParent"
        type="button"
        class="button small"
        title="Select the parent element instead"
        @click="$emit('select-parent')"
      >
        Select parent
      </button>
    </div>
    <code class="element-tag">&lt;{{ details.summary }}&gt;</code>
    <dl class="details-grid">
      <template v-for="[key, value] in rows" :key="key">
        <dt>{{ key }}</dt>
        <dd>{{ value }}</dd>
      </template>
    </dl>
    <p v-if="details.sensitive" class="notice">Sensitive field: its value was not read or stored.</p>
    <p v-if="details.inShadowDom" class="notice">Inside a shadow root: CSS and Playwright locators pierce open shadow DOM, XPath does not.</p>
    <p v-if="stats" class="muted small">{{ stats.generated }} candidates generated and validated in {{ stats.durationMs }} ms.</p>
  </section>
</template>
