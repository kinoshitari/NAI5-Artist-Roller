import { describe, expect, it } from "vitest";
import {
  assertWeights,
  autoTotal,
  cents,
  currentPlan,
  defaults,
  editWeight,
  feasibility,
  formatWeight,
  plan,
  replaceRows,
  rerollWeights,
  roleCounts,
  roll,
  setMain,
  sumWeights,
  tierRange,
} from "../src/engine";
import { builtin } from "../src/state";
import type { Settings } from "../src/types";

const settings = (n = 5): Settings => ({
  ...structuredClone(defaults),
  countMode: "exact",
  exact: String(n),
});
const pool = builtin;
describe("数量、分层与整数总和", () => {
  it("自动总和表严格匹配", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(autoTotal)).toEqual([
      95, 145, 165, 185, 235, 255, 365,
    ]);
    expect(roleCounts(5)).toEqual({ main: 1, support: 2, accent: 2, free: 0 });
  });
  it("默认 5 人分层、总和及最多一项大于 1.0", () => {
    const s = settings(),
      rows = roll(s, pool, [], "default-five");
    expect(rows.length).toBe(5);
    expect(sumWeights(rows)).toBe(235);
    expect(rows.map((r) => r.tier)).toEqual([
      "main",
      "support",
      "support",
      "accent",
      "accent",
    ]);
    expect(rows.filter((r) => r.weight > 100).length).toBeLessThanOrEqual(1);
    assertWeights(s, rows);
  });
  it("主次 5 人固定 3.60 报告 1.75–3.00", () => {
    const s = settings();
    s.tiered.total = { ...s.tiered.total, mode: "fixed", fixed: "3.60" };
    expect(feasibility(s, pool, []).error).toContain("1.75–3.00");
    expect(() => roll(s, pool, [], "x")).toThrow();
  });
  it("自由 5 人 0.40–1.20 固定 3.60 可精确复制", () => {
    const s = settings();
    s.mode = "free";
    s.free.total = { ...s.free.total, mode: "fixed", fixed: "3.60" };
    const rows = roll(s, pool, [], "free");
    expect(sumWeights(rows)).toBe(360);
    expect(rows.every((r) => r.tier === "free")).toBe(true);
    expect(rows.reduce((n, r) => n + cents(formatWeight(r.weight)), 0)).toBe(
      360,
    );
  });
  it("3–6 人固定 3.20 时仅 6 人可行", () => {
    const s = structuredClone(defaults);
    s.tiered.total = { ...s.tiered.total, mode: "fixed", fixed: "3.20" };
    const f = feasibility(s, pool, []);
    expect(f.plans.map((p) => p.n)).toEqual([6]);
    expect(f.partial).toBe(true);
    expect(roll(s, pool, [], "six").length).toBe(6);
  });
  it("池不足与范围截取", () => {
    expect(feasibility(settings(4), pool.slice(0, 3), []).error).toContain(
      "当前可用 3",
    );
    expect(
      feasibility(structuredClone(defaults), pool.slice(0, 4), []).plans.map(
        (p) => p.n,
      ),
    ).toEqual([3, 4]);
  });
  it("非法输入保留为错误，不用默认值掩盖", () => {
    for (const x of ["", "NaN", "Infinity", "1.234", "-0.20"])
      expect(() => cents(x)).toThrow();
    const s = settings();
    s.exact = "2.5";
    expect(feasibility(s, pool, []).error).toContain("正整数");
    s.exact = "5";
    s.tiered.ranges.main.min = "2";
    expect(feasibility(s, pool, []).plans).toHaveLength(0);
  });
  it("全局交集只检查实际使用层级", () => {
    const s = settings(1);
    s.tiered.globalEnabled = true;
    s.tiered.global = { min: "0.90", max: "1.00" };
    expect(roll(s, pool, [], "one")[0].weight).toBe(95);
    s.exact = "2";
    expect(feasibility(s, pool, []).error).toContain("辅层与全局范围无交集");
  });
  it("自动不可行不夹紧到边界", () => {
    const s = settings();
    s.tiered.ranges.main = { min: "1.50", max: "2.00" };
    expect(feasibility(s, pool, []).error).toContain("自动目标 2.35");
  });
  it("范围总和与可行区间求交集", () => {
    const s = settings();
    s.tiered.total = { mode: "range", fixed: "2.35", min: "2.95", max: "9.00" };
    for (let i = 0; i < 100; i++) {
      const rows = roll(s, pool, [], String(i));
      expect(sumWeights(rows)).toBeGreaterThanOrEqual(295);
      expect(sumWeights(rows)).toBeLessThanOrEqual(300);
    }
  });
  it("同一完整输入可复现", () => {
    const s = settings(),
      previous = roll(s, pool, [], "previous");
    previous[1].lock = "artist";
    previous[4].lock = "weight";
    expect(roll(s, pool, previous, "same")).toEqual(
      roll(s, pool, structuredClone(previous), "same"),
    );
  });
  it("1000 个种子 × 两种模式始终满足所有约束", () => {
    for (let i = 0; i < 1000; i++)
      for (const mode of ["tiered", "free"] as const) {
        const s = structuredClone(defaults);
        s.mode = mode;
        const rows = roll(s, pool, [], `property-${mode}-${i}`);
        expect(rows.length).toBeGreaterThanOrEqual(3);
        expect(rows.length).toBeLessThanOrEqual(6);
        expect(new Set(rows.map((r) => r.artist.id)).size).toBe(rows.length);
        for (const r of rows) {
          const [lo, hi] = tierRange(s, r.tier);
          expect(r.weight).toBeGreaterThanOrEqual(lo);
          expect(r.weight).toBeLessThanOrEqual(hi);
          expect(Number.isInteger(r.weight)).toBe(true);
        }
        assertWeights(s, rows);
        if (mode === "tiered")
          expect(sumWeights(rows)).toBe(autoTotal(rows.length));
      }
  });
});
describe("锁定与局部调整", () => {
  it("锁人保留身份层级；锁重还保留权重", () => {
    const s = settings(),
      rows = roll(s, pool, [], "before");
    rows[0].lock = "artist";
    rows[1].lock = "weight";
    const out = roll(s, pool, rows, "after");
    expect(out.find((r) => r.artist.id === rows[0].artist.id)?.tier).toBe(
      "main",
    );
    expect(out.find((r) => r.artist.id === rows[1].artist.id)).toEqual(rows[1]);
    expect(sumWeights(out)).toBe(235);
  });
  it("锁定不在当前池、排除、模式变更均报错", () => {
    const s = settings(),
      rows = roll(s, pool, [], "before");
    rows[0].lock = "artist";
    expect(
      feasibility(
        s,
        pool.filter((a) => a.id !== rows[0].artist.id),
        rows,
      ).error,
    ).toContain("不在当前有效池");
    s.mode = "free";
    expect(feasibility(s, pool, rows).plans.length).toBe(0);
  });
  it("缩减人数不能吞掉已锁定的层级", () => {
    const s = settings(6),
      rows = roll(s, pool, [], "six");
    rows.filter((r) => r.tier === "accent").forEach((r) => (r.lock = "artist"));
    s.exact = "3";
    expect(feasibility(s, pool, rows).error).toContain("锁定点缀层超出");
  });
  it("锁定权重先从可行区间扣除", () => {
    const s = settings(),
      rows = roll(s, pool, [], "locked");
    rows[0] = { ...rows[0], lock: "weight", weight: 110 };
    const p = plan(s, 5, [rows[0]]);
    expect([p.min, p.max]).toEqual([200, 300]);
    s.tiered.ranges.main.max = "1.00";
    expect(feasibility(s, pool, rows).error).toContain("锁定权重不在");
  });
  it("只重掷权重保留全部身份与层级", () => {
    const s = settings(),
      rows = roll(s, pool, [], "a");
    rows[2].lock = "weight";
    const out = rerollWeights(s, pool, rows, "b");
    for (const r of rows)
      expect(out.find((x) => x.artist.id === r.artist.id)?.tier).toBe(r.tier);
    expect(out.find((x) => x.artist.id === rows[2].artist.id)?.weight).toBe(
      rows[2].weight,
    );
    expect(sumWeights(out)).toBe(235);
  });
  it("单项替换保留层级权重、排除原结果所有身份", () => {
    const s = settings(),
      rows = roll(s, pool, [], "old"),
      r = rows[3],
      out = replaceRows(s, pool, rows, [r.artist.id], "new");
    expect(
      out.filter((x) => !rows.some((y) => y.artist.id === x.artist.id)),
    ).toHaveLength(1);
    const replacement = out.find(
      (x) => !rows.some((y) => y.artist.id === x.artist.id),
    )!;
    expect(replacement.weight).toBe(r.weight);
    expect(replacement.tier).toBe(r.tier);
    rows[3].lock = "artist";
    expect(() => replaceRows(s, pool, rows, [r.artist.id], "x")).toThrow(
      "锁定",
    );
    expect(() =>
      replaceRows(
        s,
        rows.map((r) => r.artist),
        rows,
        [rows[0].artist.id],
        "x",
      ),
    ).toThrow("候选不足");
  });
  it("只换辅助保留主及所有位置权重，跳过锁定辅助", () => {
    const s = settings(),
      rows = roll(s, pool, [], "a");
    rows[1].lock = "artist";
    const out = replaceRows(
      s,
      pool,
      rows,
      rows.filter((r) => r.tier === "support").map((r) => r.artist.id),
      "b",
    );
    expect(out.find((r) => r.tier === "main")).toEqual(rows[0]);
    expect(out.find((r) => r.artist.id === rows[1].artist.id)).toEqual(rows[1]);
    expect(out.map((r) => r.weight)).toEqual(rows.map((r) => r.weight));
  });
  it("设主交换层级并保持可行总和；锁定项必须解锁", () => {
    const s = settings(),
      rows = roll(s, pool, [], "a"),
      id = rows[4].artist.id,
      out = setMain(s, pool, rows, id, "b");
    expect(out.find((r) => r.tier === "main")?.artist.id).toBe(id);
    expect(out.find((r) => r.artist.id === rows[0].artist.id)?.tier).toBe(
      "accent",
    );
    assertWeights(s, out);
    rows[0].lock = "artist";
    expect(() => setMain(s, pool, rows, id, "b")).toThrow("解锁双方");
  });
  it("手动改权重严格校验层级，重分配其他项", () => {
    const s = settings(),
      rows = roll(s, pool, [], "a");
    const out = editWeight(s, pool, rows, rows[0].artist.id, "1.10", "b");
    expect(out[0].weight).toBe(110);
    expect(sumWeights(out)).toBe(235);
    assertWeights(s, out);
    expect(() =>
      editWeight(s, pool, rows, rows[3].artist.id, "0.80", "x"),
    ).toThrow("点缀层范围");
  });
  it("全部锁重也可成功；自动目标冲突则失败", () => {
    const s = settings(),
      rows = roll(s, pool, [], "a").map((r) => ({
        ...r,
        lock: "weight" as const,
      }));
    expect(roll(s, pool, rows, "b")).toEqual(rows);
    rows[0].weight += 1;
    expect(feasibility(s, pool, rows).plans).toHaveLength(0);
  });
  it("改变人数后局部操作不假装应用新配置", () => {
    const s = settings(),
      rows = roll(s, pool, [], "a");
    s.exact = "6";
    expect(() => currentPlan(s, pool, rows)).toThrow("请先 ROLL");
  });
  it("分层指定主/辅助/点缀人数、自动总权重与校验", () => {
    const s = structuredClone(defaults);
    s.countMode = "tiered";
    s.tierCounts = { main: "2", support: "1", accent: "1" };
    const rows = roll(s, pool, [], "custom-tiers");
    expect(rows.filter((r) => r.tier === "main")).toHaveLength(2);
    expect(rows.filter((r) => r.tier === "support")).toHaveLength(1);
    expect(rows.filter((r) => r.tier === "accent")).toHaveLength(1);
    expect(sumWeights(rows)).toBe(260);
    assertWeights(s, rows);

    // 设主在多主画师且其中一位锁定时，自动与未锁定主画师交换
    rows[0].lock = "artist";
    const supportId = rows.find((r) => r.tier === "support")!.artist.id;
    const swapped = setMain(s, pool, rows, supportId, "swap-multi");
    expect(swapped.filter((r) => r.tier === "main")).toHaveLength(2);
    expect(swapped.find((r) => r.artist.id === supportId)?.tier).toBe("main");

    // 主画师为 0 时正常抽取，点击设主给出明确提示
    s.tierCounts = { main: "0", support: "2", accent: "2" };
    const noMain = roll(s, pool, [], "zero-main");
    expect(noMain.filter((r) => r.tier === "main")).toHaveLength(0);
    expect(sumWeights(noMain)).toBe(140);
    expect(() => setMain(s, pool, noMain, noMain[0].artist.id, "x")).toThrow(
      "未配置主画师",
    );

    // 全为 0 或非法数字拒绝
    s.tierCounts = { main: "0", support: "0", accent: "0" };
    expect(feasibility(s, pool, []).error).toContain("至少为 1");
    s.tierCounts = { main: "-1", support: "1", accent: "1" };
    expect(feasibility(s, pool, []).error).toContain("非负整数");
  });
});
