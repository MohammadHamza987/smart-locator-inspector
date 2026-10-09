#!/usr/bin/env node
/**
 * Builds the extension:
 *   node scripts/build.mjs          production build into dist/
 *   node scripts/build.mjs --watch  rebuild on change (development)
 *   node scripts/build.mjs --e2e    test build into dist-e2e/ with localhost host access
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const e2e = args.has('--e2e');
const mode = watch ? 'development' : 'production';
const outDir = resolve(e2e ? 'dist-e2e' : 'dist');
process.env.SLI_OUT_DIR = outDir;

async function patchE2EManifest() {
  const path = resolve(outDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  // Automated tests cannot click the toolbar icon to grant activeTab,
  // so the test build (never published) gets access to the local fixture server.
  manifest.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
  manifest.name = `${manifest.name} (E2E)`;
  await writeFile(path, JSON.stringify(manifest, null, 2));
}

// Both builds share one output folder, so it is cleaned once up front.
const watchOptions = { emptyOutDir: false, ...(watch ? { watch: {} } : {}) };
await rm(outDir, { recursive: true, force: true });

await build({ configFile: resolve('vite.config.js'), mode, build: watchOptions, logLevel: 'warn' });
await build({ configFile: resolve('vite.content.config.js'), mode, build: watchOptions, logLevel: 'warn' });
if (e2e) await patchE2EManifest();

console.log(`✓ Extension built into ${outDir}${watch ? ' (watching for changes)' : ''}`);
