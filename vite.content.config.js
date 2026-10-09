import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/** Bundles the content script and its CSS into one self-contained IIFE. */
export default defineConfig(({ mode }) => ({
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    outDir: fileURLToPath(new URL(process.env.SLI_OUT_DIR ?? './dist', import.meta.url)),
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    lib: {
      entry: fileURLToPath(new URL('./src/content/content.js', import.meta.url)),
      formats: ['iife'],
      name: 'SmartLocatorInspectorContent',
      fileName: () => 'content/content.js',
    },
    rollupOptions: {
      output: { extend: true },
    },
  },
}));
