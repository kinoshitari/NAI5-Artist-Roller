import defaults from "./default-presets.json";
import type { AppState, Preset, Row, Settings } from "./types";
import { cents, formatWeight } from "./engine";
export const defaultPresets: Preset[] = defaults;
export function chosenPreset(state: AppState): Preset | null {
  if (state.restoredPreset !== undefined) return state.restoredPreset;
  const s = state.settings;
  if (s.style === "off") return null;
  if (s.style === "custom")
    return state.customPresets.find((p) => p.id === s.customPresetId) ?? null;
  const id = `${s.style}-${s.length}`;
  return state.presetEdits[id] ?? defaultPresets.find((p) => p.id === id)!;
}
export function renderPreset(p: Preset | null, s: Settings) {
  if (!p) return "";
  let intensity = 0,
    face = 0;
  if (p.core) {
    intensity = cents(s.intensity, "3D 强度");
    face = cents(s.face, "3D 脸抑制", true);
    if (intensity <= 0 || face >= 0)
      throw new Error("3D 强度须大于 0，3D 脸抑制须小于 0");
  }
  return p.parts
    .map((x) =>
      x === "{{3d}}"
        ? `${formatWeight(intensity)}::3d ::`
        : x === "{{face}}"
          ? `${formatWeight(face)}::3d face ::`
          : x,
    )
    .join("");
}
export function parsePresetText(
  text: string,
  id: string,
  name: string,
  requireCore: boolean,
) {
  if (!text.trim()) throw new Error("预设正文不能为空；停用请选“关闭”");
  if (/\{\{(?:3d|face)\}\}/.test(text)) throw new Error("请使用数字加权语法，不要输入内部占位符");
  const regex = /(-?\d+(?:\.\d{1,2})?)\s*::\s*(3d(?: face)?)\s*::/g;
  let position = 0,
    intensity: string | undefined,
    face: string | undefined;
  const parts: string[] = [];
  for (const m of text.matchAll(regex)) {
    parts.push(text.slice(position, m.index));
    const isFace = m[2] === "3d face";
    if (isFace ? face !== undefined : intensity !== undefined)
      throw new Error("3d 与 3d face 各只能有一组");
    const value = cents(m[1], m[2], true);
    if (isFace ? value >= 0 : value <= 0)
      throw new Error("3d 须为正权重，3d face 须为负权重");
    if (isFace) face = formatWeight(value);
    else intensity = formatWeight(value);
    parts.push(isFace ? "{{face}}" : "{{3d}}");
    position = m.index! + m[0].length;
  }
  parts.push(text.slice(position));
  const core = intensity !== undefined || face !== undefined || requireCore;
  if (core && (intensity === undefined || face === undefined))
    throw new Error("2.5D 核心需同时保留一组加权 3d 与 3d face");
  // Bare, malformed, or grouped copies would escape the parameter controls.
  if (
    core &&
    parts
      .filter((x) => x !== "{{3d}}" && x !== "{{face}}")
      .some((x) => /\b3d(?: face)?\b/i.test(x))
  )
    throw new Error("核心词请单独加权；正文里不要再写 3d 或 3d face");
  return {
    preset: { id, name: name.trim() || "自建预设", parts, core },
    intensity,
    face,
  };
}
export function artistPrompt(rows: Row[], prefix: boolean) {
  return rows
    .map((r) => {
      const raw = r.artist.tag.replace(/^(?:artist:\s*)+/i, "");
      return `${formatWeight(r.weight)}::${prefix ? "artist:" : ""}${raw} ::`;
    })
    .join(", ");
}
export function outputs(rows: Row[], preset: Preset | null, s: Settings) {
  const artists = artistPrompt(rows, s.prefix),
    quality = renderPreset(preset, s);
  if (s.yearEnabled && !/^\d{4}$/.test(s.year))
    throw new Error("年份须为四位数字");
  return {
    artists,
    quality,
    combined: [artists, quality, s.yearEnabled ? `year ${s.year}` : ""]
      .filter(Boolean)
      .join(", "),
  };
}
