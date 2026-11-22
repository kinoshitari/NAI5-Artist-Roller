# NAI5 画师调配台

现在提供 **自包含单 HTML** 和 **可离线使用的 PWA 网页版**。两者均保留内置 1000 位画师、抽取与权重调配、锁人／锁重、质量预设、历史与收藏、自建池、完整备份及数据解析。选画师池，点 **ROLL**，再点 **复制画师串** 或 **复制画师＋预设**。

## 直接使用

### 下载单个 HTML

[下载 NAI5-Artist-Roller-Offline.html](release/NAI5-Artist-Roller-Offline.html)：在 GitHub 文件页点击 **Download raw file**，保存完整 `.html` 文件后用浏览器打开。应用代码、样式、图标和全部内置画师数据已集成，不需要 Node.js、开发依赖或 CDN；核心调配、预设和备份功能可离线运行。在线拉取画师源和打开外部来源链接仍需网络。

**iPhone／iPad 请优先使用下面的 HTTPS 网页版。** 系统“文件”中的 HTML 预览不保证执行应用脚本；把文件下载到手机不等于已安装可运行的网页应用。安卓也应使用能够执行本地 HTML 的浏览器打开文件，或直接使用 HTTPS 网页版。

### iOS Safari 与安卓 Chrome

将 PWA 部署到 HTTPS 静态网站后，手机用户直接打开网址即可使用，无需安装 Node.js 或打包原生 App。首次联网打开后，点顶部 **网页版**，等到显示 **离线已就绪**，再断网使用；换浏览器、清除网站数据或系统清理缓存后，需要重新联网加载。

- **iOS Safari**：打开网页，在分享菜单选择 **添加到主屏幕**；系统提供该选项时启用“作为网页 App 打开”。步骤见 [Apple 官方说明](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios)。添加后从主屏幕启动，联网确认离线缓存就绪。
- **安卓 Chrome**：打开网页，从浏览器菜单选择“安装应用”或“添加到主屏幕”；具体名称以浏览器显示为准。也可继续在浏览器标签页使用。

仓库已提供构建和部署工作流；**是否已经上线，以 GitHub Pages 的部署结果为准**。首次启用步骤见下面“发布到 GitHub Pages”。

### Windows 本地服务与 Android APK

原有 Windows 启动方式保留：已有桌面快捷方式 **`NAI5 画师调配台`**、**`NAI5-Artist-Roller.exe`** 无黑框启动器或 `启动工具.cmd` 会打开 `http://127.0.0.1:4173/`。从源码首次使用时，先安装依赖并执行 `npm run build` 生成 `dist/`；源码仓库不附带 `dist/`。后续启动本地服务只需要 Node.js 和构建产物。

关闭网页不会停止本地服务；双击 `停止工具.cmd` 可停止本项目自己的进程。服务仅监听 `127.0.0.1`，不开放局域网访问，不连接 NovelAI。Capacitor Android APK 构建入口继续保留，可使用原生 HTTP 拉取画师源。

## 日常使用

- 默认从 **V5 收藏前1000** 等概率无放回抽取 **3–6 位**，主次分层、总和自动、**2.5D精致·中**、3D `0.45`、脸部抑制 `-0.80`；前缀与年份默认关闭。
- 每行锁定按钮依次为 **未锁 → 锁人 → 锁重**。锁人保留身份和层级；锁重额外保留权重。点击“辅 / 点缀”可设为主画师，涉及锁定项时先解锁。
- 内置排名池只读。要编辑成员，在“管理”里复制为自建池；勾选“全库”可寻找新成员，再明确点“加入池”。搜索不会修改池成员。
- **新建画师拉取源**：点画师池右上角的云下载图标，可直接新建在线拉取源，支持内置模板（Danbooru 画师榜 / 热门作品、Yande.re、Safebooru、TAGs Gallery）及 JSON / CSV / 纯文本 / 网页 CSS 选择器 / 正则表达式提取，支持 `{page}` 多页拉取与手动粘贴源码提取。单 HTML 和 PWA 的跨域读取需要来源网站允许 CORS；遇到限制时可导入文件或粘贴内容提取。Windows 本地服务保留内置代理，Android APK 保留 Capacitor 原生 HTTP 请求。
- 每次 ROLL、重掷或局部调整保存实际结果；最近 50 次记录支持恢复与收藏。切换预设后，可展开历史点“保存当前”，另存这一版本。
- 浏览器允许本地存储时，配置、历史和自建池存于 **当前浏览器、当前地址** 的 localStorage。开发地址 `5173`、正式地址 `4173`、HTTPS 站点和本地 HTML 不自动共享存档；迁移时使用完整 JSON 备份。存储被禁止或空间不足时会明确提示“仅当前会话”，仍可继续操作和导出备份。重要配置请定期导出。
- 手机版提供 Capacitor Android APK（见 GitHub Releases / Actions 产物），底部常驻 ROLL 与复制按钮，支持原生拉取画师源与离线调配。

