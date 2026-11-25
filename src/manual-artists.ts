import { countRange, distribute, plan, resolveRoleCounts, rng, tierRange } from "./engine";
import { mergeArtists, parseArtistTags } from "./imports";
import { catalog, resultRecord, withResult } from "./state";
import type { AppState, Row, Settings, Tier } from "./types";

export function addTagsToPool(s: AppState, poolId: string, input: string) {
  const pool = s.pools.find((p) => p.id === poolId);
  if (!pool || s.sources.some((source) => source.poolId === poolId))
    throw new Error("请选择自建池；网站拉取池由拉取源维护");
  const { added, members } = mergeArtists(parseArtistTags(input), catalog(s));
  const next = [...new Set([...pool.members, ...members])];
  return {
    state: {
      ...s,
      importedArtists: [...s.importedArtists, ...added],
      pools: s.pools.map((p) => (p.id === poolId ? { ...p, members: next } : p)),
    },
    count: next.length - pool.members.length,
  };
}

function appendManualRow(settings: Settings, rows: Row[], artist: Row["artist"], seed: string) {
  const [lo, hi] = countRange(settings);
  const n = rows.length + 1;
  // Retain the current identities and tiers. Adjust only the count controls
  // necessary for an explicit addition; never relax weight constraints.
  const counts = { main: 0, support: 0, accent: 0, free: 0 };
  for (const row of rows) counts[row.tier]++;
  if (rows.some((r) => (settings.mode === "free") !== (r.tier === "free")))
    throw new Error("当前结果与权重模式不一致，请先 ROLL");
  let next: Settings = settings;
  let tier: Tier;
  if (settings.mode === "free") {
    tier = "free";
  } else {
    const tiers = ["main", "support", "accent"] as const;
    const slots = settings.countMode === "tiered" ? null : resolveRoleCounts(settings, n);
    const open = slots && tiers.find((t) => slots[t] > counts[t] && tiers.every((k) => slots[k] >= counts[k]));
    tier = open || (!counts.main ? "main" : "support");
    if (!open) {
      const updated = { ...counts, [tier]: counts[tier] + 1 };
      next = { ...next, countMode: "tiered", tierCounts: {
        main: String(updated.main), support: String(updated.support), accent: String(updated.accent),
      } };
    }
  }
  if (next.countMode === "exact") next = { ...next, exact: String(n) };
  if (next.countMode === "range" && (n < lo || n > hi))
    next = { ...next, countMin: String(Math.min(n, lo)), countMax: String(Math.max(n, hi)) };

  const [min] = tierRange(next, tier);
  const row: Row = { artist, tier, weight: min, lock: "artist", manual: true };
  const revised = [...rows, row];
  const pinned = rows.map((r) => ({ ...r, lock: "weight" as const }));
  let output: Row[];
  try {
    const fixed = [...pinned, row];
    output = distribute(next, fixed, plan(next, n, fixed), rng(seed)).map((r) =>
      r.artist.id === artist.id ? r : { ...r, lock: rows.find((old) => old.artist.id === r.artist.id)!.lock },
    );
  } catch {
    output = distribute(next, revised, plan(next, n, revised), rng(seed));
  }
  return { settings: next, rows: output };
}

export function editResultArtist(s: AppState, id: string | null, input: string, seed: string): AppState {
  const incoming = parseArtistTags(input);
  if (incoming.length !== 1 || /[,，\r\n]/.test(input.trim()))
    throw new Error("每个结果栏只能填一位画师");
  const existing = catalog(s);
  const { added, members } = mergeArtists(incoming, existing);
  const artist = added[0] ?? existing.find((a) => a.id === members[0])!;
  const rows = s.result?.rows ?? [];
  if (id !== null && !rows.some((r) => r.artist.id === id))
    throw new Error("找不到要编辑的结果");
  if (rows.some((r) => r.artist.id !== id && r.artist.id === artist.id))
    throw new Error(`${artist.tag} 已经在结果中`);
  const base = { ...s, importedArtists: [...s.importedArtists, ...added] };
  if (id !== null) {
    // Name changes do not reroll weights, apply pending settings, or rename any catalog entry.
    const result = {
      ...s.result!,
      rows: rows.map((r): Row => r.artist.id === id
        ? { ...r, artist, manual: true, lock: r.lock === "weight" ? "weight" : "artist" }
        : r),
    };
    return { ...base, result, history: [resultRecord(base, result), ...base.history].slice(0, 50) };
  }
  const next = appendManualRow(s.settings, rows, artist, seed);
  return withResult({ ...base, settings: next.settings }, next.rows, seed);
}
