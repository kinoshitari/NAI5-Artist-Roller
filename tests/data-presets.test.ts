import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaults, formatWeight, roll, sumWeights } from "../src/engine";
import {
  artistsCsv,
  importArtists,
  mergeArtists,
  validateArtists,
  validateBackup,
} from "../src/imports";
import {
  artistPrompt,
  chosenPreset,
  defaultPresets,
  outputs,
  parsePresetText,
  renderPreset,
} from "../src/presets";
import {
  builtin,
  candidates,
  initialState,
  provenance,
  restoreHistory,
  withResult,
} from "../src/state";
import type { Artist } from "../src/types";

describe("真实快照及导入", () => {
  it("明确实际数量、无重复、FAVS 降序及 V5 来源", () => {
    expect(validateArtists(builtin)).toEqual(builtin);
    expect(provenance.actualCount).toBe(builtin.length);
    if (provenance.complete) expect(builtin.length).toBe(1000);
    else expect(provenance.limitation).toBeTruthy();
    for (let i = 0; i < builtin.length; i++) {
      const a = builtin[i];
      expect(["v5_gallery_sample", "v5_gallery_listing"]).toContain(a.modelEvidence);
      if (a.modelEvidence === "v5_gallery_sample") expect(a.sampleModel).toBe("v5");
      else expect(a.sampleModel).not.toBe("v5");
      expect(a.sourceRank).toBe(i + 1);
      expect(a.sourceUrl).toContain("https://tags.gallery/en/artist/");
      if (i)
        expect(a.favorites!).toBeLessThanOrEqual(builtin[i - 1].favorites!);
    }
  });
  it("CSV 与 JSON 往返，括号、空格和符号保持原样", () => {
    expect(importArtists(artistsCsv(builtin), true)).toEqual(builtin);
    expect(importArtists(JSON.stringify({ artists: builtin }))).toEqual(
      builtin,
    );
    expect(importArtists('tag\r\n"test (circle-name)"\r\n', true)[0].tag).toBe(
      "test (circle-name)",
    );
  });
  it("重复 ID、重复 tag、别名交叉、非法数值拒绝", () => {
    expect(() => validateArtists([builtin[0], builtin[0]])).toThrow("重复 ID");
    expect(() =>
      validateArtists([builtin[0], { ...builtin[0], id: "another" }]),
    ).toThrow("关系重叠");
    expect(() =>
      validateArtists([
        { ...builtin[0], aliases: ["unique"] },
        { ...builtin[1], aliases: ["unique"] },
      ]),
    ).toThrow("关系重叠");
    for (const n of [-1, 0.5, "NaN", Infinity])
      expect(() =>
        validateArtists([{ ...builtin[0], favorites: n }]),
      ).toThrow();
    expect(() =>
      validateArtists([{ ...builtin[0], sourceUrl: "javascript:alert(1)" }]),
    ).toThrow();
  });
  it("真实声明的别名映射到同一身份，不重复加入池", () => {
    const a: Artist = { ...builtin[0], aliases: ["documented alias"] };
    const b: Artist = {
      ...builtin[1],
      id: "alias-import",
      tag: "documented alias",
    };
    const m = mergeArtists(validateArtists([b]), [a]);
    expect(m.added).toEqual([]);
    expect(m.members).toEqual([a.id]);
    expect(() => mergeArtists([{ ...b, id: a.id, tag: "other" }], [a])).toThrow(
      "已用于其他 tag",
    );
  });
  it("有效候选为池成员减全局排除", () => {
    const s = initialState();
    s.poolId = "pool:test";
    s.pools = [
      {
        id: "pool:test",
        name: "测试",
        members: builtin.slice(0, 4).map((a) => a.id),
      },
    ];
    s.excluded = [builtin[0].id];
    expect(candidates(s)).toEqual(builtin.slice(1, 4));
  });
  it("未知模型导入不标记 V5，内容为普通文本", () => {
    const [a] = importArtists('[{"tag":"<b>plain</b>"}]');
    expect(a.modelEvidence).toBeNull();
    expect(a.tag).toBe("<b>plain</b>");
  });
});
describe("九套预设与组合", () => {
  it("九套默认正文与用户目标文件逐字一致", () => {
    const goal = readFileSync(new URL('../docs/goal-objective.md',import.meta.url),'utf8').replaceAll('\\','');
    for(const p of defaultPresets){
      const escaped=p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const match=goal.match(new RegExp('### '+escaped+'\\s*\\n\\s*\\n([^\\n]+)'));
      expect(match).not.toBeNull();expect(renderPreset(p,defaults)).toBe(match![1].trim());
    }
  });
  it("编辑器拒绝会逃逸参数控件的内部占位符", () => {
    expect(()=>parsePresetText('{{3d}}','custom:x','x',false)).toThrow('内部占位符');
  });
  it("恰好 9 套，三个风格逐档扩展", () => {
    expect(defaultPresets).toHaveLength(9);
    for (const style of ["regular", "paint", "depth"]) {
      const [a, b, c] = ["short", "medium", "long"].map((l) =>
        renderPreset(
          defaultPresets.find((p) => p.id === `${style}-${l}`)!,
          defaults,
        ),
      );
      expect(b.startsWith(a + ", ")).toBe(true);
      expect(c.startsWith(b + ", ")).toBe(true);
    }
  });
  it("2.5D 三档各有一次正 3d、负 3d face", () => {
    for (const p of defaultPresets.filter((p) => p.core)) {
      const text = renderPreset(p, {
        ...defaults,
        intensity: "0.61",
        face: "-1.21",
      });
      expect(text.match(/0\.61::3d ::/g)).toHaveLength(1);
      expect(text.match(/-1\.21::3d face ::/g)).toHaveLength(1);
    }
  });
  it("参数编辑同步并保留词序和用户加权分组", () => {
    const text = "1.20::a, b ::, 0.65::3d ::, -1.10::3d face ::, a";
    const parsed = parsePresetText(text, "custom:a", "测试", true);
    expect(
      renderPreset(parsed.preset, {
        ...defaults,
        intensity: parsed.intensity!,
        face: parsed.face!,
      }),
    ).toBe(text);
    expect(() =>
      parsePresetText(text + ", 0.45::3d ::", "x", "x", true),
    ).toThrow("各只能有一组");
    expect(() => parsePresetText("3d, best quality", "x", "x", true)).toThrow();
    expect(() =>
      renderPreset(defaultPresets[6], { ...defaults, face: "0.80" }),
    ).toThrow("须小于 0");
  });
  it("预设、参数、前缀、年份与画师总和独立", () => {
    const s = initialState(),
      rows = structuredClone(s.result!.rows),
      sum = sumWeights(rows);
    for (const p of defaultPresets) {
      const out = outputs(rows, p, {
        ...s.settings,
        intensity: "0.70",
        face: "-1.20",
      });
      expect(out.combined.startsWith(out.artists + ", ")).toBe(true);
    }
    expect(rows).toEqual(s.result!.rows);
    expect(sumWeights(rows)).toBe(sum);
    const out = outputs(rows, defaultPresets[0], {
      ...s.settings,
      prefix: true,
      yearEnabled: true,
      year: "2025",
    });
    expect(out.combined.endsWith(", year 2025")).toBe(true);
    expect(out.artists).not.toMatch(/主|点缀|辅助/);
  });
  it("画师独立闭合、前缀不重复、权重两位小数", () => {
    const rows = [
      {
        artist: { ...builtin[0], tag: "artist:artist:test (circle)" },
        tier: "main" as const,
        weight: 80,
        lock: "none" as const,
      },
    ];
    expect(artistPrompt(rows, true)).toBe("0.80::artist:test (circle) ::");
    expect(artistPrompt(rows, false)).toBe("0.80::test (circle) ::");
    expect(formatWeight(360)).toBe("3.60");
  });
});
describe("历史、刷新与完整备份", () => {
  it("完整状态 JSON 往返保留所有真实结果与配置", () => {
    const s = initialState();
    s.settings.seed = "test";
    s.favorites = [builtin[0].id];
    s.excluded = [builtin[1].id];
    s.pools = [{ id: "pool:a", name: "自建", members: [builtin[0].id] }];
    expect(validateBackup(JSON.parse(JSON.stringify(s)), builtin)).toEqual(s);
  });
  it("旧版备份缺少 tierCounts 时自动补全默认值", () => {
    const s = initialState();
    const legacy = JSON.parse(JSON.stringify(s));
    delete legacy.settings.tierCounts;
    const restored = validateBackup(legacy, builtin);
    expect(restored.settings.tierCounts).toEqual(defaults.tierCounts);
  });
  it("改过预设、当前数据后历史仍恢复原文，不重抽", () => {
    let s = initialState();
    const h = structuredClone(s.history[0]);
    s.settings.intensity = "0.79";
    s.settings.prefix = true;
    s.presetEdits["depth-medium"] = {
      ...defaultPresets[7],
      parts: ["completely changed"],
      core: false,
    };
    s.result = withResult(
      s,
      roll(s.settings, builtin, [], "new"),
      "new",
    ).result;
    s = restoreHistory(s, h);
    const out = outputs(s.result!.rows, chosenPreset(s), s.settings);
    expect(out.combined).toBe(h.combinedText);
    expect(out.quality).toBe(h.fullPreset);
    expect(s.result).toEqual(h.result);
  });
  it("仅保留最近 50 条历史", () => {
    let s = initialState();
    for (let i = 0; i < 55; i++) s = withResult(s, s.result!.rows, `h-${i}`);
    expect(s.history).toHaveLength(50);
    expect(s.history[0].result.seed).toBe("h-54");
  });
  it("数据更新后完整备份保留已移出的画师与原历史", () => {
    const s = initialState();
    s.favorites = [builtin[0].id];
    const restored = validateBackup(
      JSON.parse(JSON.stringify(s)),
      builtin.slice(1),
    );
    expect(restored.importedArtists).toContainEqual(builtin[0]);
    expect(restored.favorites).toEqual(s.favorites);
    expect(restored.history).toEqual(s.history);
  });
  it("拒绝错误版本、无效权重、重复池与未知引用", () => {
    const s = initialState();
    expect(() => validateBackup({ ...s, formatVersion: 9 }, builtin)).toThrow(
      "格式版本",
    );
    s.result!.rows[0].weight = 1.2;
    expect(() => validateBackup(s, builtin)).toThrow("整数");
    const t = initialState();
    t.favorites = ["unknown"];
    expect(() => validateBackup(t, builtin)).toThrow("未知画师");
    t.favorites = [];
    t.pools = [{ id: "top100", name: "bad", members: [] }];
    expect(() => validateBackup(t, builtin)).toThrow("保留名称");
  });
});
