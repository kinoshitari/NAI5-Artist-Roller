export type Tier = "main" | "support" | "accent" | "free";
export type Lock = "none" | "artist" | "weight";
export interface Artist {
  sampleUrl?: string | null;
  sampleModel?: string | null;
  id: string;
  tag: string;
  displayName: string;
  sourceRank: number | null;
  favorites: number | null;
  sourceUrl: string | null;
  modelEvidence: string | null;
  aliases: string[] | null;
  postCount: number | null;
  topScore: number | null;
}
export interface Row {
  artist: Artist;
  tier: Tier;
  weight: number;
  lock: Lock;
  manual?: true;
}
export interface RangeInput {
  min: string;
  max: string;
}
export type TotalMode = "auto" | "none" | "fixed" | "range";
export interface TotalInput {
  mode: TotalMode;
  fixed: string;
  min: string;
  max: string;
}
export interface TierCountsInput {
  main: string;
  support: string;
  accent: string;
}
export interface Settings {
  countMode: "exact" | "range" | "tiered";
  exact: string;
  countMin: string;
  countMax: string;
  tierCounts: TierCountsInput;
  mode: "tiered" | "free";
  tiered: {
    ranges: Record<"main" | "support" | "accent", RangeInput>;
    globalEnabled: boolean;
    global: RangeInput;
    total: TotalInput;
  };
  free: { range: RangeInput; total: TotalInput };
  style: "regular" | "paint" | "depth" | "off" | "custom";
  length: "short" | "medium" | "long";
  customPresetId: string;
  intensity: string;
  face: string;
  prefix: boolean;
  yearEnabled: boolean;
  year: string;
  seed: string;
}
export interface Preset {
  id: string;
  name: string;
  parts: string[];
  core: boolean;
}
export interface Pool {
  id: string;
  name: string;
  members: string[];
}
export type SourceParserMode =
  | "auto"
  | "danbooru"
  | "moebooru"
  | "gelbooru"
  | "tags-gallery"
  | "html-selector"
  | "text-regex";
export interface ArtistSource {
  id: string;
  name: string;
  url: string;
  parser: SourceParserMode;
  selector: string;
  pageStart: number;
  pageCount: number;
  replaceUnderscores: boolean;
  poolId: string;
  lastFetchedAt: string | null;
  lastCount: number;
  lastError: string | null;
}
export interface Result {
  rows: Row[];
  seed: string;
  generatedConfig: string;
  dataVersion: string;
}
export interface HistoryEntry {
  id: string;
  createdAt: string;
  favorite: boolean;
  note?: string;
  referenceImage?: string;
  result: Result;
  settings: Settings;
  preset: Preset | null;
  fullPreset: string;
  artistText: string;
  combinedText: string;
  poolId: string;
  candidateIds: string[];
}
export interface AppState {
  formatVersion: 1;
  settings: Settings;
  catalogSnapshot: Artist[];
  importedArtists: Artist[];
  pools: Pool[];
  sources: ArtistSource[];
  poolId: string;
  favorites: string[];
  excluded: string[];
  presetEdits: Record<string, Preset>;
  customPresets: Preset[];
  result: Result | null;
  restoredPreset: Preset | null | undefined;
  history: HistoryEntry[];
}
