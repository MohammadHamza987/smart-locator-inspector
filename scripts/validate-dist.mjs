#!/usr/bin/env node
/**
 * Sanity-checks a built extension folder before loading or publishing:
 * manifest shape, referenced files, local-only resources and forbidden APIs.
 *   node scripts/validate-dist.mjs dist
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const errors = [];
const warnings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

function requireFile(path, label) {
  if (!path) return errors.push(`${label}: missing path`);
  if (!existsSync(join(root, path))) errors.push(`${label}: "${path}" does not exist in the build`);
}

if (!existsSync(join(root, 'manifest.json'))) {
  console.error(`✗ ${root}/manifest.json not found. Run "npm run build" first.`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
for (const field of ['name', 'version', 'description']) {
  if (!manifest[field]) errors.push(`manifest.${field} is required`);
}
if (manifest.description?.length > 132) errors.push('manifest.description must be at most 132 characters for the Chrome Web Store');
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? '')) errors.push('manifest.version must be 1-4 dot-separated integers');

requireFile(manifest.action?.default_popup, 'action.default_popup');
requireFile(manifest.background?.service_worker, 'background.service_worker');
for (const [size, path] of Object.entries(manifest.icons ?? {})) requireFile(path, `icons.${size}`);
for (const [size, path] of Object.entries(manifest.action?.default_icon ?? {})) requireFile(path, `action.default_icon.${size}`);
if (!manifest.icons?.['128']) errors.push('A 128x128 icon is required for the Chrome Web Store');
requireFile('content/content.js', 'injected content script');

const allowedPermissions = new Set(['activeTab', 'scripting']);
for (const permission of manifest.permissions ?? []) {
  if (!allowedPermissions.has(permission)) warnings.push(`Unexpected permission "${permission}": justify it in the store listing`);
}
if (manifest.host_permissions?.length) warnings.push(`host_permissions present (${manifest.host_permissions.join(', ')}): this must not be published`);
if (manifest.content_security_policy) warnings.push('Custom content_security_policy present; review before publishing');

const files = await walk(root);
for (const file of files) {
  const ext = extname(file);
  const rel = relative(root, file);
  if (!['.js', '.html', '.css'].includes(ext)) continue;
  const text = await readFile(file, 'utf8');
  if (/<script[^>]+src=["']https?:/i.test(text)) errors.push(`${rel}: loads a remote script`);
  if (/import\s*\(\s*["']https?:/.test(text) || /from\s*["']https?:/.test(text)) errors.push(`${rel}: imports remote code`);
  if (/\beval\s*\(/.test(text)) errors.push(`${rel}: uses eval()`);
  if (/\bnew Function\s*\(/.test(text)) errors.push(`${rel}: uses new Function()`);
  if (/localhost:\d+|@vite\/client/.test(text)) errors.push(`${rel}: references the Vite dev server`);
  if (ext === '.html') {
    for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const ref = match[1];
      if (/^(https?:|data:|#)/.test(ref)) continue;
      const target = resolve(join(root, rel, '..'), ref);
      if (!existsSync(target)) errors.push(`${rel}: referenced file "${ref}" is missing`);
    }
  }
}

const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
const totalKb = Math.round(sizes.reduce((sum, size) => sum + size, 0) / 1024);

for (const warning of warnings) console.warn(`⚠ ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}
console.log(`✓ ${relative(process.cwd(), root) || root} is a valid MV3 package (${files.length} files, ${totalKb} KB)`);
