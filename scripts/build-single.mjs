import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const singleName = 'NAI5-Artist-Roller-Offline.html';

/** Bundle the same application entry as one classic script, including all data. */
export async function buildSingle() {
  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    plugins: [react()],
    base: './',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __NAI5_BROWSER_ONLY__: 'true',
      __NAI5_PWA__: 'false',
    },
    build: {
      write: false,
      target: ['safari15.4', 'chrome100'],
      minify: 'esbuild',
      cssCodeSplit: false,
      sourcemap: false,
      lib: { entry: path.join(root, 'src/main.tsx'), name: 'NAI5ArtistRoller', formats: ['iife'] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
  const scripts = outputs.filter(a => a.type === 'chunk');
  const styles = outputs.filter(a => a.type === 'asset' && a.fileName.endsWith('.css'));
  const extras = outputs.filter(a => a.type === 'asset' && !a.fileName.endsWith('.css'));
  if (scripts.length !== 1 || scripts[0].imports.length || scripts[0].dynamicImports.length || extras.length) {
    throw new Error(`Single-file build has external assets: ${outputs.map(a => a.fileName).join(', ')}`);
  }
  const script = scripts[0].code.replace(/<\/script/gi, '<\\/script');
  const css = styles.map(a => String(a.source)).join('\n').replace(/<\/style/gi, '<\\/style');
  const icon = await readFile(path.join(root, 'web/icon.svg'), 'utf8');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#15191d">
<meta name="description" content="NAI5 画师调配台：完整画师库、分层权重、预设与离线备份。">
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">
<title>NAI5 画师调配台 · 离线版</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<noscript>此工具需要执行 JavaScript。请在浏览器中打开；iPhone 用户请使用项目的在线网页版，而非“文件”中的预览。</noscript>
<script>${script}</script>
</body>
</html>
`;
  const dir = path.join(root, 'release');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, singleName), html);
  const sha = createHash('sha256').update(html).digest('hex');
  await writeFile(path.join(dir, `${singleName}.sha256`), `${sha}  ${singleName}\n`);
  console.log(`Single HTML: release/${singleName} (${Buffer.byteLength(html)} bytes, SHA-256 ${sha})`);
  return { name: singleName, html, sha };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSingle();
