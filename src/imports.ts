import type {
  AppState,
  Artist,
  ArtistSource,
  HistoryEntry,
  Preset,
  Row,
  Settings,
  SourceParserMode,
} from "./types";
import { defaults, cents } from "./engine";
import { outputs } from "./presets";

type Obj = Record<string, unknown>;
function object(v: unknown, label: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error(`${label}格式错误`);
  return v as Obj;
}
function string(v: unknown, label: string): string {
  if (typeof v !== "string" || v.length > 100000)
    throw new Error(`${label}须为文本`);
  return v;
}
function strings(v: unknown, label: string): string[] {
  if (!Array.isArray(v)) throw new Error(`${label}须为数组`);
  return v.map((x) => string(x, label));
}
function integer(v: unknown, label: string, min = 0): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min)
    throw new Error(`${label}须为不小于 ${min} 的整数`);
  return v;
}
function nullableNumber(v: unknown, label: string) {
  return v === null || v === undefined || v === ""
    ? null
    : integer(typeof v === "string" && /^\d+$/.test(v) ? +v : v, label);
}
export const tagKey = (s: string) =>
  s
    .trim()
    .replace(/^(?:artist:\s*)+/i, "")
    .toLowerCase();
export function safeSourceUrl(s: string | null) {
  return s && /^https?:\/\//i.test(s) ? s : undefined;
}
function artist(v: unknown): Artist {
  const a = object(v, "画师"),
    tag = string(a.tag, "tag").trim();
  if (
    !tag ||
    /[\r\n\x00-\x1f]/.test(tag) ||
    tag.includes("::") ||
    tag.includes(",")
  )
    throw new Error("tag 不能为空，或含有换行、逗号、加权分隔符");
  const id = a.id === undefined ? `local:${tagKey(tag)}` : string(a.id, "id");
  if (!id.trim()) throw new Error("id 不能为空");
  let aliases = a.aliases;
  if (typeof aliases === "string") {
    try {
      aliases = JSON.parse(aliases);
    } catch {
      throw new Error("CSV aliases 须为 JSON 数组或 null");
    }
  }
  const list = aliases == null ? null : strings(aliases, "aliases");
  if (
    list &&
    (list.some((x) => !x.trim()) ||
      new Set(list.map(tagKey)).size !== list.length ||
      list.some((x) => tagKey(x) === tagKey(tag)))
  )
    throw new Error(`${tag} 的别名重复或与 tag 相同`);
  const sourceUrl =
    a.sourceUrl == null || a.sourceUrl === ""
      ? null
      : string(a.sourceUrl, "来源链接");
  if (sourceUrl && !safeSourceUrl(sourceUrl))
    throw new Error("来源链接只能使用 http 或 https");
  const sampleFields: Pick<Artist, "sampleUrl" | "sampleModel"> = {};
  if (a.sampleUrl !== undefined) {
    sampleFields.sampleUrl = a.sampleUrl == null || a.sampleUrl === "" ? null : string(a.sampleUrl, "样图链接");
    if (sampleFields.sampleUrl && !safeSourceUrl(sampleFields.sampleUrl)) throw new Error("样图链接只能使用 http 或 https");
  }
  if (a.sampleModel !== undefined) sampleFields.sampleModel = a.sampleModel == null || a.sampleModel === "" ? null : string(a.sampleModel, "样图模型");
  return {
    ...sampleFields,
    id,
    tag,
    displayName:
      a.displayName == null || a.displayName === ""
        ? tag
        : string(a.displayName, "displayName"),
    aliases: list,
    sourceRank: nullableNumber(a.sourceRank, "源站顺序"),
    favorites: nullableNumber(a.favorites, "FAVS"),
    postCount: nullableNumber(a.postCount, "POSTS"),
    topScore: nullableNumber(a.topScore, "SCORE"),
    sourceUrl,
    modelEvidence:
      a.modelEvidence == null || a.modelEvidence === ""
        ? null
        : string(a.modelEvidence, "modelEvidence"),
  };
}
export function validateArtists(v: unknown): Artist[] {
  if (!Array.isArray(v) || !v.length) throw new Error("画师列表须为非空数组");
  const rows = v.map(artist),
    ids = new Set<string>(),
    names = new Map<string, string>();
  for (const a of rows) {
    if (ids.has(a.id)) throw new Error(`重复 ID：${a.id}`);
    ids.add(a.id);
    for (const key of [a.tag, ...(a.aliases ?? [])].map(tagKey)) {
      const old = names.get(key);
      if (old)
        throw new Error(
          `tag／别名关系重叠：${old} 与 ${a.tag}，请合并为一条记录`,
        );
      names.set(key, a.tag);
    }
  }
  return rows;
}
// Accept the artist-only text emitted by the app as well as plain tag lists.
export function parseArtistTags(input: string): Artist[] {
  const names = new Map<string, string>();
  for (const item of input.split(/[,，\r\n]+/)) {
    const value = item.trim();
    if (!value) continue;
    const weighted = value.match(/^[+]?(?:\d+(?:\.\d+)?|\.\d+)::\s*(.+?)\s*::$/);
    const tag = (weighted?.[1] ?? value).replace(/^artist:\s*/i, "").trim();
    const key = tagKey(tag);
    if (!key || /::|^artist:|^https?:/i.test(tag))
      throw new Error(`无效画师标签：${value}。请输入画师名或完整的 NAI 加权标签`);
    if (!names.has(key)) names.set(key, tag);
  }
  if (!names.size) throw new Error("请输入至少一位画师");
  return validateArtists([...names.values()].map((tag) => ({ tag })));
}

