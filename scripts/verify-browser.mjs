/**
 * Browser acceptance checks for the actual release artifacts.
 * Run from the repository root (normal Playwright package + installed browsers):
 *   node scripts/verify-browser.mjs --browser chromium
 *   node scripts/verify-browser.mjs --browser webkit
 * Optional: --standalone PATH --dist PATH --out PATH --executable PATH
 * These are desktop browser-engine checks with mobile viewports, not iOS-device tests.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
}
const { values } = parseArgs({ options: {
  browser: { type: 'string', default: 'chromium' },
  standalone: { type: 'string', default: 'release/NAI5-Artist-Roller-Offline.html' },
  dist: { type: 'string', default: 'dist-pwa' },
  out: { type: 'string', default: 'qa-results' },
  executable: { type: 'string' },
} });
assert(['chromium', 'webkit'].includes(values.browser), 'Use --browser chromium or webkit');
const standalone = path.resolve(values.standalone);
const dist = path.resolve(values.dist);
const output = path.resolve(values.out, values.browser);
const scopePath = '/NAI5-Artist-Roller/';
const storageKey = 'nai5-artist-roller-v1';
await mkdir(output, { recursive: true });
await readFile(standalone);
await readFile(path.join(dist, 'index.html'));

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const requests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  requests.push({ pathname, method: request.method });
  if (!pathname.startsWith(scopePath)) {
    response.writeHead(404); response.end('Outside the repository subdirectory'); return;
  }
  try {
    const relative = decodeURIComponent(pathname.slice(scopePath.length)) || 'index.html';
    const file = path.resolve(dist, relative.endsWith('/') ? `${relative}index.html` : relative);
    if (!file.startsWith(dist + path.sep)) throw new Error('Invalid path');
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache' });
    response.end(data);
  } catch { response.writeHead(404); response.end('Not found'); }
});

const report = { browser: values.browser, startedAt: new Date().toISOString(),
  deviceCoverage: 'Desktop browser engine with mobile viewports; no physical iOS or Android device',
  standalone, dist, checks: [] };
let browser;
let origin;
let currentPage;
let currentContext;

async function context(options = {}) {
  currentContext = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, acceptDownloads: true, ...options });
  // Exercise the deterministic download path, independently of OS sharing UI.
  await currentContext.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  return currentContext;
}
async function open(ctx, url) {
  currentPage = await ctx.newPage();
  currentPage.setDefaultTimeout(10_000);
  const errors = [];
  currentPage.on('pageerror', error => errors.push(error.message));
  await currentPage.goto(url, { waitUntil: 'domcontentloaded' });
  await currentPage.getByRole('heading', { name: 'NAI5 画师串', exact: true }).waitFor();
  return { page: currentPage, errors };
}
async function tab(page, name) {
  await page.getByRole('group', { name: '工作区', exact: true })
    .getByRole('button', { name, exact: true }).click();
}
async function roll(page) {
  await page.locator('.mobile-bottom-bar').getByRole('button', { name: 'ROLL', exact: true }).click();
}
async function stateFromDownload(page) {
  const isOpen = await page.getByRole('heading', { name: '备份与导入', exact: true }).isVisible();
  if (!isOpen) await page.getByRole('button', { name: '备份 / 导入', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整 JSON 备份', exact: true }).click();
  const download = await event;
  assert.equal(await download.failure(), null, 'JSON backup download failed');
  const file = await download.path();
  assert(file, 'Download did not provide a readable file');
  const text = await readFile(file, 'utf8');
  const data = JSON.parse(text);
  assert.equal(data.formatVersion, 1);
  assert.equal(data.catalogSnapshot.length, 1000, 'Built-in dataset not fully embedded');
  assert(data.result?.rows.length >= 1);
  // Export replaces the backup dialog. Check its complete fallback contents,
  // then restore the caller's original dialog state for import/undo actions.
  await page.getByRole('heading', { name: '导出文件', exact: true }).waitFor();
  assert.equal(await page.getByLabel('导出文件内容', { exact: true }).inputValue(), text);
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  if (isOpen) await page.getByRole('button', { name: '备份 / 导入', exact: true }).click();
  return data;
}
async function check(name, run) {
  const result = { name, status: 'running' };
  report.checks.push(result);
  try {
    const details = await run();
    result.status = 'passed';
    if (details) result.details = details;
    console.log(`PASS ${name}`);
  } catch (error) {
    result.status = 'failed'; result.error = error.stack || String(error);
    console.error(`FAIL ${name}: ${error.message}`);
    if (currentPage) await currentPage.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
  } finally {
    await currentContext?.close().catch(() => {});
    currentContext = undefined; currentPage = undefined;
  }
}

try {
  browser = await playwright[values.browser].launch({ headless: true,
    ...(values.executable ? { executablePath: values.executable } : {}) });
  report.engineVersion = browser.version();
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;

  await check('standalone-offline-core-and-backup', async () => {
    const ctx = await context();
    await ctx.setOffline(true);
    const external = [];
    await ctx.route(/^https?:/, route => { external.push(route.request().url()); return route.abort(); });
    const { page, errors } = await open(ctx, pathToFileURL(standalone).href);
    const initial = await stateFromDownload(page);
    assert.equal(initial.poolId, 'top1000');
    await tab(page, '抽取结果');
    const first = page.getByTestId('result-row').first();
    const artist = (await first.locator('.name-cell').innerText()).trim();
    const weight = await first.locator('input').inputValue();
    await first.locator('.lock-cell').click();
    await first.locator('.lock-cell').click();
    await roll(page);
    const locked = page.getByTestId('result-row').filter({ has: page.locator('.name-cell', { hasText: artist }) });
    assert.equal(await locked.count(), 1, 'Locked artist was removed');
    assert.equal(await locked.locator('input').inputValue(), weight, 'Locked weight changed');
    const after = await stateFromDownload(page);
    assert(after.history.length > initial.history.length, 'ROLL did not add history');
    assert.notEqual(after.result.seed, initial.result.seed, 'ROLL did not produce a new result');
    await page.getByRole('button', { name: '备份 / 导入', exact: true }).click();
    await page.getByLabel('读取完整备份', { exact: true }).setInputFiles({ name: 'roundtrip.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(initial)) });
    await page.getByRole('button', { name: '恢复此备份', exact: true }).click();
    const restored = await stateFromDownload(page);
    assert.deepEqual(restored.result, initial.result, 'Restore changed the original result');
    assert.deepEqual(restored.settings, initial.settings, 'Restore changed settings');
    assert.deepEqual(restored.history, initial.history, 'Restore changed history');
    await page.getByRole('button', { name: '撤销本次恢复', exact: true }).click();
    assert.deepEqual((await stateFromDownload(page)).result, after.result, 'Undo did not restore the prior result');
    assert.deepEqual(external, [], 'Standalone requested a network dependency');
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    return { builtInArtists: initial.catalogSnapshot.length, networkRequests: external.length,
      covered: ['offline boot', 'ROLL', 'artist+weight lock', 'JSON export', 'backup restore', 'restore undo'] };
  });

  await check('mobile-layout', async () => {
    const ctx = await context();
    await ctx.setOffline(true);
    const { page, errors } = await open(ctx, pathToFileURL(standalone).href);
    const measurements = [];
    for (const [width, height] of [[360, 800], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      for (const name of ['池与参数', '画师串', '抽取结果']) {
        await tab(page, name);
        const metrics = await page.evaluate(() => {
          const bar = document.querySelector('.mobile-bottom-bar');
          const rect = bar.getBoundingClientRect();
          const visual = window.visualViewport;
          const viewport = { left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0,
            width: visual?.width ?? innerWidth, height: visual?.height ?? innerHeight,
            scale: visual?.scale ?? 1 };
          const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          const hit = document.elementFromPoint(point.x, point.y);
          const identify = element => element ? { tag: element.tagName,
            class: element.getAttribute('class'), label: element.getAttribute('aria-label') } : null;
          return { layoutWidth: innerWidth, layoutHeight: innerHeight,
            clientWidth: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth, viewport,
            bar: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
              width: rect.width, height: rect.height },
            hitTest: { point, target: identify(hit), insideBar: !!hit && bar.contains(hit) },
            overflowElements: [...document.querySelectorAll('body *')].flatMap(element => {
              const box = element.getBoundingClientRect();
              if (!box.width || !box.height || (box.left >= -0.5 && box.right <= document.documentElement.clientWidth + 0.5)) return [];
              return [{ ...identify(element), left: box.left, right: box.right }];
            }).slice(0, 12) };
        });
        measurements.push({ requested: { width, height }, tab: name, ...metrics });
        const diagnostic = `${width}×${height} ${name}: ${JSON.stringify(metrics)}`;
        assert(metrics.documentWidth <= metrics.layoutWidth + 1, `Page overflows horizontally; ${diagnostic}`);
        assert(metrics.documentWidth <= width + 0.5,
          `Content exceeds the requested mobile width (automatic scaling must not hide overflow); ${diagnostic}`);
        // DOMRect and the visible viewport use CSS pixels; mobile engines may
        // apply a fractional page scale after a viewport resize.
        assert(metrics.bar.width > 0 && metrics.bar.height > 0 &&
          metrics.bar.left >= metrics.viewport.left - 1 &&
          metrics.bar.right <= metrics.viewport.left + metrics.viewport.width + 1 &&
          metrics.bar.top >= metrics.viewport.top - 1 &&
          metrics.bar.bottom <= metrics.viewport.top + metrics.viewport.height + 1,
          `Action bar is outside the visible viewport; ${diagnostic}`);
        assert(metrics.hitTest.insideBar, `Action bar center is obscured or unreachable; ${diagnostic}`);
      }
      await page.getByRole('button', { name: '备份 / 导入', exact: true }).click();
      const dialog = page.locator('dialog[open]');
      const box = await dialog.boundingBox();
      assert(box && box.x >= -1 && box.x + box.width <= width + 1, 'Backup dialog exceeds viewport');
      await page.screenshot({ path: path.join(output, `mobile-${width}x${height}.png`), fullPage: true });
      await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    return { viewports: ['360×800', '390×844', '844×390'], measurements };
  });

  await check('storage-denied-still-usable', async () => {
    const ctx = await context();
    await ctx.setOffline(true);
    await ctx.addInitScript(() => Object.defineProperty(window, 'localStorage', {
      configurable: true, get() { throw new DOMException('Blocked for QA', 'SecurityError'); },
    }));
    const { page, errors } = await open(ctx, pathToFileURL(standalone).href);
    await page.locator('.alert').filter({ hasText: '本地存档无法读取' }).waitFor();
    await roll(page);
    assert((await stateFromDownload(page)).history.length >= 2);
    assert.deepEqual(errors, []);
  });

  await check('clipboard-denied-manual-fallback', async () => {
    const ctx = await context();
    await ctx.setOffline(true);
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText() { return Promise.reject(new DOMException('Blocked for QA', 'NotAllowedError')); },
      } });
      document.execCommand = () => false;
    });
    const { page, errors } = await open(ctx, pathToFileURL(standalone).href);
    await page.locator('.mobile-bottom-bar').getByRole('button', { name: '复制画师串', exact: true }).click();
    const text = page.getByLabel('可选复制文本', { exact: true });
    await text.waitFor();
    assert((await text.inputValue()).length > 0);
    await text.focus();
    assert(await text.evaluate(element => element.selectionEnd > element.selectionStart), 'Manual fallback text cannot be selected');
    assert.deepEqual(errors, []);
  });

  await check('download-denied-complete-text-fallback', async () => {
    const ctx = await context();
    await ctx.setOffline(true);
    await ctx.addInitScript(() => {
      URL.createObjectURL = () => { throw new DOMException('Blocked for QA', 'NotSupportedError'); };
    });
    const { page, errors } = await open(ctx, pathToFileURL(standalone).href);
    await roll(page);
    await page.getByRole('button', { name: '备份 / 导入', exact: true }).click();
    await page.getByRole('button', { name: '导出完整 JSON 备份', exact: true }).click();
    await page.getByRole('heading', { name: '导出文件', exact: true }).waitFor();
    await page.getByText(/当前浏览器未能发起下载/).waitFor();
    const text = page.getByLabel('导出文件内容', { exact: true });
    const backup = JSON.parse(await text.inputValue());
    assert.equal(backup.catalogSnapshot.length, 1000);
    assert(backup.history.length >= 2);
    await text.focus();
    assert(await text.evaluate(element => element.selectionEnd > element.selectionStart));
    assert.deepEqual(errors, []);
  });

  await check('pwa-subdirectory-and-offline-reopen', async () => {
    const ctx = await context();
    const { page, errors } = await open(ctx, origin + scopePath);
    const manifestURL = await page.locator('link[rel="manifest"]').getAttribute('href');
    assert(manifestURL, 'Manifest link missing');
    const resolvedManifest = new URL(manifestURL, page.url());
    assert(resolvedManifest.pathname.startsWith(scopePath), 'Manifest escaped repository subdirectory');
    const manifestResponse = await ctx.request.get(resolvedManifest.href);
    assert.equal(manifestResponse.status(), 200);
    const manifest = await manifestResponse.json();
    assert(new URL(manifest.start_url, resolvedManifest).pathname.startsWith(scopePath), 'PWA start_url escaped repository subdirectory');
    assert(new URL(manifest.scope || '.', resolvedManifest).pathname.startsWith(scopePath), 'PWA scope escaped repository subdirectory');
    assert(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display), 'PWA display mode missing');
    for (const icon of manifest.icons || []) {
      const iconURL = new URL(icon.src, resolvedManifest);
      assert(iconURL.pathname.startsWith(scopePath), 'PWA icon escaped repository subdirectory');
      assert.equal((await ctx.request.get(iconURL.href)).status(), 200, `Missing icon ${icon.src}`);
    }
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20_000 });
    const worker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const names = await caches.keys();
      const appCaches = names.filter(name => /nai5/i.test(name));
      return { scope: registration.scope, script: registration.active.scriptURL,
        caches: await Promise.all(appCaches.map(async name => ({ name,
          entries: (await (await caches.open(name)).keys()).map(request => request.url) }))) };
    });
    assert.equal(new URL(worker.scope).pathname, scopePath);
    assert(new URL(worker.script).pathname.startsWith(scopePath));
    assert(worker.caches.some(cache => cache.entries.length > 0), 'App offline cache is empty');
    for (const cache of worker.caches) for (const entry of cache.entries) {
      assert(new URL(entry).pathname.startsWith(scopePath), `Cached outside scope: ${entry}`);
    }
    await page.getByRole('button', { name: '网页版', exact: true }).click();
    await page.getByText('离线已就绪', { exact: true }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    const before = await stateFromDownload(page);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'NAI5 画师串', exact: true }).waitFor();
    assert.deepEqual((await stateFromDownload(page)).result, before.result, 'Offline reload lost saved result');
    await roll(page);
    const after = await stateFromDownload(page);
    assert(after.history.length > before.history.length);
    const reopened = await open(ctx, origin + scopePath);
    assert.deepEqual((await stateFromDownload(reopened.page)).result, after.result, 'New offline tab lost current saved state');
    assert.deepEqual(errors, []);
    assert.deepEqual(reopened.errors, []);
    assert(!requests.some(request => request.pathname === '/__nai5_fetch'), 'Static app tried to use root dev proxy');
    return worker;
  });
} catch (error) {
  report.fatalError = error.stack || String(error);
  console.error(report.fatalError);
} finally {
  await currentContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server.listening) await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  report.passed = !report.fatalError && report.checks.length === 6 && report.checks.every(check => check.status === 'passed');
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
if (!report.passed) process.exitCode = 1;