## 数据：同一轮采集的 1000 个真实条目

- 来源：[TAGs V5 收藏榜](https://tags.gallery/en/v5?s=favorites)，第三方候选榜单。
- 2026-11-22 连续读取 17 页，每页 60 条，共 1020 条，无跨页重复，按源站顺序取前 1000 条。
- 每页显式保留 `s=favorites`，检查 V5 标题、FAVS、页码、候选总数和收藏数降序；同票不自行改序。
- **992 条**观察到 V5 缩略图；**8 条**属于 V5 页面候选，但源站显示 V4.5 或 ILLUST 缩略图。后者标记 `v5_gallery_listing`，保留其原始名次，不伪称 V5 样图，也不从其他榜单补位。
- `favorites` 为站内收藏数；`postCount` 为 Danbooru 投稿数；`topScore` 为 Danbooru 单张最高分。当前公开收藏卡片未提供的 `aliases`、`postCount`、`topScore` 全部为 `null`。
- 本地稳定 ID 使用 `tags.gallery:` 加原始 tag；名称中的空格、括号、限定词均保留。样图仅链接到来源，不随应用打包。

完整来源、UTC 时间窗口、字段与原始证据见 [`data/SOURCE.md`](data/SOURCE.md) 和 [`data/source.json`](data/source.json)。

## 开发、检查与构建

使用 Node.js **22.12 或更新的兼容版本**，Python **3.10+**（仅用于更新器与其测试）。Windows PowerShell 中使用 `npm.cmd` 可避免脚本包装器对参数的处理差异。

```sh
cd NAI5-Artist-Roller
npm ci
npm run dev           # http://127.0.0.1:5173/
npm test              # 算法、预设、导入、历史、浏览器 IO 与来源请求测试
python -m unittest discover -s tests -p 'test_*.py' -v
npm run build         # 原 Windows / Android 网页资源，输出 dist/
npm run build:single  # 单 HTML 与 SHA-256 校验文件，输出 release/
npm run build:pwa     # 生成 release/ 单 HTML，再构建 dist-pwa/ 网页版
node scripts/serve.mjs    # 正式构建，本机 4173 端口
```

`dist-pwa/` 包含页面资源、应用图标、manifest、离线 Service Worker，以及 `downloads/` 中的单 HTML 下载文件。发布时上传整个目录，支持部署在仓库子路径。`dist/`、`dist-pwa/` 和开发依赖不随源码提交；`release/NAI5-Artist-Roller-Offline.html` 与对应 `.sha256` 作为可下载成品保留。

已有服务运行时可重复双击启动，不会启动第二份。4173 被其他程序占用时会报错，不会停止其他程序。需要自选端口时，可手动运行 `$env:PORT=4180; node scripts/serve.mjs`；这会使用该新地址对应的浏览器存储。

### 发布到 GitHub Pages

[`Build HTML and Web App`](.github/workflows/web.yml) 会运行测试、构建 HTML／PWA 并上传产物；主分支构建通过后会尝试部署 Pages。首次使用需要仓库管理员完成：

1. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 在 **Actions → Build HTML and Web App** 选择主分支并运行工作流，或向主分支推送更新。
3. 确认构建和部署均成功，再打开 Pages 设置或部署任务给出的 HTTPS 地址。

工作流文件存在不代表 Pages 已启用，也不代表当前版本已经上线。流程依据 [GitHub Pages 发布源设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) 和 [自定义工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。不使用 Pages 时，也可把完整 `dist-pwa/` 部署到其他 HTTPS 静态托管服务。

## 更新画师数据

```powershell
python scripts/update_artists.py
```

更新器串行请求、请求间隔 1.2 秒；429 和暂时性服务器错误指数退避，最多 3 次。403 停止并保留原数据，不尝试绕过验证。只有完整、验证通过的 1000 条会替换内置快照；旧版保存到 `data/versions/`。失败候选及证据保存在本次 `data/raw/update-*` 目录。

本次来源要求人工完成 Cloudflare 验证，随后通过正常浏览器公开 DOM 采集。浏览器采集函数在 `scripts/capture-browser.mjs`，注释给出了 Codex CUA 调用方式；不读取 Cookie 或凭据。每页卡片 HTML 与请求地址都保存。可以不联网重放本次数据：

```powershell
python scripts/update_artists.py --from-browser data/raw/browser-2026-11-22T14-17-46-188Z
```

`--from-html <单次运行目录>` 可重放 HTTP 收集的 HTML 与 `.meta.json`；`--from-snapshots <目录>` 可重放公开网页阅读器的响应摘要。不同采集轮次不要拼接。数据更新后按使用方式重新执行 `build`、`build:single` 或 `build:pwa`，替换相应产物；PWA 可在“网页版”中检查更新。历史使用存储的实际结果和预设，不被新版数据重算。

## 导入与备份

“备份 / 导入”提供完整状态恢复、池 JSON / CSV 导入与导出。CSV 至少包含 `tag`；`aliases` 是 JSON 数组或 `null`。导入会检查结构、数值、重复 ID、tag / 别名关系与安全链接。声明的别名与现有库匹配时使用同一身份；相互冲突的别名关系会拒绝，要求先合并记录。

完整备份带 `formatVersion: 1`、源画师目录快照和全部历史，继续兼容原有存档。恢复前显示摘要，当前会话可撤销此次恢复。文本按文本渲染，不作为 HTML 执行。

导出会打开文件面板并请求下载；支持文件分享的浏览器还可选择 **保存 / 分享**。面板始终保留完整文件内容，下载受限时可复制文本并按所示文件名保存。界面只确认“已请求下载”，文件是否落盘请以下载列表或系统保存位置为准。剪贴板不可用时提供可选文本；提示词也可下载为 `.txt`。

单 HTML 和 PWA 均可导入、导出 JSON／CSV。存储失败时更改只存在当前会话，关闭页面前请先导出完整备份；更换 HTML 文件位置、浏览器或网址前也建议先备份。

## 验证与界面参考

浏览器验收脚本为 [`scripts/verify-browser.mjs`](scripts/verify-browser.mjs)，Playwright 已列入开发依赖。先构建产物，再安装浏览器引擎并执行：

```sh
npm run build:pwa
npx playwright install chromium webkit
npm run test:browser -- --browser chromium
npm run test:browser -- --browser webkit
```

检查覆盖单 HTML 断网启动、1000 条内置数据、调配与锁定、备份恢复／撤销、360px 等移动视口、存储／剪贴板／下载受限回退，以及子目录部署与 PWA 离线重开。报告与截图写入 `qa-results/`，CI 产物名为 `browser-qa`。这些是桌面 Chromium／WebKit 引擎配合移动视口的检查，**不等于 iOS 或安卓真机验收**；当前未提供真实设备测试结果。

见 [`docs/verification.md`](docs/verification.md) 和 [`docs/screenshots/`](docs/screenshots/)。界面参考映射在 [`docs/reference-mapping.md`](docs/reference-mapping.md)，参考 PNG 保存在 `references/`，不嵌入应用或作为自有素材发布。

预设是本工具的提示词配方，不绑定具体人物或场景。NovelAI 的 **Add Quality Tags** 会另外追加词；单独比较本工具预设时，可按需关闭该选项。官方说明：[数字加权](https://docs.novelai.net/en/image/strengthening-weakening/)、[标签](https://docs.novelai.net/en/image/tags/)、[质量标签](https://docs.novelai.net/en/image/qualitytags/)、[风格提示](https://docs.novelai.net/en/image/tutorial-artstyles/)。
