import { describe, expect, it } from "vitest";
import { defaults, replaceRows, rerollWeights, roll, sumWeights } from "../src/engine";
import { parseArtistTags, validateBackup } from "../src/imports";
import { addTagsToPool, editResultArtist } from "../src/manual-artists";
import { builtin, candidates, initialState, restoreHistory, withResult } from "../src/state";

function fixture() {
  const state = initialState();
  const settings = { ...structuredClone(defaults), countMode: "exact" as const, exact: "3" };
  return withResult({ ...state, settings }, roll(settings, builtin, [], "initial"), "initial");
}
const roundTrip = (state: ReturnType<typeof fixture>) =>
  validateBackup(JSON.parse(JSON.stringify(state)), builtin);

describe("manual artists", () => {
  it("imports plain and weighted tags into an existing custom pool without duplicates", () => {
    const pool = { id: "pool:test", name: "自建池", members: [] };
    const state = { ...fixture(), poolId: pool.id, pools: [pool] };
    const name = builtin[0].tag;
    const first = addTagsToPool(state, pool.id, `artist:${name}, 0.80::artist:Test Custom ::\n test custom，new tag`);
    expect(first.count).toBe(3);
    expect(first.state.importedArtists.map((a) => a.tag)).toEqual(["Test Custom", "new tag"]);
    expect(candidates(roundTrip(first.state)).map((a) => a.tag)).toEqual([name, "Test Custom", "new tag"]);
    expect(addTagsToPool(first.state, pool.id, "test custom").count).toBe(0);
    expect(() => addTagsToPool(state, "top1000", "new tag")).toThrow("自建池");
    expect(() => parseArtistTags("artist:")).toThrow("无效");
    expect(() => parseArtistTags("0.8::artist:bad")).toThrow("无效");
  });

  it("changes one result identity, keeps weight and prior history, and persists the lock", () => {
    const state = fixture();
    const old = state.result!.rows[0];
    const changed = editResultArtist(state, old.artist.id, "artist:Manual Identity", "edit");
    const newRow = changed.result!.rows[0];
    expect(newRow).toMatchObject({ artist: { tag: "Manual Identity" }, tier: old.tier, weight: old.weight, lock: "artist", manual: true });
    expect(changed.history[0].artistText).toContain("Manual Identity");
    expect(changed.history[1]).toEqual(state.history[0]);
    expect(changed.pools).toEqual(state.pools);
    const restored = roundTrip(changed);
    expect(restoreHistory(restored, restored.history[0]).result).toEqual(changed.result);
    const pool = candidates(restored);
    const next = roll(restored.settings, pool, restored.result!.rows, "new");
    expect(next.some((r) => r.artist.id === newRow.artist.id && r.lock === "artist")).toBe(true);
    expect(rerollWeights(restored.settings, pool, next, "weight").some((r) => r.artist.id === newRow.artist.id)).toBe(true);
    const unlocked = next.map((r) => r.artist.id === newRow.artist.id ? { ...r, lock: "none" as const } : r);
    expect(roll(restored.settings, pool, unlocked, "again").some((r) => r.artist.id === newRow.artist.id)).toBe(false);
    const replacement = replaceRows(restored.settings, pool, unlocked, [newRow.artist.id], "replace");
    expect(replacement.some((r) => r.manual)).toBe(false);
  });

  it("keeps an existing weight lock and rejects duplicates or multiple tags", () => {
    const state = fixture(), rows = state.result!.rows;
    rows[0].lock = "weight";
    const next = editResultArtist(state, rows[0].artist.id, "Custom", "edit");
    expect(next.result!.rows[0].lock).toBe("weight");
    expect(() => editResultArtist(state, rows[0].artist.id, rows[1].artist.tag, "edit")).toThrow("已经在结果中");
    expect(() => editResultArtist(state, null, "one, two", "edit")).toThrow("只能填一位");
  });

  it("appends a locked artist, adjusts the count, and respects unchanged total rules", () => {
    const state = fixture();
    const next = roundTrip(editResultArtist(state, null, "Extra Custom", "add"));
    expect(next.result!.rows).toHaveLength(4);
    expect(next.settings.exact).toBe("4");
    expect(next.result!.rows.find((r) => r.artist.tag === "Extra Custom")).toMatchObject({ lock: "artist", manual: true });
    expect(sumWeights(next.result!.rows)).toBe(185);
    expect(state.result!.rows.every((row) => next.result!.rows.some((r) => r.artist.id === row.artist.id && r.weight === row.weight))).toBe(true);
    const impossible = { ...state, settings: { ...state.settings, tiered: { ...state.settings.tiered, total: { ...state.settings.tiered.total, mode: "fixed" as const, fixed: "1.39" } } } };
    expect(() => editResultArtist(impossible, null, "Not Saved", "add")).toThrow("总和不可行");
    expect(impossible.importedArtists).toHaveLength(0);
  });
});
