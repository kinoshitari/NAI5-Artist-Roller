import { describe, expect, it } from "vitest";
import { extractArtistsFromText } from "../src/sources";
import { builtin, initialState } from "../src/state";
import { validateBackup } from "../src/imports";

describe("画师拉取源解析与备份兼容", () => {
  it("解析 Danbooru tags.json 并过滤非画师和废弃标签", () => {
    const raw = JSON.stringify([
      { id: 1, name: "bee_(deadflow)", post_count: 850, category: 1, is_deprecated: false },
      { id: 2, name: "1girl", post_count: 99999, category: 0, is_deprecated: false },
      { id: 3, name: "old_tag", post_count: 10, category: 1, is_deprecated: true },
      { id: 4, name: "kantoku", post_count: 4200, category: 1, is_deprecated: false },
    ]);
    const list = extractArtistsFromText(raw, {
      url: "https://danbooru.donmai.us/tags.json?search[category]=1",
      parser: "auto",
      replaceUnderscores: true,
    });
    expect(list.map((a) => a.tag)).toEqual(["bee (deadflow)", "kantoku"]);
    expect(list[0].postCount).toBe(850);
    expect(list[0].sourceUrl).toContain("https://danbooru.donmai.us/posts?tags=");
  });

  it("解析 Danbooru posts.json 并按出现频次与高分去重汇总画师", () => {
    const raw = JSON.stringify([
      { id: 10, tag_string_artist: "artist_a artist_b", score: 120 },
      { id: 11, tag_string_artist: "artist_b artist_request", score: 250 },
      { id: 12, tag_string_artist: "artist_c", score: 300 },
    ]);
    const list = extractArtistsFromText(raw, {
      url: "https://danbooru.donmai.us/posts.json?tags=order:rank",
      parser: "danbooru",
      replaceUnderscores: true,
    });
    expect(list.map((a) => a.tag)).toEqual(["artist b", "artist c", "artist a"]);
    expect(list[0].postCount).toBe(2);
    expect(list[0].topScore).toBe(250);
  });

  it("解析 Yande.re Moebooru JSON 与 Safebooru XML", () => {
    const yandere = JSON.stringify([
      { id: 1, name: "tinkle", count: 2253, type: 1 },
      { id: 2, name: "touhou", count: 9999, type: 3 },
    ]);
    const yList = extractArtistsFromText(yandere, {
      url: "https://yande.re/tag.json?type=1",
      parser: "auto",
      replaceUnderscores: true,
    });
    expect(yList.map((a) => a.tag)).toEqual(["tinkle"]);
    expect(yList[0].postCount).toBe(2253);

    const safeXml =
      '<?xml version="1.0"?><tags type="array"><tag type="1" count="42" name="shin_inoh"/><tag type="4" count="99" name="reimu"/></tags>';
    const sList = extractArtistsFromText(safeXml, {
      url: "https://safebooru.org/index.php?page=dapi&s=tag&q=index",
      parser: "auto",
      replaceUnderscores: true,
    });
    expect(sList.map((a) => a.tag)).toEqual(["shin inoh"]);
    expect(sList[0].postCount).toBe(42);
  });

  it("解析 TAGs Gallery HTML、自定义正则与纯文本画师清单", () => {
    const html = `
      <div class="grid">
        <a href="/en/artist/momoko%20(momopoco)"><span>FAVS</span><span>1,234</span></a>
        <a href="/en/artist/ixy"><span>FAVS</span><span>980</span></a>
      </div>
    `;
    const tg = extractArtistsFromText(html, {
      url: "https://tags.gallery/en/v5?s=favorites",
      parser: "tags-gallery",
      replaceUnderscores: false,
    });
    expect(tg.map((a) => a.tag)).toEqual(["momoko (momopoco)", "ixy"]);
    expect(tg[0].favorites).toBe(1234);
    expect(tg[0].sourceUrl).toBe("https://tags.gallery/en/artist/momoko%20(momopoco)");

    const regexList = extractArtistsFromText(
      "推荐画师：@art[freng], @art[ebifurya], @art[freng]",
      {
        url: "https://example.com/list",
        parser: "text-regex",
        selector: "@art\\[([^\\]]+)\\]",
        replaceUnderscores: true,
      },
    );
    expect(regexList.map((a) => a.tag)).toEqual(["freng", "ebifurya"]);

    const plain = extractArtistsFromText(
      "0.95::artist:nakamura_yukitoshi ::, 0.45::anmi ::",
      {
        url: "https://example.com/prompt.txt",
        parser: "auto",
        replaceUnderscores: true,
      },
    );
    expect(plain.map((a) => a.tag)).toEqual(["nakamura yukitoshi"]);
  });

  it("备份校验支持 sources 字段并兼容缺少 sources 的旧备份", () => {
    const s = initialState();
    s.pools = [{ id: "pool:src:1", name: "Danbooru", members: [builtin[0].id] }];
    s.sources = [
      {
        id: "src:1",
        name: "Danbooru",
        url: "https://danbooru.donmai.us/tags.json?search[category]=1",
        parser: "danbooru",
        selector: "",
        pageStart: 1,
        pageCount: 1,
        replaceUnderscores: true,
        poolId: "pool:src:1",
        lastFetchedAt: "2026-11-22T11:00:00.000Z",
        lastCount: 1,
        lastError: null,
      },
    ];
    expect(validateBackup(JSON.parse(JSON.stringify(s)), builtin)).toEqual(s);

    const legacy = JSON.parse(JSON.stringify(initialState()));
    delete legacy.sources;
    expect(validateBackup(legacy, builtin).sources).toEqual([]);
  });
});
