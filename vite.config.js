import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const src = (path) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

/**
 * Builds the popup (HTML + Vue) and the module service worker.
 * The content script is built separately (vite.content.config.js) because
 * chrome.scripting.executeScript() needs a single classic script.
 */
export default defineConfig(({ mode }) => ({
  root: src(''),
  base: './',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [vue()],
  define: {
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    outDir: fileURLToPath(new URL(process.env.SLI_OUT_DIR ?? './dist', import.meta.url)),
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: { polyfill: false },
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    rollupOptions: {
      input: {
        popup: src('popup/index.html'),
        'service-worker': src('background/service-worker.js'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'service-worker' ? 'background/service-worker.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
