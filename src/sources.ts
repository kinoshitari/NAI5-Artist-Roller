import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { parseCsv, safeSourceUrl, tagKey, validateArtists } from "./imports";
import type { Artist, ArtistSource, SourceParserMode } from "./types";

export interface SourceTemplate {
  id: string;
  label: string;
  name: string;
  url: string;
  parser: SourceParserMode;
  selector: string;
  pageStart: number;
  pageCount: number;
  replaceUnderscores: boolean;
  hint: string;
}

export const SOURCE_TEMPLATES: SourceTemplate[] = [
  {
    id: "danbooru-tags",
    label: "Danbooru 画师榜",
    name: "Danbooru 热门画师",
    url: "https://danbooru.donmai.us/tags.json?search[category]=1&search[order]=count&limit=200&page={page}",
    parser: "danbooru",
    selector: "",
    pageStart: 1,
    pageCount: 1,
    replaceUnderscores: true,
    hint: "官方 JSON 接口，按投稿数排序拉取画师 tag（每页最多 200 位）。",
  },
  {
    id: "danbooru-posts",
    label: "Danbooru 热门作品",
    name: "Danbooru 热门作品画师",
    url: "https://danbooru.donmai.us/posts.json?tags=order:rank&limit=100&page={page}",
    parser: "danbooru",
    selector: "",
    pageStart: 1,
    pageCount: 1,
    replaceUnderscores: true,
    hint: "从近期高分/热门投稿中自动提取去重后的画师 tag，可把 tags= 改成任意检索词。",
  },
  {
    id: "yandere-tags",
    label: "Yande.re 画师榜",
    name: "Yande.re 热门画师",
    url: "https://yande.re/tag.json?type=1&order=count&limit=200&page={page}",
    parser: "moebooru",
    selector: "",
    pageStart: 1,
    pageCount: 1,
    replaceUnderscores: true,
    hint: "Moebooru 画师标签榜，偏向精致插画与画集画师。",
  },
  {
    id: "safebooru-tags",
    label: "Safebooru 画师",
    name: "Safebooru 画师榜",
    url: "https://safebooru.org/index.php?page=dapi&s=tag&q=index&orderby=count&limit=200",
    parser: "gelbooru",
    selector: "",
    pageStart: 1,
    pageCount: 1,
    replaceUnderscores: true,
    hint: "Safebooru DAPI XML/JSON 接口，自动筛选 type=1 画师标签。",
  },
  {
    id: "tags-gallery",
    label: "TAGs Gallery",
    name: "TAGs Gallery 榜单",
    url: "https://tags.gallery/en/v5?s=favorites&p={page}",
    parser: "tags-gallery",
    selector: "",
    pageStart: 1,
    pageCount: 1,
    replaceUnderscores: false,
    hint: "读取 TAGs 榜单页面；若触发 Cloudflare 验证，可用下方“粘贴网页源码提取”。",
  },
  {
    id: "custom",
    label: "自定义网页 / 清单",
    name: "",
    url: "",
    parser: "auto",
    selector: "",
    pageStart: 1,
    pageCount: 1,
    replaceUnderscores: true,
    hint: "支持任意 JSON / CSV / 纯文本清单，或配合 CSS 选择器 / 正则从网页抓取画师 tag。",
  },
];

export const PARSER_OPTIONS: [SourceParserMode, string][] = [
  ["auto", "自动识别（API / 网页 / JSON / CSV / 文本）"],
  ["danbooru", "Danbooru API（tags.json / posts.json）"],
  ["moebooru", "Yande.re / Moebooru API（tag.json）"],
  ["gelbooru", "Gelbooru / Safebooru API（XML / JSON）"],
  ["tags-gallery", "TAGs Gallery 页面"],
  ["html-selector", "网页 CSS 选择器提取"],
  ["text-regex", "正文正则表达式提取"],
];

export interface ExtractOptions {
  url: string;
  parser: SourceParserMode;
  selector?: string;
  replaceUnderscores?: boolean;
  contentType?: string;
}

interface RawCandidate {
  tag: string;
  favorites?: number | null;
  postCount?: number | null;
  topScore?: number | null;
  sourceUrl?: string | null;
  sourceRank?: number | null;
}

