import { build } from 'vite';
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildSingle } from './build-single.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const single = await buildSingle();
await build({ root, mode: 'pwa' });
const output = path.join(root, 'dist-pwa');
for (const name of ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  await cp(path.join(root, 'web', name), path.join(output, name));
}
const indexPath = path.join(output, 'index.html');
let html = await readFile(indexPath, 'utf8');
html = html.replace('</head>', `<link rel="manifest" href="./manifest.webmanifest">
    <link rel="icon" href="./icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="./apple-touch-icon.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="NAI5画师">
  </head>`);
await writeFile(indexPath, html);
await mkdir(path.join(output, 'downloads'), { recursive: true });
await writeFile(path.join(output, 'downloads', single.name), single.html);
await writeFile(path.join(output, 'downloads', `${single.name}.sha256`), `${single.sha}  ${single.name}\n`);
await writeFile(path.join(output, '.nojekyll'), '');
async function list(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await list(path.join(dir, entry.name), rel + '/'));
    else if (!entry.name.startsWith('.')) files.push(rel);
  }
  return files.sort();
}
const files = await list(output);
const workerTemplate = await readFile(path.join(root, 'web/service-worker.js'), 'utf8');
const hash = createHash('sha256').update(workerTemplate);
for (const file of files) hash.update(file).update(await readFile(path.join(output, file)));
const version = hash.digest('hex').slice(0, 20);
const worker = workerTemplate
  .replace('__CACHE_VERSION__', JSON.stringify(version))
  .replace('__PRECACHE_FILES__', JSON.stringify(files));
await writeFile(path.join(output, 'sw.js'), worker);
console.log(`PWA: dist-pwa/ (${files.length} offline resources, cache ${version})`);
