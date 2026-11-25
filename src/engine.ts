import type { Artist, RangeInput, Row, Settings, Tier } from "./types";

export const tierLabels: Record<Tier, string> = {
  main: "主",
  support: "辅",
  accent: "点缀",
  free: "自由",
};
export const defaults: Settings = {
  countMode: "range",
  exact: "5",
  countMin: "3",
  countMax: "6",
  tierCounts: { main: "1", support: "2", accent: "2" },
  mode: "tiered",
  tiered: {
    ranges: {
      main: { min: "0.85", max: "1.10" },
      support: { min: "0.35", max: "0.65" },
      accent: { min: "0.10", max: "0.30" },
    },
    globalEnabled: false,
    global: { min: "0.00", max: "2.00" },
    total: { mode: "auto", fixed: "2.35", min: "1.50", max: "3.00" },
  },
  free: {
    range: { min: "0.40", max: "1.20" },
    total: { mode: "none", fixed: "3.60", min: "2.00", max: "4.00" },
  },
  style: "depth",
  length: "medium",
  customPresetId: "",
  intensity: "0.45",
  face: "-0.80",
  prefix: false,
  yearEnabled: false,
  year: "2026",
  seed: "",
};
export const formatWeight = (cents: number) => (cents / 100).toFixed(2);
export function cents(value: string, label = "权重", signed = false): number {
  if (
    !(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value.trim())
  )
    throw new Error(`${label}须为最多两位小数`);
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 100000000)
    throw new Error(`${label}超出有效范围`);
  return n;
}
function count(value: string) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(+value) || +value < 1)
    throw new Error("画师数量须为正整数");
  return +value;
}
function tierCount(value: string, label: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(+trimmed))
    throw new Error(`${label}画师数量须为非负整数`);
  return +trimmed;
}
export function customRoleCounts(s: Settings): Record<Tier, number> {
  const main = tierCount(s.tierCounts.main, "主"),
    support = tierCount(s.tierCounts.support, "辅助"),
    accent = tierCount(s.tierCounts.accent, "点缀");
  if (main + support + accent < 1)
    throw new Error("主 / 辅助 / 点缀画师总数至少为 1");
  return { main, support, accent, free: 0 };
}
export function countRange(s: Settings): [number, number] {
  if (s.countMode === "tiered") {
    if (s.mode !== "tiered") throw new Error("自由模式不支持按层指定数量");
    const r = customRoleCounts(s);
    const total = r.main + r.support + r.accent;
    return [total, total];
  }
  const a = count(s.countMode === "exact" ? s.exact : s.countMin),
    b = count(s.countMode === "exact" ? s.exact : s.countMax);
  if (a > b) throw new Error("数量下限不能大于上限");
  return [a, b];
}
export function roleCounts(n: number): Record<Tier, number> {
  const support = Math.ceil((n - 1) / 3);
  return { main: 1, support, accent: n - 1 - support, free: 0 };
}
export function resolveRoleCounts(
  s: Settings,
  n: number,
): Record<Tier, number> {
  if (s.mode === "free") return { main: 0, support: 0, accent: 0, free: n };
  if (s.countMode === "tiered") {
    const r = customRoleCounts(s);
    if (r.main + r.support + r.accent !== n)
      throw new Error("当前人数与分层数量设置不符，请先 ROLL");
    return r;
  }
  return roleCounts(n);
}
export function autoTotalForSlots(r: Record<Tier, number>) {
  return 95 * r.main + 50 * r.support + 20 * r.accent;
}
export function autoTotal(n: number) {
  return autoTotalForSlots(roleCounts(n));
}
function range(r: RangeInput, label: string): [number, number] {
  const low = cents(r.min, `${label}下限`),
    high = cents(r.max, `${label}上限`);
  if (low > high) throw new Error(`${label}下限不能大于上限`);
  return [low, high];
}
export function tierRange(s: Settings, tier: Tier): [number, number] {
  if (s.mode === "free") {
    if (tier !== "free")
      throw new Error("层级与自由模式冲突，请先解锁或重新 ROLL");
    return range(s.free.range, "自由权重");
  }
  if (tier === "free")
    throw new Error("自由项与主次模式冲突，请先解锁或重新 ROLL");
  const [lo, hi] = range(s.tiered.ranges[tier], tierLabels[tier]);
  if (!s.tiered.globalEnabled) return [lo, hi];
  const [gl, gh] = range(s.tiered.global, "全局权重");
  if (Math.max(lo, gl) > Math.min(hi, gh))
    throw new Error(`${tierLabels[tier]}层与全局范围无交集`);
  return [Math.max(lo, gl), Math.min(hi, gh)];
}
export interface Plan {
  n: number;
  min: number;
  max: number;
  target: [number, number] | null;
  slots: Record<Tier, number>;
  autoTarget: number | null;
}
export function plan(s: Settings, n: number, locks: Row[]): Plan {
  const initialSlots = resolveRoleCounts(s, n);
  const slots: Record<Tier, number> = { ...initialSlots };
  const autoTarget =
    s.mode === "tiered" ? autoTotalForSlots(initialSlots) : null;
  let min = 0,
    max = 0;
  for (const row of locks) {
    if (--slots[row.tier] < 0)
      throw new Error(
        `锁定${tierLabels[row.tier]}层超出 ${n} 人名额，请解锁或增加人数`,
      );
    const [lo, hi] = tierRange(s, row.tier);
    if (row.lock === "weight") {
      if (!Number.isInteger(row.weight) || row.weight < lo || row.weight > hi)
        throw new Error(
          `${row.artist.tag} 的锁定权重不在 ${formatWeight(lo)}–${formatWeight(hi)}`,
        );
      min += row.weight;
      max += row.weight;
    } else {
      min += lo;
      max += hi;
    }
  }
  for (const tier of Object.keys(slots) as Tier[])
    if (slots[tier]) {
      const [lo, hi] = tierRange(s, tier);
      min += slots[tier] * lo;
      max += slots[tier] * hi;
    }
  const t = s.mode === "tiered" ? s.tiered.total : s.free.total;
  let target: [number, number] | null = null;
  if (t.mode === "auto") {
    if (s.mode === "free") throw new Error("自由模式不支持自动总权重");
    target = [autoTarget!, autoTarget!];
  } else if (t.mode === "fixed")
    target = [cents(t.fixed, "固定总和"), cents(t.fixed, "固定总和")];
  else if (t.mode === "range") target = range(t, "总和");
  if (target) {
    const lo = Math.max(target[0], min),
      hi = Math.min(target[1], max);
    if (lo > hi)
      throw new Error(
        `${n} 人总和不可行：可行区间 ${formatWeight(min)}–${formatWeight(max)}${t.mode === "auto" ? `；自动目标 ${formatWeight(target[0])}` : ""}`,
      );
    target = [lo, hi];
  }
  return { n, min, max, target, slots, autoTarget };
}
function checkPool(rows: Row[], pool: Artist[]) {
  const ids = new Set(pool.map((a) => a.id)),
    seen = new Set<string>();
  for (const r of rows) {
    if (!ids.has(r.artist.id) && !r.manual)
      throw new Error(
        `${r.artist.tag} 不在当前有效池，请解锁后 ROLL 或调整画师池`,
      );
    if (seen.has(r.artist.id)) throw new Error("结果中存在重复画师");
    seen.add(r.artist.id);
  }
}
export function feasibility(s: Settings, pool: Artist[], rows: Row[]) {
  const plans: Plan[] = [],
    failures: string[] = [];
  try {
    const [lo, hi] = countRange(s),
      locks = rows.filter((r) => r.lock !== "none");
    checkPool(locks, pool);
    const poolIds = new Set(pool.map((a) => a.id));
    const available = poolIds.size + locks.filter((r) => r.manual && !poolIds.has(r.artist.id)).length;
    if (available < lo)
      throw new Error(
        `画师池不足：需要至少 ${lo} 人，当前可用 ${available} 人`,
      );
    for (let n = lo; n <= Math.min(hi, available); n++) {
      try {
        plans.push(plan(s, n, locks));
      } catch (e) {
        failures.push((e as Error).message);
      }
    }
    return {
      plans,
      error: plans.length ? "" : [...new Set(failures)].join("；"),
      partial: plans.length < hi - lo + 1,
    };
  } catch (e) {
    return { plans: [], error: (e as Error).message, partial: false };
  }
}
export function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Random = () => number;
const randomInt = (r: Random, lo: number, hi: number) =>
  lo + Math.floor(r() * (hi - lo + 1));