export interface FetchedDocument {
  body: string;
  finalUrl: string;
  contentType: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function cleanTag(raw: string, replaceUnderscores: boolean): string | null {
  let t = decodeHtmlEntities(raw).replace(/\u00a0/g, " ").trim();
  if (!t) return null;
  t = t.replace(/^-?\d+(?:\.\d+)?::\s*/, "").replace(/\s*::$/, "");
  t = t.replace(/^(?:artist:\s*)+/i, "").trim();
  t = t.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (replaceUnderscores) t = t.replace(/_/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (!t || t.length > 120) return null;
  if (/[\r\n\x00-\x1f]/.test(t) || t.includes("::") || t.includes(",")) return null;
  if (/^https?:\/\//i.test(t)) return null;
  if (/^(unknown|none|null|undefined|n\/a|anonymous|tagme|artist request)$/i.test(t)) {
    return null;
  }
  return t;
}

function toSafeInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  if (typeof v === "string") {
    const clean = v.replace(/,/g, "").trim();
    if (/^\d+$/.test(clean)) return Number(clean);
  }
  return null;
}

function hostSlug(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "custom";
  }
}

function resolveUrl(href: string | null | undefined, baseUrl: string): string | null {
  if (!href) return null;
  try {
    const abs = new URL(href, baseUrl).toString();
    return safeSourceUrl(abs) ?? null;
  } catch {
    return null;
  }
}

function buildBooruArtistUrl(baseUrl: string, rawTag: string): string | null {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname.toLowerCase();
    const encoded = encodeURIComponent(rawTag.replace(/\s+/g, "_"));
    if (host.includes("danbooru")) return `${u.origin}/posts?tags=${encoded}`;
    if (host.includes("yande.re") || host.includes("konachan"))
      return `${u.origin}/post?tags=${encoded}`;
    if (host.includes("safebooru") || host.includes("gelbooru"))
      return `${u.origin}/index.php?page=post&s=list&tags=${encoded}`;
    return safeSourceUrl(baseUrl) ?? null;
  } catch {
    return null;
  }
}

function parseDanbooruJson(data: unknown, baseUrl: string): RawCandidate[] {
  const items = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).tags)
      ? ((data as Record<string, unknown>).tags as unknown[])
      : null;
  if (!items || !items.length) return [];

  if (
    items.some(
      (x) => x && typeof x === "object" && typeof (x as Record<string, unknown>).tag_string_artist === "string",
    )
  ) {
    const stats = new Map<string, { count: number; topScore: number | null }>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const artistStr = typeof rec.tag_string_artist === "string" ? rec.tag_string_artist : "";
      const score = toSafeInt(rec.score);
      for (const raw of artistStr.split(/\s+/)) {
        const name = raw.trim();
        if (!name || name === "artist_request" || name === "banned_artist") continue;
        const prev = stats.get(name) ?? { count: 0, topScore: null };
        prev.count += 1;
        if (score !== null && (prev.topScore === null || score > prev.topScore)) {
          prev.topScore = score;
        }
        stats.set(name, prev);
      }
    }
    return [...stats.entries()]
      .sort((a, b) => b[1].count - a[1].count || (b[1].topScore ?? 0) - (a[1].topScore ?? 0))
      .map(([name, info]) => ({
        tag: name,
        postCount: info.count,
        topScore: info.topScore,
        sourceUrl: buildBooruArtistUrl(baseUrl, name),
      }));
  }

  const hasCategory = items.some(
    (x) => x && typeof x === "object" && "category" in (x as Record<string, unknown>),
  );
  const hasDanbooruCount = items.some(
    (x) => x && typeof x === "object" && "post_count" in (x as Record<string, unknown>),
  );
  const hasTypeField = items.some(
    (x) => x && typeof x === "object" && "type" in (x as Record<string, unknown>),
  );
  if (!hasCategory && !hasDanbooruCount && hasTypeField) return [];
  const out: RawCandidate[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.is_deprecated === true) continue;
    if (hasCategory && Number(rec.category) !== 1) continue;
    const name = typeof rec.name === "string" ? rec.name : typeof rec.tag === "string" ? rec.tag : "";
    if (!name) continue;
    out.push({
      tag: name,
      postCount: toSafeInt(rec.post_count ?? rec.count),
      sourceUrl: buildBooruArtistUrl(baseUrl, name),
    });
  }
  return out;
}

