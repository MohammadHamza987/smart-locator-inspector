<script setup>
import { computed, ref, watch } from 'vue';
import { FRAMEWORKS } from '../shared/constants.js';
import { useInspector } from './composables/useInspector.js';
import { copyText } from './utils/clipboard.js';
import InspectorControls from './components/InspectorControls.vue';
import StatusMessage from './components/StatusMessage.vue';
import ElementDetails from './components/ElementDetails.vue';
import FrameworkTabs from './components/FrameworkTabs.vue';
import LocatorList from './components/LocatorList.vue';
import EmptyState from './components/EmptyState.vue';
import HoverPreview from './components/HoverPreview.vue';
import HelpPanel from './components/HelpPanel.vue';

const version = chrome.runtime.getManifest().version;
const showHelp = ref(false);
const inspector = useInspector();
const { state, hovered, selection, message, busy, unavailable, isActive } = inspector;

const FRAMEWORK_KEY = 'sli.framework';
const framework = ref(localStorage.getItem(FRAMEWORK_KEY) === FRAMEWORKS.SELENIUM ? FRAMEWORKS.SELENIUM : FRAMEWORKS.PLAYWRIGHT);
watch(framework, (value) => localStorage.setItem(FRAMEWORK_KEY, value));

const candidates = computed(() => selection.value?.frameworks[framework.value] ?? []);
const counts = computed(() => ({
  [FRAMEWORKS.PLAYWRIGHT]: selection.value?.frameworks[FRAMEWORKS.PLAYWRIGHT].length ?? 0,
  [FRAMEWORKS.SELENIUM]: selection.value?.frameworks[FRAMEWORKS.SELENIUM].length ?? 0,
}));

const copiedKey = ref(null);
let copiedTimer = 0;

async function onCopy({ key, text }) {
  const ok = await copyText(text);
  if (ok) {
    copiedKey.value = key;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copiedKey.value = null; }, 1500);
  } else {
    message.value = { type: 'error', text: 'Could not access the clipboard. Select the code and copy it manually.' };
  }
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <img src="/icons/icon-32.png" alt="" width="24" height="24" />
        <div>
          <h1>Smart Locator Inspector</h1>
          <span class="version">v{{ version }} · local only</span>
        </div>
      </div>
      <button type="button" class="button small ghost" :aria-expanded="showHelp" @click="showHelp = !showHelp">
        {{ showHelp ? 'Close help' : 'Help' }}
      </button>
    </header>

    <main class="app-main">
      <HelpPanel v-if="showHelp" @close="showHelp = false" />
      <InspectorControls
        :state="state"
        :busy="busy"
        :disabled="unavailable"
        @start="inspector.start"
        @stop="inspector.stop"
      />

      <StatusMessage v-if="message" :type="message.type" :text="message.text" @dismiss="inspector.dismissMessage" />

      <HoverPreview v-if="hovered && state === 'inspecting'" :hovered="hovered" :framework="framework" />

      <template v-if="selection">
        <ElementDetails
          :details="selection.details"
          :stats="selection.stats"
          :can-select-parent="isActive"
          @select-parent="inspector.selectParent"
        />
        <FrameworkTabs v-model="framework" :counts="counts" />
        <LocatorList
          :id="`panel-${framework}`"
          role="tabpanel"
          :aria-labelledby="`tab-${framework}`"
          :candidates="candidates"
          :framework="framework"
          :copied-key="copiedKey"
          :can-highlight="!unavailable"
          @copy="onCopy"
          @highlight="inspector.highlight"
        />
      </template>

      <EmptyState v-else-if="state !== 'loading'" :unavailable="unavailable" :active="isActive" />
    </main>

    <footer class="app-footer">
      <span>No data leaves your browser.</span>
      <span><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> toggles inspection</span>
    </footer>
  </div>
</template>
