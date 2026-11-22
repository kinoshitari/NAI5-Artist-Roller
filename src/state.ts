import rawArtists from "../data/artists.v5.top1000.json";
import source from "../data/source.json";
import { configKey, defaults, newSeed, roll } from "./engine";
import { chosenPreset, outputs } from "./presets";
import { validateBackup } from "./imports";
import { requestTextDownload } from "./browser-io";
import type { AppState, Artist, HistoryEntry, Result } from "./types";
export const builtin: Artist[] = rawArtists;
export const provenance = source;
export const STORAGE_KEY = "nai5-artist-roller-v1";
export function catalog(s: AppState) {
  return [...builtin, ...s.importedArtists];
}
export function members(s: AppState): Artist[] {
  if (s.poolId === "top100") return builtin.slice(0, 100);
  if (s.poolId === "top300") return builtin.slice(0, 300);
  if (s.poolId === "top1000") return builtin;
  const ids = new Set(
    s.poolId === "favorites"
      ? s.favorites
      : (s.pools.find((p) => p.id === s.poolId)?.members ?? []),
  );
  return catalog(s).filter((a) => ids.has(a.id));
}
export function candidates(s: AppState) {
  const excluded = new Set(s.excluded);
  return members(s).filter((a) => !excluded.has(a.id));
}
export function resultRecord(
  s: AppState,
  result: Result,
  favorite = false,
): HistoryEntry {
  const preset = chosenPreset(s),
    out = outputs(result.rows, preset, s.settings);
  return {
    id: newSeed(),
    createdAt: new Date().toISOString(),
    favorite,
    result: structuredClone(result),
    settings: structuredClone(s.settings),
    preset: structuredClone(preset),
    fullPreset: out.quality,
    artistText: out.artists,
    combinedText: out.combined,
    poolId: s.poolId,
    candidateIds: candidates(s).map((a) => a.id),
  };
}
export function withResult(
  s: AppState,
  rows: Result["rows"],
  seed: string,
): AppState {
  const result = {
    rows,
    seed,
    generatedConfig: configKey(s.settings),
    dataVersion: provenance.version,
  };
  const entry = resultRecord(s, result);
  return { ...s, result, history: [entry, ...s.history].slice(0, 50) };
}
export function initialState(): AppState {
  let s: AppState = {
    formatVersion: 1,
    settings: structuredClone(defaults),
    catalogSnapshot: builtin,
    importedArtists: [],
    pools: [],
    sources: [],
    poolId: "top1000",
    favorites: [],
    excluded: [],
    presetEdits: {},
    customPresets: [],
    result: null,
    restoredPreset: undefined,
    history: [],
  };
  const seed = newSeed();
  s = withResult(s, roll(s.settings, builtin, [], seed), seed);
  return s;
}
export function loadState() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return {
      state: raw ? validateBackup(JSON.parse(raw), builtin) : initialState(),
      error: "",
      raw: null,
    };
  } catch (e) {
    return {
      state: initialState(),
      error: `本地存档无法读取：${(e as Error).message}。原存档未覆盖，当前更改仅保留在本次会话。请导出完整备份。`,
      raw,
    };
  }
}
export function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
export function restoreHistory(s: AppState, h: HistoryEntry): AppState {
  const all = new Set(catalog(s).map((a) => a.id));
  const missing = h.result.rows
    .map((r) => r.artist)
    .filter((a) => !all.has(a.id));
  let poolId = h.poolId,
    pools = s.pools;
  if (
    ![
      "top100",
      "top300",
      "top1000",
      "favorites",
      ...s.pools.map((p) => p.id),
    ].includes(poolId)
  ) {
    poolId = `restored:${h.id}`;
    pools = [
      ...pools,
      {
        id: poolId,
        name: "历史画师池",
        members: h.result.rows.map((r) => r.artist.id),
      },
    ];
  }
  return {
    ...s,
    settings: structuredClone(h.settings),
    result: structuredClone(h.result),
    restoredPreset: structuredClone(h.preset),
    poolId,
    pools,
    importedArtists: [...s.importedArtists, ...missing],
  };
}
export function download(
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
) {
  return requestTextDownload({ name, content, type });
}