function parseMoebooruJson(data: unknown, baseUrl: string): RawCandidate[] {
  if (!Array.isArray(data) || !data.length) return [];
  const hasType = data.some(
    (x) => x && typeof x === "object" && "type" in (x as Record<string, unknown>),
  );
  const out: RawCandidate[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (hasType && Number(rec.type) !== 1) continue;
    const name = typeof rec.name === "string" ? rec.name : "";
    if (!name) continue;
    out.push({
      tag: name,
      postCount: toSafeInt(rec.count),
      sourceUrl: buildBooruArtistUrl(baseUrl, name),
    });
  }
  return out;
}

function parseGelbooru(text: string, baseUrl: string): RawCandidate[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).tag)
          ? ((parsed as Record<string, unknown>).tag as unknown[])
          : [];
      const hasType = arr.some(
        (x) => x && typeof x === "object" && "type" in (x as Record<string, unknown>),
      );
      const out: RawCandidate[] = [];
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        if (hasType && Number(rec.type) !== 1) continue;
        const name = typeof rec.name === "string" ? rec.name : "";
        if (!name) continue;
        out.push({
          tag: name,
          postCount: toSafeInt(rec.count),
          sourceUrl: buildBooruArtistUrl(baseUrl, name),
        });
      }
      if (out.length) return out;
    } catch {
      // fall through to XML
    }
  }
  const out: RawCandidate[] = [];
  const tagRe = /<tag\b([^>]*)\/?\s*>/gi;
  let m: RegExpExecArray | null;
  const allTags: { type: string | null; name: string; count: number | null }[] = [];
  while ((m = tagRe.exec(text)) !== null) {
    const attrs = m[1];
    const nameMatch = /\bname="([^"]+)"/i.exec(attrs);
    if (!nameMatch) continue;
    const typeMatch = /\btype="([^"]+)"/i.exec(attrs);
    const countMatch = /\bcount="([^"]+)"/i.exec(attrs);
    allTags.push({
      type: typeMatch ? typeMatch[1] : null,
      name: decodeHtmlEntities(nameMatch[1]),
      count: countMatch ? toSafeInt(countMatch[1]) : null,
    });
  }
  const hasArtistType = allTags.some((t) => t.type === "1");
  for (const t of allTags) {
    if (hasArtistType && t.type !== "1") continue;
    out.push({
      tag: t.name,
      postCount: t.count,
      sourceUrl: buildBooruArtistUrl(baseUrl, t.name),
    });
  }
  return out;
}

function parseGenericJson(data: unknown, baseUrl: string): RawCandidate[] {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (["artists", "tags", "items", "data", "results", "list"]
          .map((k) => (data as Record<string, unknown>)[k])
          .find((v) => Array.isArray(v)) as unknown[] | undefined)
      : undefined;
  if (!arr) return [];
  const out: RawCandidate[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      out.push({ tag: item, sourceUrl: safeSourceUrl(baseUrl) ?? null });
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const raw =
        typeof rec.tag === "string"
          ? rec.tag
          : typeof rec.artist === "string"
            ? rec.artist
            : typeof rec.name === "string"
              ? rec.name
              : "";
      if (!raw) continue;
      out.push({
        tag: raw,
        favorites: toSafeInt(rec.favorites ?? rec.favs),
        postCount: toSafeInt(rec.postCount ?? rec.post_count ?? rec.count),
        topScore: toSafeInt(rec.topScore ?? rec.top_score ?? rec.score),
        sourceUrl:
          (typeof rec.sourceUrl === "string" && safeSourceUrl(rec.sourceUrl)) ||
          (typeof rec.url === "string" && safeSourceUrl(rec.url)) ||
          safeSourceUrl(baseUrl) ||
          null,
      });
    }
  }
  return out;
}

function parseTagsGalleryHtml(html: string, baseUrl: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  const anchorRe = /<a\b[^>]*href="([^"]*\/artist\/([^"?#]+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const slug = m[2];
    const inner = m[3];
    let tag = "";
    try {
      tag = decodeURIComponent(slug);
    } catch {
      tag = slug;
    }
    const favMatch = /FAVS\s*<\/[^>]+>\s*<[^>]+>\s*([\d,]+)/i.exec(inner) ?? /([\d,]+)\s*FAVS/i.exec(inner);
    out.push({
      tag,
      favorites: favMatch ? toSafeInt(favMatch[1]) : null,
      sourceUrl: resolveUrl(href, baseUrl),
    });
  }
  return out;
}

