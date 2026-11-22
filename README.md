# NAI5 画师调配台

双击桌面快捷方式 **`NAI5 画师调配台`**，或直接双击项目目录中的 **`NAI5-Artist-Roller.exe`**（无黑框启动器，也可继续使用 `启动工具.cmd`），浏览器会打开 `http://127.0.0.1:4173/`。选画师池，点 **ROLL**，再点 **复制画师串** 或 **复制画师＋预设**。

已附构建好的 `dist/`，本机只需 Node.js，不必先安装开发依赖。关闭网页不会停止本地服务；双击 `停止工具.cmd` 可停止本项目自己的进程。服务仅监听 `127.0.0.1`，不开放局域网访问，不连接 NovelAI。

## 日常使用

- 默认从 **V5 收藏前1000** 等概率无放回抽取 **3–6 位**，主次分层、总和自动、**2.5D精致·中**、3D `0.45`、脸部抑制 `-0.80`；前缀与年份默认关闭。
- 每行锁定按钮依次为 **未锁 → 锁人 → 锁重**。锁人保留身份和层级；锁重额外保留权重。点击“辅 / 点缀”可设为主画师，涉及锁定项时先解锁。
- 内置排名池只读。要编辑成员，在“管理”里复制为自建池；勾选“全库”可寻找新成员，再明确点“加入池”。搜索不会修改池成员。
- **新建画师拉取源**：点画师池右上角的云下载图标，可直接新建在线拉取源，支持内置模板（Danbooru 画师榜 / 热门作品、Yande.re、Safebooru、TAGs Gallery）及任意 JSON / CSV / 纯文本 / 网页 CSS 选择器 / 正则表达式提取，支持 `{page}` 多页拉取与手动粘贴源码提取。桌面端通过内置本地代理绕过浏览器 CORS，手机 APK 通过 Capacitor 原生 HTTP 直接请求。
- 每次 ROLL、重掷或局部调整保存实际结果；最近 50 次记录支持恢复与收藏。切换预设后，可展开历史点“保存当前”，另存这一版本。
- 配置、历史和自建池存于 **当前浏览器、当前地址** 的 localStorage。开发地址 `5173` 和正式地址 `4173` 是不同存储空间；迁移时使用完整 JSON 备份。重要配置请定期导出，不要只依赖浏览器存储。
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

```powershell
cd 'G:\AI\日常\NAI5-Artist-Roller'
npm.cmd ci
npm.cmd run dev           # http://127.0.0.1:5173/
npm.cmd test              # 算法、预设、导入、历史测试
python -m unittest discover -s tests -p 'test_*.py' -v
npm.cmd run build         # 输出 dist/
node scripts/serve.mjs    # 正式构建，本机 4173 端口
```

已有服务运行时可重复双击启动，不会启动第二份。4173 被其他程序占用时会报错，不会停止其他程序。需要自选端口时，可手动运行 `$env:PORT=4180; node scripts/serve.mjs`；这会使用该新地址对应的浏览器存储。

## 更新画师数据

```powershell
python scripts/update_artists.py
```

更新器串行请求、请求间隔 1.2 秒；429 和暂时性服务器错误指数退避，最多 3 次。403 停止并保留原数据，不尝试绕过验证。只有完整、验证通过的 1000 条会替换内置快照；旧版保存到 `data/versions/`。失败候选及证据保存在本次 `data/raw/update-*` 目录。

本次来源要求人工完成 Cloudflare 验证，随后通过正常浏览器公开 DOM 采集。浏览器采集函数在 `scripts/capture-browser.mjs`，注释给出了 Codex CUA 调用方式；不读取 Cookie 或凭据。每页卡片 HTML 与请求地址都保存。可以不联网重放本次数据：

```powershell
python scripts/update_artists.py --from-browser data/raw/browser-2026-11-22T14-17-46-188Z
```

`--from-html <单次运行目录>` 可重放 HTTP 收集的 HTML 与 `.meta.json`；`--from-snapshots <目录>` 可重放公开网页阅读器的响应摘要。不同采集轮次不要拼接。数据更新后重新 `npm.cmd run build`，刷新正式页面即可；历史使用存储的实际结果和预设，不被新版数据重算。

## 导入与备份

“备份 / 导入”提供完整状态恢复、池 JSON / CSV 导入与导出。CSV 至少包含 `tag`；`aliases` 是 JSON 数组或 `null`。导入会检查结构、数值、重复 ID、tag / 别名关系与安全链接。声明的别名与现有库匹配时使用同一身份；相互冲突的别名关系会拒绝，要求先合并记录。

完整备份带 `formatVersion: 1`、源画师目录快照和全部历史。恢复前显示摘要，当前会话可撤销此次恢复。文本按文本渲染，不作为 HTML 执行。剪贴板不可用时会打开可选文本，并提供下载 `.txt`。

## 验证与界面参考

见 [`docs/verification.md`](docs/verification.md) 和 [`docs/screenshots/`](docs/screenshots/)。界面参考映射在 [`docs/reference-mapping.md`](docs/reference-mapping.md)，参考 PNG 保存在 `references/`，不嵌入应用或作为自有素材发布。

预设是本工具的提示词配方，不绑定具体人物或场景。NovelAI 的 **Add Quality Tags** 会另外追加词；单独比较本工具预设时，可按需关闭该选项。官方说明：[数字加权](https://docs.novelai.net/en/image/strengthening-weakening/)、[标签](https://docs.novelai.net/en/image/tags/)、[质量标签](https://docs.novelai.net/en/image/qualitytags/)、[风格提示](https://docs.novelai.net/en/image/tutorial-artstyles/)。
