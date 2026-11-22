# V5 收藏前1000：来源与复现

**榜单口径**：TAGs 的 V5 页面候选集，按站内 FAVS 降序，保留同票源站顺序，跨页去重后取 1000 个画师。主入口为 <https://tags.gallery/en/v5?s=favorites>。

## 本次有效采集

- 单次连续采集目录：`raw/browser-2026-11-22T14-17-46-188Z/`。
- 17 页 × 60 条 = 1020 条；去重后仍为 1020 条；发布源站顺序 1–1000。
- 每页候选总数一致为 3397；每个实际浏览器 URL 显式包含 `s=favorites`。
- 开始、结束、各页时间和 URL 均保存在 `source.json`。时间为 UTC ISO 8601。
- 每页保存 `header`、`observedUrl`、60 个公开卡片的 `cardHtml`，以及从 DOM 解析的 tag、FAVS、详情链接和缩略图地址。更新器再次解析卡片 HTML，检查解析值与记录一致。
- 不将之前受限的网页缓存片段拼入本次快照。早期失败与旧缓存证据仍留在 `raw/`；发布清单只引用上述单次有效目录。

## 字段

| 字段 | 含义 |
|---|---|
| `id` | 本工具稳定 ID：`tags.gallery:` + 原始 tag；不是声称取得的上游数据库 ID |
| `tag` / `displayName` | 源站原始 tag，保留空格、括号、限定词与符号 |
| `sourceRank` | 1 起始的源站跨页顺序；同票不改变顺序 |
| `favorites` | FAVS，站内收藏数 |
| `sourceUrl` | 实际公开卡片链接的画师详情地址 |
| `modelEvidence` | `v5_gallery_sample` 或 `v5_gallery_listing`，见下文 |
| `sampleUrl` / `sampleModel` | 卡片实际显示的缩略图地址及其路径中明确出现的模型标记 |
| `aliases` | 来源明确提供的别名；本次未取得，为 `null` |
| `postCount` | Danbooru 投稿数（POSTS）；本次未取得，为 `null` |
| `topScore` | Danbooru 最高分单张作品的分数（SCORE）；本次未取得，为 `null` |

## 榜单归属与样图证据不同

992 个条目的卡片图片路径为 `/images/v5_*`，标记 `v5_gallery_sample`。

以下 8 个条目**确实出现在本次 V5 候选榜中**，但卡片使用其他模型图片。保留源站顺序，标记 `v5_gallery_listing`：

| tag | 卡片实际模型 |
|---|---|
| kafun | v45 |
| puddinghomhom | v45 |
| radishkek | v45 |
| hone kawa | illust |
| juukyuu | illust |
| tsukumo kazuita | illust |
| twistedscarlett60 | v45 |
| suo bu ye feng | v45 |

这里的 V5 指第三方页面的候选集归属，不是官方训练名单。没有用 V4.5 页面、ILLUST 页面或 Danbooru 投稿数榜补充条目。榜单会随站内收藏变化；本快照反映所记录时间窗口，不是服务器原子事务快照。

## 复现与更新失败

从项目根目录运行：

```powershell
python scripts/update_artists.py --from-browser data/raw/browser-2026-11-22T14-17-46-188Z
```

实时更新使用 `python scripts/update_artists.py`。它始终串行翻页并显式保持 `s=favorites`，拒绝分页不一致、候选总数改变、收藏数逆序和来源模型不符。完整结果才替换已发布数据；失败记录留在本轮目录，既有 JSON、CSV 与来源清单不被覆盖。需要正常浏览器验证时，由用户验证后使用 `scripts/capture-browser.mjs` 读取公开 DOM，再交给同一更新器校验发布。