function parseHtmlWithSelector(html: string, selector: string, baseUrl: string): RawCandidate[] {
  const sel = selector.trim();
  if (!sel) throw new Error("请输入 CSS 选择器，例如 a[href*=\"/artist/\"] 或 .artist-name");
  if (typeof DOMParser === "undefined") {
    throw new Error("当前运行环境不支持 DOMParser，请改用正则提取或浏览器环境");
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  let nodes: NodeListOf<Element>;
  try {
    nodes = doc.querySelectorAll(sel);
  } catch {
    throw new Error(`CSS 选择器语法无效：${sel}`);
  }
  const out: RawCandidate[] = [];
  nodes.forEach((el) => {
    const raw =
      el.getAttribute("data-tag") ||
      el.getAttribute("data-tag-name") ||
      el.getAttribute("data-name") ||
      el.textContent ||
      "";
    const href = el.getAttribute("href") ?? el.closest("a")?.getAttribute("href");
    out.push({
      tag: raw,
      sourceUrl: resolveUrl(href, baseUrl) ?? safeSourceUrl(baseUrl) ?? null,
    });
  });
  return out;
}

function parseBooruHtml(html: string, baseUrl: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectors = [
      "li.tag-type-1 a.search-tag",
      "li.tag-type-artist a.search-tag",
      ".tag-type-1 a[href*='tags=']",
      ".artist-tag-list a.search-tag",
      ".tag-type-artist a",
      "a[data-tag-category='1']",
    ];
    for (const sel of selectors) {
      const found = doc.querySelectorAll(sel);
      if (found.length) {
        found.forEach((el) => {
          const text = (el.textContent ?? "").trim();
          if (!text || text === "?" || text === "+" || text === "-") return;
          out.push({
            tag: text,
            sourceUrl: resolveUrl(el.getAttribute("href"), baseUrl),
          });
        });
        if (out.length) return out;
      }
    }
  }
  const re = /class="[^"]*(?:tag-type-1|tag-type-artist|artist-tag)[^"]*"[\s\S]{0,240}?<a\b[^>]*href="([^"]*)"[^>]*>([^<]{1,100})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = decodeHtmlEntities(m[2]).trim();
    if (!text || text === "?" || text === "+" || text === "-") continue;
    out.push({ tag: text, sourceUrl: resolveUrl(m[1], baseUrl) });
  }
  return out;
}

function parseRegex(text: string, pattern: string, baseUrl: string): RawCandidate[] {
  const pat = pattern.trim();
  if (!pat) throw new Error("请输入正则表达式，例如 artist:([a-z0-9_() -]+)");
  let re: RegExp;
  try {
    re = new RegExp(pat, "gi");
  } catch (e) {
    throw new Error(`正则表达式无效：${(e as Error).message}`);
  }
  const out: RawCandidate[] = [];
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(text)) !== null && guard < 10000) {
    guard++;
    const val = (m[1] ?? m[0] ?? "").trim();
    if (val) out.push({ tag: val, sourceUrl: safeSourceUrl(baseUrl) ?? null });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

function parsePlainText(text: string, baseUrl: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  const safeUrl = safeSourceUrl(baseUrl) ?? null;
  const explicitRe = /\bartist:\s*([^,\r\n:;<>[\]{}|]{1,100})/gi;
  let m: RegExpExecArray | null;
  while ((m = explicitRe.exec(text)) !== null) {
    out.push({ tag: m[1], sourceUrl: safeUrl });
  }
  if (out.length) return out;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    if (trimmed.includes(",") && !trimmed.includes("<")) {
      for (const part of trimmed.split(",")) {
        out.push({ tag: part, sourceUrl: safeUrl });
      }
    } else {
      out.push({ tag: trimmed, sourceUrl: safeUrl });
    }
  }
  return out;
}