export function parseCsv(text: string): Record<string, string>[] {
  const table: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') {
      if (cell) throw new Error("CSV 引号位置错误");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) table.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV 引号未闭合");
  if (cell || row.length) {
    row.push(cell);
    table.push(row);
  }
  const headers = table.shift();
  if (!headers?.includes("tag") || new Set(headers).size !== headers.length)
    throw new Error("CSV 需要唯一表头，至少包含 tag");
  return table.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error(`CSV 第 ${i + 2} 行列数错误`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
  });
}
export function importArtists(text: string, csv = false) {
  const data = csv ? parseCsv(text) : JSON.parse(text);
  return validateArtists(
    Array.isArray(data) ? data : object(data, "导入文件").artists,
  );
}
export function mergeArtists(incoming: Artist[], existing: Artist[]) {
  const byId = new Map(existing.map((a) => [a.id, a])),
    byName = new Map(
      existing.flatMap((a) =>
        [a.tag, ...(a.aliases ?? [])].map((k) => [tagKey(k), a] as const),
      ),
    );
  const added: Artist[] = [],
    members: string[] = [];
  for (const a of incoming) {
    const matches = new Set(
      [
        byId.get(a.id),
        ...[a.tag, ...(a.aliases ?? [])].map((k) => byName.get(tagKey(k))),
      ].filter(Boolean),
    );
    if (matches.size > 1) throw new Error(`${a.tag} 的 ID／别名指向不同画师`);
    const match = [...matches][0];
    if (match) {
      if (
        match.id === a.id &&
        ![match.tag, ...(match.aliases ?? [])]
          .map(tagKey)
          .includes(tagKey(a.tag))
      )
        throw new Error(`ID ${a.id} 已用于其他 tag`);
      members.push(match.id);
    } else {
      added.push(a);
      members.push(a.id);
    }
  }
  return { added, members: [...new Set(members)] };
}
export function artistsCsv(artists: Artist[]) {
  const columns: (keyof Artist)[] = [
    "id",
    "tag",
    "displayName",
    "sourceRank",
    "favorites",
    "sourceUrl",
    "modelEvidence",
    "aliases",
    "postCount",
    "topScore",
    "sampleUrl",
    "sampleModel",
  ];
  const quote = (s: unknown) =>
    '"' + String(s ?? "").replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    columns.join(",") +
    "\r\n" +
    artists
      .map((a) =>
        columns
          .map((c) => quote(c === "aliases" ? JSON.stringify(a[c]) : a[c]))
          .join(","),
      )
      .join("\r\n")
  );
}
function validateSettings(v: unknown): Settings {
  const raw = object(v, "设置");
  const normalized =
    raw.tierCounts === undefined
      ? { ...raw, tierCounts: structuredClone(defaults.tierCounts) }
      : raw;
  const check = (value: unknown, shape: unknown, path: string) => {
    if (typeof shape === "object" && shape) {
      const o = object(value, path);
      for (const [k, val] of Object.entries(shape))
        check(o[k], val, `${path}.${k}`);
    } else if (typeof value !== typeof shape)
      throw new Error(`${path}类型错误`);
  };
  check(normalized, defaults, "设置");
  const s = normalized as unknown as Settings;
  if (
    !["exact", "range", "tiered"].includes(s.countMode) ||
    !["tiered", "free"].includes(s.mode) ||
    !["regular", "paint", "depth", "off", "custom"].includes(s.style) ||
    !["short", "medium", "long"].includes(s.length) ||
    !["auto", "none", "fixed", "range"].includes(s.tiered.total.mode) ||
    !["none", "fixed", "range"].includes(s.free.total.mode)
  )
    throw new Error("设置中存在未知模式");
  // Text numeric drafts may intentionally be invalid; preserve them and let the UI report them.
  return structuredClone(s);
}
function validatePreset(v: unknown): Preset {
  const p = object(v, "预设"),
    parts = strings(p.parts, "预设正文");
  if (typeof p.core !== "boolean") throw new Error("预设核心标记错误");
  const n3 = parts.filter((x) => x === "{{3d}}").length,
    nf = parts.filter((x) => x === "{{face}}").length;
  if (p.core ? n3 !== 1 || nf !== 1 : n3 !== 0 || nf !== 0)
    throw new Error("预设核心模块缺失或重复");
  return {
    id: string(p.id, "预设 ID"),
    name: string(p.name, "预设名称"),
    parts,
    core: p.core,
  };
}
function validateRows(v: unknown): Row[] {
  if (!Array.isArray(v)) throw new Error("结果列表格式错误");
  const rows = v.map((x) => {
    const r = object(x, "结果");
    if (
      !["main", "support", "accent", "free"].includes(String(r.tier)) ||
      !["none", "artist", "weight"].includes(String(r.lock))
    )
      throw new Error("结果层级或锁定状态错误");
    return {
      artist: artist(r.artist),
      tier: r.tier,
      lock: r.lock,
      weight: integer(r.weight, "结果权重"),
      ...(r.manual === true ? { manual: true as const } : {}),
    } as Row;
  });
  if (rows.length) validateArtists(rows.map((r) => r.artist));
  return rows;
}
function validateResult(v: unknown) {
  const r = object(v, "结果");
  return {
    rows: validateRows(r.rows),
    seed: string(r.seed, "种子"),
    generatedConfig: string(r.generatedConfig, "生成配置"),
    dataVersion: string(r.dataVersion, "数据版本"),
  };
}
export function validateBackup(v: unknown, builtin: Artist[]): AppState {
  const x = object(v, "备份");
  if (x.formatVersion !== 1) throw new Error("不支持此备份格式版本");
  let imported =
    Array.isArray(x.importedArtists) && !x.importedArtists.length
      ? []
      : validateArtists(x.importedArtists);
  const archived =
    x.catalogSnapshot === undefined ? [] : validateArtists(x.catalogSnapshot);
  const knownIds = new Set([...builtin, ...imported].map((a) => a.id));
  // Dataset updates may remove a tag. Keep its archived metadata for saved pools and favorites.
  imported = [...imported, ...archived.filter((a) => !knownIds.has(a.id))];
  const catalog = [...builtin, ...imported];
  validateArtists(catalog);
  const allIds = new Set(catalog.map((a) => a.id));
  const ids = (v: unknown, label: string) => {
    const list = strings(v, label);
    if (new Set(list).size !== list.length)
      throw new Error(`${label}含重复 ID`);
    if (list.some((id) => !allIds.has(id)))
      throw new Error(`${label}引用未知画师`);
    return list;
  };
  if (
    !Array.isArray(x.pools) ||
    !Array.isArray(x.customPresets) ||
    !Array.isArray(x.history)
  )
    throw new Error("备份列表格式错误");
  const pools = x.pools.map((v) => {
    const p = object(v, "画师池");
    return {
      id: string(p.id, "池 ID"),
      name: string(p.name, "池名称"),
      members: ids(p.members, "池成员"),
    };
  });
  if (
    new Set(pools.map((p) => p.id)).size !== pools.length ||
    pools.some((p) =>
      ["top100", "top300", "top1000", "favorites"].includes(p.id),
    )
  )
    throw new Error("自建池 ID 重复或使用保留名称");
  const poolIdSet = new Set(pools.map((p) => p.id));
  const validParsers: SourceParserMode[] = [
    "auto",
    "danbooru",
    "moebooru",
    "gelbooru",
    "tags-gallery",
    "html-selector",
    "text-regex",
  ];
  const sources: ArtistSource[] =
    x.sources === undefined
      ? []
      : (() => {
          if (!Array.isArray(x.sources)) throw new Error("拉取源列表格式错误");
          const list = x.sources.map((v) => {
            const src = object(v, "拉取源");
            const url = string(src.url, "拉取源网址").trim();
            if (!safeSourceUrl(url))
              throw new Error("拉取源网址只能使用 http 或 https");
            const parser = string(src.parser ?? "auto", "解析方式") as SourceParserMode;
            if (!validParsers.includes(parser))
              throw new Error("不支持的拉取源解析方式");
            const poolRef = string(src.poolId, "拉取源关联池");
            if (!poolIdSet.has(poolRef))
              throw new Error("拉取源关联的画师池不存在");
            return {
              id: string(src.id, "拉取源 ID"),
              name: string(src.name, "拉取源名称"),
              url,
              parser,
              selector: string(src.selector ?? "", "选择器/正则"),
              pageStart: integer(src.pageStart ?? 1, "起始页", 1),
              pageCount: integer(src.pageCount ?? 1, "拉取页数", 1),
              replaceUnderscores:
                typeof src.replaceUnderscores === "boolean"
                  ? src.replaceUnderscores
                  : true,
              poolId: poolRef,
              lastFetchedAt:
                src.lastFetchedAt == null
                  ? null
                  : string(src.lastFetchedAt, "拉取时间"),
              lastCount: integer(src.lastCount ?? 0, "拉取数量", 0),
              lastError:
                src.lastError == null
                  ? null
                  : string(src.lastError, "拉取错误"),
            };
          });
          if (new Set(list.map((s) => s.id)).size !== list.length)
            throw new Error("拉取源 ID 重复");
          return list;
        })();
  const poolId = string(x.poolId, "当前池");
  if (
    ![
      "top100",
      "top300",
      "top1000",
      "favorites",
      ...pools.map((p) => p.id),
    ].includes(poolId)
  )
    throw new Error("当前池不存在");
  const edits = object(x.presetEdits, "预设编辑");
  const presetEdits = Object.fromEntries(
    Object.entries(edits).map(([k, v]) => [k, validatePreset(v)]),
  );
  const customPresets = x.customPresets.map(validatePreset);
  if (new Set(customPresets.map((p) => p.id)).size !== customPresets.length)
    throw new Error("自建预设 ID 重复");
  const history = x.history.map((v) => {
    const h = object(v, "历史");
    if (
      typeof h.favorite !== "boolean" ||
      !Number.isFinite(Date.parse(String(h.createdAt)))
    )
      throw new Error("历史标记或时间错误");
    return {
      id: string(h.id, "历史 ID"),
      createdAt: string(h.createdAt, "历史时间"),
      favorite: h.favorite,
      result: validateResult(h.result),
      settings: validateSettings(h.settings),
      preset: h.preset === null ? null : validatePreset(h.preset),
      fullPreset: string(h.fullPreset, "历史预设"),
      artistText: string(h.artistText, "历史画师串"),
      combinedText: string(h.combinedText, "历史输出"),
      poolId: string(h.poolId, "历史池"),
      candidateIds: strings(h.candidateIds, "历史候选"),
    } as HistoryEntry;
  });
  if (history.length > 50) throw new Error("历史记录不能超过 50 条");
  if (new Set(history.map((h) => h.id)).size !== history.length)
    throw new Error("历史 ID 重复");
  for (const h of history) {
    const out = outputs(h.result.rows, h.preset, h.settings);
    if (
      out.quality !== h.fullPreset ||
      out.artists !== h.artistText ||
      out.combined !== h.combinedText
    )
      throw new Error("历史文本与实际结果不一致");
  }
  return {
    formatVersion: 1,
    settings: validateSettings(x.settings),
    catalogSnapshot: builtin,
    importedArtists: imported,
    pools,
    sources,
    poolId,
    favorites: ids(x.favorites, "收藏"),
    excluded: ids(x.excluded, "排除名单"),
    presetEdits,
    customPresets,
    result: x.result === null ? null : validateResult(x.result),
    restoredPreset:
      x.restoredPreset === undefined
        ? undefined
        : x.restoredPreset === null
          ? null
          : validatePreset(x.restoredPreset),
    history,
  };
}
export function validateControlParams(s: Settings) {
  cents(s.intensity, "3D 强度");
  cents(s.face, "3D 脸抑制", true);
}