function shuffle<T>(items: T[], r: Random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function sortRows(rows: Row[]) {
  const order: Record<Tier, number> = {
    main: 0,
    support: 1,
    accent: 2,
    free: 3,
  };
  return [...rows].sort(
    (a, b) =>
      order[a.tier] - order[b.tier] ||
      b.weight - a.weight ||
      a.artist.id.localeCompare(b.artist.id, "en"),
  );
}
export function distribute(s: Settings, rows: Row[], p: Plan, r: Random) {
  const out = rows.map((x) => ({ ...x }));
  const indices = shuffle(
    out.map((_, i) => i).filter((i) => out[i].lock !== "weight"),
    r,
  );
  const bounds = indices.map((i) => tierRange(s, out[i].tier));
  if (!p.target)
    indices.forEach((i, k) => {
      out[i].weight = randomInt(r, ...bounds[k]);
    });
  else {
    let remaining =
      randomInt(r, ...p.target) -
      out.filter((x) => x.lock === "weight").reduce((n, x) => n + x.weight, 0);
    let restMin = bounds.reduce((n, b) => n + b[0], 0),
      restMax = bounds.reduce((n, b) => n + b[1], 0);
    indices.forEach((i, k) => {
      const [lo, hi] = bounds[k];
      restMin -= lo;
      restMax -= hi;
      const value = randomInt(
        r,
        Math.max(lo, remaining - restMax),
        Math.min(hi, remaining - restMin),
      );
      out[i].weight = value;
      remaining -= value;
    });
    if (remaining !== 0) throw new Error("总和分配失败");
  }
  return sortRows(out);
}
export function roll(
  s: Settings,
  pool: Artist[],
  previous: Row[],
  seed: string,
) {
  const f = feasibility(s, pool, previous);
  if (!f.plans.length) throw new Error(f.error);
  const r = rng(seed),
    p = f.plans[randomInt(r, 0, f.plans.length - 1)],
    locks = previous.filter((x) => x.lock !== "none");
  const locked = new Set(locks.map((x) => x.artist.id));
  const draw = shuffle(
    [...pool]
      .sort((a, b) => a.id.localeCompare(b.id, "en"))
      .filter((a) => !locked.has(a.id)),
    r,
  ).slice(0, p.n - locks.length);
  const tiers = shuffle(
    (Object.keys(p.slots) as Tier[]).flatMap((t) =>
      Array<Tier>(p.slots[t]).fill(t),
    ),
    r,
  );
  return distribute(
    s,
    [
      ...locks,
      ...draw.map((artist, i) => ({
        artist,
        tier: tiers[i],
        weight: 0,
        lock: "none" as const,
      })),
    ],
    p,
    r,
  );
}
export function currentPlan(s: Settings, pool: Artist[], rows: Row[]) {
  checkPool(rows, pool);
  const [lo, hi] = countRange(s);
  if (!rows.length || rows.length < lo || rows.length > hi)
    throw new Error("当前人数与设置不符，请先 ROLL");
  // Passing all identities keeps every role fixed while only weight-locks fix weights.
  return plan(s, rows.length, rows);
}
export function rerollWeights(
  s: Settings,
  pool: Artist[],
  rows: Row[],
  seed: string,
) {
  return distribute(s, rows, currentPlan(s, pool, rows), rng(seed));
}
export function replaceRows(
  s: Settings,
  pool: Artist[],
  rows: Row[],
  ids: string[],
  seed: string,
) {
  currentPlan(s, pool, rows);
  const selected = rows.filter(
    (x) => ids.includes(x.artist.id) && x.lock === "none",
  );
  if (!selected.length) throw new Error("所选身份已锁定，或没有可替换项");
  // Exclude the complete old result: replacement never silently keeps the old artist.
  const used = new Set(rows.map((x) => x.artist.id));
  const choices = shuffle(
    [...pool]
      .sort((a, b) => a.id.localeCompare(b.id, "en"))
      .filter((a) => !used.has(a.id)),
    rng(seed),
  );
  if (choices.length < selected.length)
    throw new Error(
      `候选不足：需要 ${selected.length} 位未出现在结果中的画师，只有 ${choices.length} 位`,
    );
  assertWeights(s, rows);
  let i = 0;
  return sortRows(
    rows.map((x) =>
      selected.includes(x)
        ? { artist: choices[i++], tier: x.tier, weight: x.weight, lock: x.lock }
        : x,
    ),
  );
}
export function setMain(
  s: Settings,
  pool: Artist[],
  rows: Row[],
  id: string,
  seed: string,
) {
  if (s.mode !== "tiered") throw new Error("自由模式没有主画师");
  const chosen = rows.find((x) => x.artist.id === id);
  const mains = rows.filter((x) => x.tier === "main");
  if (!chosen) throw new Error("请先 ROLL 主次结果");
  if (!mains.length)
    throw new Error("当前分层未配置主画师，请先将主画师数量设为至少 1");
  if (chosen.tier === "main") return rows;
  const main = mains.find((x) => x.lock === "none") ?? mains[0];
  if (chosen.lock !== "none" || main.lock !== "none")
    throw new Error("交换层级前，请先解锁双方");
  const swapped = rows.map((x) => ({
    ...x,
    tier: x === chosen ? ("main" as const) : x === main ? chosen.tier : x.tier,
  }));
  return redistributeNecessary(
    s,
    pool,
    swapped,
    new Set([chosen.artist.id, main.artist.id]),
    seed,
  );
}
function redistributeNecessary(
  s: Settings,
  pool: Artist[],
  rows: Row[],
  change: Set<string>,
  seed: string,
) {
  const frozen = rows.map((x) =>
    change.has(x.artist.id) ? x : { ...x, lock: "weight" as const },
  );
  let out: Row[];
  try {
    out = distribute(s, frozen, currentPlan(s, pool, frozen), rng(seed));
  } catch {
    out = distribute(s, rows, currentPlan(s, pool, rows), rng(seed));
  }
  return sortRows(
    out.map((x) => ({
      ...x,
      lock: rows.find((y) => y.artist.id === x.artist.id)!.lock,
    })),
  );
}
export function editWeight(
  s: Settings,
  pool: Artist[],
  rows: Row[],
  id: string,
  weight: string,
  seed: string,
) {
  const row = rows.find((x) => x.artist.id === id);
  if (!row) throw new Error("画师不存在");
  if (row.lock === "weight") throw new Error("请先解锁权重");
  const value = cents(weight),
    [lo, hi] = tierRange(s, row.tier);
  if (value < lo || value > hi)
    throw new Error(
      `${tierLabels[row.tier]}层范围 ${formatWeight(lo)}–${formatWeight(hi)}`,
    );
  const revised = rows.map((x) =>
    x === row ? { ...x, weight: value, lock: "weight" as const } : x,
  );
  currentPlan(s, pool, revised);
  let out: Row[];
  try {
    assertWeights(s, revised);
    out = revised;
  } catch {
    out = distribute(s, revised, currentPlan(s, pool, revised), rng(seed));
  }
  return sortRows(
    out.map((x) => (x.artist.id === id ? { ...x, lock: row.lock } : x)),
  );
}
export function assertWeights(s: Settings, rows: Row[]) {
  const p = plan(
    s,
    rows.length,
    rows.map((x) => ({ ...x, lock: "weight" })),
  );
  if (!p.n) throw new Error("没有画师");
}
export const sumWeights = (rows: Row[]) =>
  rows.reduce((n, r) => n + r.weight, 0);
export function configKey(s: Settings) {
  return JSON.stringify({
    countMode: s.countMode,
    exact: s.exact,
    countMin: s.countMin,
    countMax: s.countMax,
    tierCounts: s.countMode === "tiered" ? s.tierCounts : undefined,
    mode: s.mode,
    active: s[s.mode],
  });
}
export function newSeed() {
  return Array.from(crypto.getRandomValues(new Uint32Array(2)))
    .map((n) => n.toString(36))
    .join("-");
}