export function extractArtistsFromText(
  text: string,
  options: ExtractOptions,
): Artist[] {
  const raw = text.trim();
  if (!raw) throw new Error("目标内容为空，未提取到画师 tag");
  const replaceUnderscores = options.replaceUnderscores ?? true;
  const baseUrl = options.url || "";
  let candidates: RawCandidate[] = [];

  if (options.parser === "html-selector") {
    candidates = parseHtmlWithSelector(raw, options.selector ?? "", baseUrl);
  } else if (options.parser === "text-regex") {
    candidates = parseRegex(raw, options.selector ?? "", baseUrl);
  } else if (options.parser === "tags-gallery") {
    candidates = parseTagsGalleryHtml(raw, baseUrl);
  } else if (options.parser === "gelbooru") {
    candidates = parseGelbooru(raw, baseUrl);
  } else if (options.parser === "danbooru") {
    try {
      candidates = parseDanbooruJson(JSON.parse(raw), baseUrl);
    } catch {
      candidates = parseBooruHtml(raw, baseUrl);
    }
  } else if (options.parser === "moebooru") {
    try {
      candidates = parseMoebooruJson(JSON.parse(raw), baseUrl);
    } catch {
      candidates = parseBooruHtml(raw, baseUrl);
    }
  } else {
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        candidates = parseDanbooruJson(parsed, baseUrl);
        if (!candidates.length) candidates = parseMoebooruJson(parsed, baseUrl);
        if (!candidates.length) candidates = parseGelbooru(raw, baseUrl);
        if (!candidates.length) candidates = parseGenericJson(parsed, baseUrl);
      } catch {
        // not valid JSON
      }
    }
    if (!candidates.length && /<tags\b[^>]*>[\s\S]*<tag\b/i.test(raw)) {
      candidates = parseGelbooru(raw, baseUrl);
    }
    if (!candidates.length && !/<html\b|<!doctype\s+html/i.test(raw)) {
      const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
      if (firstLine.includes(",") && /\btag\b/i.test(firstLine)) {
        try {
          const csvRows = parseCsv(raw);
          candidates = csvRows.map((r) => ({
            tag: r.tag ?? "",
            favorites: toSafeInt(r.favorites),
            postCount: toSafeInt(r.postCount),
            topScore: toSafeInt(r.topScore),
            sourceUrl: safeSourceUrl(r.sourceUrl ?? null) ?? safeSourceUrl(baseUrl) ?? null,
          }));
        } catch {
          // not standard CSV
        }
      }
    }
    if (!candidates.length && /<[a-z][\s\S]*>/i.test(raw)) {
      candidates = parseTagsGalleryHtml(raw, baseUrl);
      if (!candidates.length) candidates = parseBooruHtml(raw, baseUrl);
      if (!candidates.length && options.selector?.trim()) {
        candidates = parseHtmlWithSelector(raw, options.selector, baseUrl);
      }
      if (!candidates.length) {
        const plain = raw
          .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
          .replace(/<[^>]+>/g, "\n");
        const explicit = /\bartist:\s*([^,\r\n:;<>[\]{}|]{1,100})/gi;
        let m: RegExpExecArray | null;
        while ((m = explicit.exec(plain)) !== null) {
          candidates.push({ tag: m[1], sourceUrl: safeSourceUrl(baseUrl) ?? null });
        }
      }
    }
    if (!candidates.length && !/<html\b|<!doctype\s+html/i.test(raw)) {
      candidates = parsePlainText(raw, baseUrl);
    }
  }

  const slug = hostSlug(baseUrl);
  const seen = new Set<string>();
  const artists: Artist[] = [];
  for (const item of candidates) {
    const tag = cleanTag(item.tag, replaceUnderscores);
    if (!tag) continue;
    const key = tagKey(tag);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    artists.push({
      id: `src:${slug}:${key}`,
      tag,
      displayName: tag,
      sourceRank: item.sourceRank ?? artists.length + 1,
      favorites: item.favorites ?? null,
      sourceUrl: item.sourceUrl ?? safeSourceUrl(baseUrl) ?? null,
      modelEvidence: `remote:${slug}`,
      aliases: null,
      postCount: item.postCount ?? null,
      topScore: item.topScore ?? null,
    });
  }
  if (!artists.length) {
    throw new Error(
      "未从内容中识别到画师 tag。可尝试切换解析方式、填写 CSS 选择器或正则表达式。",
    );
  }
  return validateArtists(artists);
}

function looksLikeChallenge(status: number, body: string, cfMitigated = ""): boolean {
  if (cfMitigated.toLowerCase().includes("challenge")) return true;
  if (status !== 403 && status !== 503 && status !== 429) return false;
  const sample = body.slice(0, 4000).toLowerCase();
  return (
    sample.includes("just a moment") ||
    sample.includes("cf-browser-verification") ||
    sample.includes("challenge-platform") ||
    sample.includes("cloudflare") ||
    sample.includes("verify you are human")
  );
}

