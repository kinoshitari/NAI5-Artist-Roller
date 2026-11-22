# 单 HTML 与手机网页版验证

验证日期：2026-11-23（Asia/Shanghai）。代码版本：`47a046c782b70893b91eef51e2de9765bf8885c2`。

## 可下载成品

- 文件：[`NAI5-Artist-Roller-Offline.html`](../release/NAI5-Artist-Roller-Offline.html)
- 大小：706,914 字节。
- SHA-256：`8b6da9cf4cdee20c49380a543892167201e1024ddf961f321636d6507e7d25f0`
- 应用代码、样式、图标及完整 1000 位画师数据内嵌；没有外部脚本或样式加载依赖。
- `npm run build:pwa` 同时生成独立 HTML 和 `dist-pwa/`，后者包含全部离线资源及 HTML 下载入口。

## 实际检查结果

[GitHub Actions 验收运行](https://github.com/kinoshitari/NAI5-Artist-Roller/actions/runs/45043665751) 全部成功。该运行的 `browser-qa` 产物包含两种引擎的 JSON 报告和移动视口截图；HTML 成品另有下载产物。

| 检查 | 结果 |
| --- | --- |
| 单元测试 | 72 / 72 通过 |
| 原 Windows / Android 网页资源构建 | 通过 |
| 单 HTML 和 PWA 构建 | 通过 |
| CI 重新构建与仓库成品逐字节一致 | 通过 |
| Chromium 159.0.8154.6 | 6 / 6 组验收通过 |
| WebKit 27.2 | 6 / 6 组验收通过 |

两种引擎均运行了以下检查：

1. 在完全断网条件下从 `file://` 打开单 HTML，确认 1000 位内置画师、ROLL、锁人和锁重、历史新增、完整 JSON 导出、恢复和撤销恢复；启动和核心操作的网络依赖请求数为 0。
2. 在 360×800、390×844、844×390 三种视口逐一检查三个工作区、底部按钮和弹窗。页面宽度与目标宽度一致，页面缩放为 1，底栏处于可见区域且中心命中可操作元素。
3. 禁止浏览器存储后仍能抽取并导出当前完整备份。
4. 拒绝剪贴板权限后提供可选择的完整文本。
5. 禁止 Blob 下载后保留完整导出文本，包含 1000 位画师及当前历史。
6. 以 `/NAI5-Artist-Roller/` 子目录提供 PWA，检查 manifest、图标、Service Worker 的范围和真实缓存；确认“离线已就绪”后，断网刷新和新开页面均能恢复数据并继续抽取。

测试使用 Playwright 1.65.1，在 GitHub 托管的 Ubuntu 环境运行。它验证桌面浏览器引擎与移动视口，不代表 iPhone 或安卓真机测试。

## 发布与使用范围

此记录证明构建产物与浏览器验收通过。GitHub Pages 是否公开可用应另看 `main` 的部署任务和仓库 Pages 设置；验收分支没有部署网站。

iOS 的支持入口是部署后的 HTTPS 网页，通过 Safari 打开或添加到主屏幕。iOS“文件”预览不作为可运行应用入口。安卓和桌面可使用 HTTPS 网页，也可使用支持执行本地 HTML 的浏览器打开独立文件。

在线来源仍需要网络及来源网站允许浏览器跨域读取；不允许时可使用文件导入或手动粘贴提取。原 Windows 本地代理、Android 原生 HTTP 和既有存储格式继续保留。

## 复现

```sh
npm ci
npm test
npm run build
npm run build:pwa
npx playwright install --with-deps chromium webkit
npm run test:browser -- --browser chromium
npm run test:browser -- --browser webkit
```