export async function fetchUrlText(url: string): Promise<FetchedDocument> {
  const cleanUrl = url.trim();
  if (!safeSourceUrl(cleanUrl)) {
    throw new Error("请输入以 http:// 或 https:// 开头的有效网址");
  }

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: cleanUrl,
      headers: {
        "User-Agent": "NAI5-Artist-Roller/1.1 (+https://github.com/kinoshitari/NAI5-Artist-Roller)",
        Accept: "application/json, application/xml, text/xml, text/html, text/plain, */*;q=0.8",
      },
      responseType: "text",
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
    const headers = res.headers ?? {};
    const ct = headers["content-type"] ?? headers["Content-Type"] ?? "";
    const cf = headers["cf-mitigated"] ?? headers["Cf-Mitigated"] ?? "";
    if (looksLikeChallenge(res.status, body, cf)) {
      throw new Error(
        `目标站点触发人机验证（HTTP ${res.status}），不支持自动绕过；请在浏览器打开后复制页面内容到下方“手动粘贴提取”。`,
      );
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`目标站点返回 HTTP ${res.status}`);
    }
    return { body, finalUrl: res.url || cleanUrl, contentType: ct };
  }

  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" || window.location.protocol === "https:")
  ) {
    try {
      const proxyRes = await fetch(
        `/__nai5_fetch?url=${encodeURIComponent(cleanUrl)}`,
      );
      const ct = proxyRes.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const payload = (await proxyRes.json()) as {
          ok?: boolean;
          status?: number;
          finalUrl?: string;
          contentType?: string;
          cfMitigated?: string;
          body?: string;
          error?: string;
        };
        if (!proxyRes.ok) {
          throw new Error(payload.error || `本地代理拉取失败（HTTP ${proxyRes.status}）`);
        }
        const body = payload.body ?? "";
        const status = payload.status ?? 500;
        if (looksLikeChallenge(status, body, payload.cfMitigated)) {
          throw new Error(
            `目标站点触发人机验证（HTTP ${status}），不支持自动绕过；请在浏览器打开后复制源码到下方“手动粘贴提取”。`,
          );
        }
        if (!payload.ok) {
          throw new Error(`目标站点返回 HTTP ${status}`);
        }
        return {
          body,
          finalUrl: payload.finalUrl || cleanUrl,
          contentType: payload.contentType || "",
        };
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes("Failed to fetch")) {
        throw err;
      }
    }
  }

  try {
    const res = await fetch(cleanUrl, {
      headers: { Accept: "application/json, text/plain, text/html, */*" },
    });
    const body = await res.text();
    if (looksLikeChallenge(res.status, body)) {
      throw new Error(
        `目标站点触发人机验证（HTTP ${res.status}），不支持自动绕过；请在浏览器打开后复制内容到下方“手动粘贴提取”。`,
      );
    }
    if (!res.ok) throw new Error(`目标站点返回 HTTP ${res.status}`);
    return {
      body,
      finalUrl: res.url || cleanUrl,
      contentType: res.headers.get("content-type") ?? "",
    };
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        "浏览器跨域（CORS）限制阻止了直接访问该网站。请通过桌面端/安卓 App 拉取，或复制网页源码到下方“手动粘贴提取”。",
      );
    }
    throw err;
  }
}

export async function fetchSourceArtists(
  source: Pick<
    ArtistSource,
    "url" | "parser" | "selector" | "pageStart" | "pageCount" | "replaceUnderscores"
  >,
  onProgress?: (msg: string) => void,
): Promise<Artist[]> {
  const hasPagePlaceholder = source.url.includes("{page}");
  const start = Math.max(1, Math.min(999, Math.round(source.pageStart || 1)));
  const count = hasPagePlaceholder
    ? Math.max(1, Math.min(10, Math.round(source.pageCount || 1)))
    : 1;

  const combined: Artist[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count; i++) {
    const page = start + i;
    const pageUrl = hasPagePlaceholder
      ? source.url.replace(/\{page\}/g, String(page))
      : source.url;
    onProgress?.(
      count > 1 ? `正在拉取第 ${i + 1} / ${count} 页…` : "正在拉取目标站点…",
    );
    const doc = await fetchUrlText(pageUrl);
    const pageArtists = extractArtistsFromText(doc.body, {
      url: doc.finalUrl,
      parser: source.parser,
      selector: source.selector,
      replaceUnderscores: source.replaceUnderscores,
      contentType: doc.contentType,
    });
    for (const a of pageArtists) {
      const k = tagKey(a.tag);
      if (seen.has(k)) continue;
      seen.add(k);
      combined.push({ ...a, sourceRank: combined.length + 1 });
    }
    if (i + 1 < count) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  if (!combined.length) {
    throw new Error("未提取到有效画师 tag");
  }
  return validateArtists(combined);
}
