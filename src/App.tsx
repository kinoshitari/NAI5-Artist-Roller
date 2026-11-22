import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  CloudDownload,
  Database,
  Lock,
  LockOpen,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import type {
  AppState,
  Artist,
  ArtistSource,
  RangeInput,
  Row,
  Settings,
  SourceParserMode,
  TotalInput,
} from "./types";
import {
  cents,
  configKey,
  editWeight,
  feasibility,
  formatWeight,
  newSeed,
  replaceRows,
  rerollWeights,
  roleCounts,
  roll,
  setMain,
  sumWeights,
  tierLabels,
} from "./engine";
import {
  chosenPreset,
  defaultPresets,
  outputs,
  parsePresetText,
  renderPreset,
} from "./presets";
import {
  artistsCsv,
  importArtists,
  mergeArtists,
  safeSourceUrl,
  validateBackup,
} from "./imports";
import {
  extractArtistsFromText,
  fetchSourceArtists,
  PARSER_OPTIONS,
  SOURCE_TEMPLATES,
} from "./sources";
import {
  canShareTextFile,
  copyTextToClipboard,
  shareTextFile,
} from "./browser-io";
import type { TextFile } from "./browser-io";
import { WebAppTools } from "./WebAppTools";
import {
  builtin,
  candidates,
  catalog,
  download as requestDownload,
  loadState,
  members,
  provenance,
  restoreHistory,
  resultRecord,
  STORAGE_KEY,
  toggle,
  withResult,
} from "./state";

function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segments" role="group" aria-label={label}>
      {options.map(([v, t]) => (
        <button
          key={v}
          className={value === v ? "selected" : ""}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
function Stepper({
  label,
  value,
  onChange,
  step = 1,
  decimal = false,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  decimal?: boolean;
  min?: number;
}) {
  const add = (n: number) => {
    if (value.trim() && Number.isFinite(+value)) {
      let next = +value + n * step;
      if (min !== undefined && next < min) next = min;
      onChange(decimal ? next.toFixed(2) : String(Math.round(next)));
    }
  };
  return (
    <div className="stepper">
      <button
        aria-label={`${label}减少`}
        disabled={
          min !== undefined &&
          value.trim() !== "" &&
          Number.isFinite(+value) &&
          +value <= min
        }
        onClick={() => add(-1)}
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button aria-label={`${label}增加`} onClick={() => add(1)}>
        +
      </button>
    </div>
  );
}
function RangeFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RangeInput;
  onChange: (v: RangeInput) => void;
}) {
  return (
    <div className="range-fields">
      <input
        aria-label={`${label}下限`}
        inputMode="decimal"
        value={value.min}
        onChange={(e) => onChange({ ...value, min: e.target.value })}
      />
      <span>—</span>
      <input
        aria-label={`${label}上限`}
        inputMode="decimal"
        value={value.max}
        onChange={(e) => onChange({ ...value, max: e.target.value })}
      />
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="关闭弹窗" className="close" onClick={onClose}>
          <X size={22} strokeWidth={2.5} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
function WeightInput({
  row,
  onApply,
}: {
  row: Row;
  onApply: (text: string) => boolean;
}) {
  const [text, setText] = useState(formatWeight(row.weight));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(formatWeight(row.weight));
    setBad(false);
  }, [row.weight]);
  const apply = () => {
    if (text === formatWeight(row.weight)) {
      setBad(false);
      return;
    }
    const ok = onApply(text);
    setBad(!ok);
    if (ok) setText(formatWeight(cents(text)));
  };
  return (
    <input
      className={bad ? "weight invalid" : "weight"}
      aria-label={`${row.artist.tag} 权重`}
      aria-invalid={bad}
      disabled={row.lock === "weight"}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function TotalControls({
  s,
  onChange,
}: {
  s: Settings;
  onChange: (v: TotalInput) => void;
}) {
  const t = s[s.mode].total;
  return (
    <>
      <Segments
        label="总权重模式"
        value={t.mode}
        options={[
          ...(s.mode === "tiered"
            ? [["auto", "自动"] as ["auto", string]]
            : []),
          ["none", "不限"],
          ["fixed", "固定"],
          ["range", "范围"],
        ]}
        onChange={(mode) => onChange({ ...t, mode })}
      />
      {t.mode === "fixed" && (
        <Stepper
          label="固定总权重"
          value={t.fixed}
          onChange={(fixed) => onChange({ ...t, fixed })}
          step={0.05}
          decimal
        />
      )}
      {t.mode === "range" && (
        <RangeFields
          label="总权重"
          value={t}
          onChange={(r) => onChange({ ...t, ...r })}
        />
      )}
    </>
  );
}

export default function App() {
  const [loaded] = useState(loadState),
    [state, setState] = useState(loaded.state),
    [storageError, setStorageError] = useState(loaded.error),
    [canSave, setCanSave] = useState(!loaded.error);
  const [notice, setNotice] = useState(""),
    [actionError, setActionError] = useState(""),
    [tab, setTab] = useState<"config" | "prompt" | "result">("prompt"),
    [poolExpanded, setPoolExpanded] = useState(false),
    [leftWidth, setLeftWidth] = useState(324),
    [rightWidth, setRightWidth] = useState(356),
    [promptHeight, setPromptHeight] = useState<number | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const promptWrapRef = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<
    | null
    | "advanced"
    | "source"
    | "remoteSources"
    | "help"
    | "manage"
    | "backup"
    | "preset"
    | "copy"
    | "export"
    | "add"
  >(null);
  const [search, setSearch] = useState(""),
    [allLibrary, setAllLibrary] = useState(false),
    [selection, setSelection] = useState<string[]>([]);
  const [poolName, setPoolName] = useState(""),
    [targetPool, setTargetPool] = useState(""),
    [presetDraft, setPresetDraft] = useState(""),
    [presetName, setPresetName] = useState("");
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null),
    [srcName, setSrcName] = useState(SOURCE_TEMPLATES[0].name),
    [srcUrl, setSrcUrl] = useState(SOURCE_TEMPLATES[0].url),
    [srcParser, setSrcParser] = useState<SourceParserMode>(
      SOURCE_TEMPLATES[0].parser,
    ),
    [srcSelector, setSrcSelector] = useState(""),
    [srcPageStart, setSrcPageStart] = useState("1"),
    [srcPageCount, setSrcPageCount] = useState("1"),
    [srcReplaceUnderscores, setSrcReplaceUnderscores] = useState(true),
    [srcAppend, setSrcAppend] = useState(false),
    [srcBusyId, setSrcBusyId] = useState<string | null>(null),
    [srcProgress, setSrcProgress] = useState(""),
    [manualRawText, setManualRawText] = useState("");
  const [pendingBackup, setPendingBackup] = useState<AppState | null>(null),
    [backupUndo, setBackupUndo] = useState<AppState | null>(null);
  const [copyText, setCopyText] = useState(""),
    [outputTab, setOutputTab] = useState<"combined" | "artists">("combined"),
    [historyFavoriteOnly, setHistoryFavoriteOnly] = useState(false);
  const [exportFile, setExportFile] = useState<TextFile | null>(null),
    [exportStatus, setExportStatus] = useState(""),
    [shareBusy, setShareBusy] = useState(false);
  const exportTextRef = useRef<HTMLTextAreaElement>(null);
  const s = state.settings,
    rows = state.result?.rows ?? [],
    activePreset = chosenPreset(state);
  const all = useMemo(() => catalog(state), [state.importedArtists]);
  const pool = useMemo(
    () => members(state),
    [state.poolId, state.pools, state.favorites, state.importedArtists],
  );
  const effective = useMemo(
    () => candidates(state),
    [
      state.poolId,
      state.pools,
      state.favorites,
      state.excluded,
      state.importedArtists,
    ],
  );
  const feasible = useMemo(
    () => feasibility(s, effective, rows),
    [s, effective, rows],
  );
  const visible = (allLibrary ? all : pool).filter((a) =>
    [a.tag, a.displayName, ...(a.aliases ?? [])].some((t) =>
      t.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  let out = { artists: "", quality: "", combined: "" },
    outputError = "";
  try {
    out = outputs(rows, activePreset, s);
  } catch (e) {
    outputError = (e as Error).message;
  }
  const stale =
    !!state.result &&
    (state.result.generatedConfig !== configKey(s) ||
      rows.some((r) => !effective.some((a) => a.id === r.artist.id)));
  useEffect(() => {
    if (!canSave) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError("");
    } catch (e) {
      setStorageError(
        `无法保存到浏览器：${(e as Error).message}。当前更改仅保留在本次会话，请导出完整备份。`,
      );
    }
  }, [state, canSave]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  const change = (patch: Partial<Settings>, resetPreset = false) => {
    setState((v) => ({
      ...v,
      settings: { ...v.settings, ...patch },
      ...(resetPreset ? { restoredPreset: undefined } : {}),
    }));
    setActionError("");
  };
  const favorite = (id: string) =>
    setState((v) => ({ ...v, favorites: toggle(v.favorites, id) }));
  const selectPool = (id: string) => {
    setState((v) => ({ ...v, poolId: id }));
    setSelection([]);
    setActionError("");
  };
  const act = (fn: (seed: string) => Row[]) => {
    try {
      const seed = s.seed.trim() || newSeed(),
        next = fn(seed);
      setState((v) => withResult(v, next, seed));
      setActionError("");
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    }
  };
  const doRoll = () => {
    if (act((seed) => roll(s, effective, rows, seed)) && tab === "config")
      setTab("prompt");
  };
  const startColResize = (side: "left" | "right", startX: number) => {
    const initialLeft = leftWidth,
      initialRight = rightWidth;
    const wsWidth = workspaceRef.current?.clientWidth ?? 1360;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      if (side === "left") {
        const maxLeft = Math.min(480, Math.max(270, wsWidth - initialRight - 360));
        setLeftWidth(Math.max(270, Math.min(maxLeft, Math.round(initialLeft + dx))));
      } else {
        const maxRight = Math.min(500, Math.max(290, wsWidth - initialLeft - 360));
        setRightWidth(Math.max(290, Math.min(maxRight, Math.round(initialRight - dx))));
      }
    };
    const onUp = () => {
      document.body.classList.remove("resizing-col");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.classList.add("resizing-col");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const startPromptResize = (startY: number) => {
    const startH =
      promptHeight ??
      promptWrapRef.current?.offsetHeight ??
      280;
    const onMove = (e: MouseEvent) => {
      const next = Math.max(
        100,
        Math.min(760, Math.round(startH + (e.clientY - startY))),
      );
      setPromptHeight(next);
    };
    const onUp = () => {
      document.body.classList.remove("resizing-row");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.classList.add("resizing-row");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const saveCurrent = (favorite = false) => {
    if (!state.result) return;
    try {
      const h = resultRecord(state, state.result, favorite);
      setState((v) => ({ ...v, history: [h, ...v.history].slice(0, 50) }));
      setNotice(favorite ? "当前结果已加入收藏" : "当前结果已加入历史");
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const copy = async (text: string) => {
    if (await copyTextToClipboard(text)) {
      setNotice("已复制");
      return;
    }
    setCopyText(text);
    setModal("copy");
  };
  const download = (
    name: string,
    content: string,
    type = "text/plain;charset=utf-8",
  ) => {
    const file = { name, content, type };
    const alternative = canShareTextFile(file)
      ? "可以使用下方的保存 / 分享或复制文本。"
      : "可以复制下方的完整文本，按所示文件名保存。";
    setExportFile(file);
    setExportStatus(
      requestDownload(name, content, type)
        ? `已请求下载，请检查浏览器的下载列表。${alternative}`
        : `当前浏览器未能发起下载。${alternative}`,
    );
    setActionError("");
    setModal("export");
  };
  const addToPool = (id: string) => {
    if (!selection.length) return;
    if (id === "favorites")
      setState((v) => ({
        ...v,
        favorites: [...new Set([...v.favorites, ...selection])],
      }));
    else
      setState((v) => ({
        ...v,
        pools: v.pools.map((p) =>
          p.id === id
            ? { ...p, members: [...new Set([...p.members, ...selection])] }
            : p,
        ),
      }));
    setNotice(`已加入 ${selection.length} 位画师`);
    setSelection([]);
    setModal(null);
  };
  const createPool = (copyCurrent = false) => {
    if (!poolName.trim()) {
      setActionError("请输入画师池名称");
      return;
    }
    const id = "pool:" + newSeed();
    setState((v) => ({
      ...v,
      poolId: id,
      pools: [
        ...v.pools,
        {
          id,
          name: poolName.trim(),
          members: copyCurrent ? pool.map((a) => a.id) : [],
        },
      ],
    }));
    setPoolName("");
    setNotice(copyCurrent ? "已复制画师池" : "已新建空池");
    setActionError("");
  };
  const resetSourceForm = (tpl = SOURCE_TEMPLATES[0]) => {
    setEditingSourceId(null);
    setSrcName(tpl.name);
    setSrcUrl(tpl.url);
    setSrcParser(tpl.parser);
    setSrcSelector(tpl.selector);
    setSrcPageStart(String(tpl.pageStart));
    setSrcPageCount(String(tpl.pageCount));
    setSrcReplaceUnderscores(tpl.replaceUnderscores);
    setManualRawText("");
    setActionError("");
  };
  const loadSourceForEdit = (src: ArtistSource) => {
    setEditingSourceId(src.id);
    setSrcName(src.name);
    setSrcUrl(src.url);
    setSrcParser(src.parser);
    setSrcSelector(src.selector);
    setSrcPageStart(String(src.pageStart));
    setSrcPageCount(String(src.pageCount));
    setSrcReplaceUnderscores(src.replaceUnderscores);
    setManualRawText("");
    setActionError("");
  };
  const buildSourceDraft = (): ArtistSource => {
    const name = srcName.trim();
    if (!name) throw new Error("请输入拉取源名称");
    const url = srcUrl.trim();
    if (!safeSourceUrl(url))
      throw new Error("请输入以 http:// 或 https:// 开头的有效网址");
    if (
      (srcParser === "html-selector" || srcParser === "text-regex") &&
      !srcSelector.trim()
    ) {
      throw new Error(
        srcParser === "html-selector"
          ? "请输入 CSS 选择器"
          : "请输入正则表达式",
      );
    }
    const pageStart = Math.max(1, Math.min(999, Math.round(+srcPageStart || 1)));
    const pageCount = Math.max(1, Math.min(10, Math.round(+srcPageCount || 1)));
    const existing = editingSourceId
      ? state.sources.find((x) => x.id === editingSourceId)
      : undefined;
    const id = existing?.id ?? `src:${newSeed()}`;
    const poolId = existing?.poolId ?? `pool:${id}`;
    return {
      id,
      name,
      url,
      parser: srcParser,
      selector: srcSelector.trim(),
      pageStart,
      pageCount,
      replaceUnderscores: srcReplaceUnderscores,
      poolId,
      lastFetchedAt: existing?.lastFetchedAt ?? null,
      lastCount: existing?.lastCount ?? 0,
      lastError: null,
    };
  };
  const commitSourceResult = (
    src: ArtistSource,
    extracted: Artist[],
    append: boolean,
  ) => {
    const now = new Date().toISOString();
    let finalCount = 0;
    setState((v) => {
      const existingCatalog = catalog(v);
      const merged = mergeArtists(extracted, existingCatalog);
      const oldPool = v.pools.find((p) => p.id === src.poolId);
      const nextMembers =
        append && oldPool
          ? [...new Set([...oldPool.members, ...merged.members])]
          : merged.members;
      finalCount = nextMembers.length;
      const nextPools = oldPool
        ? v.pools.map((p) =>
            p.id === src.poolId
              ? { ...p, name: src.name, members: nextMembers }
              : p,
          )
        : [...v.pools, { id: src.poolId, name: src.name, members: nextMembers }];
      const updatedSrc: ArtistSource = {
        ...src,
        lastFetchedAt: now,
        lastCount: extracted.length,
        lastError: null,
      };
      const hasSrc = v.sources.some((x) => x.id === src.id);
      return {
        ...v,
        importedArtists: [...v.importedArtists, ...merged.added],
        pools: nextPools,
        sources: hasSrc
          ? v.sources.map((x) => (x.id === src.id ? updatedSrc : x))
          : [...v.sources, updatedSrc],
        poolId: src.poolId,
      };
    });
    setNotice(`已从“${src.name}”提取 ${extracted.length} 位画师（池内共 ${finalCount} 位）`);
    setActionError("");
  };
  const saveSourceOnly = () => {
    try {
      const draft = buildSourceDraft();
      setState((v) => {
        const hasPool = v.pools.some((p) => p.id === draft.poolId);
        const hasSrc = v.sources.some((x) => x.id === draft.id);
        return {
          ...v,
          pools: hasPool
            ? v.pools.map((p) =>
                p.id === draft.poolId ? { ...p, name: draft.name } : p,
              )
            : [...v.pools, { id: draft.poolId, name: draft.name, members: [] }],
          sources: hasSrc
            ? v.sources.map((x) => (x.id === draft.id ? draft : x))
            : [...v.sources, draft],
        };
      });
      setEditingSourceId(draft.id);
      setActionError("");
      setNotice(`已更新拉取源“${draft.name}”`);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const runPullSource = async (
    src: ArtistSource,
    busyKey: string,
    append: boolean,
  ) => {
    setSrcBusyId(busyKey);
    setSrcProgress("准备拉取…");
    setActionError("");
    try {
      const extracted = await fetchSourceArtists(src, setSrcProgress);
      commitSourceResult(src, extracted, append);
      setEditingSourceId(src.id);
    } catch (e) {
      const msg = (e as Error).message;
      setActionError(msg);
      setState((v) => {
        const hasPool = v.pools.some((p) => p.id === src.poolId);
        const hasSrc = v.sources.some((x) => x.id === src.id);
        const failedSrc: ArtistSource = { ...src, lastError: msg };
        return {
          ...v,
          pools: hasPool
            ? v.pools.map((p) =>
                p.id === src.poolId ? { ...p, name: src.name } : p,
              )
            : [...v.pools, { id: src.poolId, name: src.name, members: [] }],
          sources: hasSrc
            ? v.sources.map((x) => (x.id === src.id ? failedSrc : x))
            : [...v.sources, failedSrc],
        };
      });
    } finally {
      setSrcBusyId(null);
      setSrcProgress("");
    }
  };
  const saveAndPullSource = async () => {
    try {
      const draft = buildSourceDraft();
      await runPullSource(draft, "form", srcAppend);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const extractFromManualPaste = () => {
    try {
      const draft = buildSourceDraft();
      const extracted = extractArtistsFromText(manualRawText, {
        url: draft.url,
        parser: draft.parser,
        selector: draft.selector,
        replaceUnderscores: draft.replaceUnderscores,
      });
      commitSourceResult(draft, extracted, srcAppend);
      setManualRawText("");
      setEditingSourceId(draft.id);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const deleteSource = (src: ArtistSource) => {
    if (
      !window.confirm(
        `删除拉取源“${src.name}”及其关联画师池？历史记录和画师库不会删除。`,
      )
    )
      return;
    setState((v) => ({
      ...v,
      sources: v.sources.filter((x) => x.id !== src.id),
      pools: v.pools.filter((p) => p.id !== src.poolId),
      poolId: v.poolId === src.poolId ? "top1000" : v.poolId,
    }));
    if (editingSourceId === src.id) resetSourceForm();
    setNotice(`已删除拉取源“${src.name}”`);
  };
  const openPreset = () => {
    try {
      setPresetDraft(renderPreset(activePreset, s));
      setPresetName(activePreset?.name ?? "自建预设");
      setActionError("");
      setModal("preset");
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const savePreset = (asNew: boolean) => {
    try {
      const id =
          asNew || !activePreset ? "custom:" + newSeed() : activePreset.id,
        parsed = parsePresetText(
          presetDraft,
          id,
          presetName,
          !!activePreset?.core,
        ),
        p = parsed.preset;
      setState((v) => ({
        ...v,
        restoredPreset: undefined,
        settings: {
          ...v.settings,
          ...(parsed.intensity
            ? { intensity: parsed.intensity, face: parsed.face! }
            : {}),
          ...(id.startsWith("custom:")
            ? { style: "custom", customPresetId: id }
            : {}),
        },
        customPresets: id.startsWith("custom:")
          ? [...v.customPresets.filter((x) => x.id !== id), p]
          : v.customPresets,
        presetEdits: id.startsWith("custom:")
          ? v.presetEdits
          : { ...v.presetEdits, [id]: p },
      }));
      setModal(null);
      setActionError("");
      setNotice("预设已应用");
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const exportBackup = () =>
    download(
      "NAI5-完整备份.json",
      JSON.stringify({ ...state, catalogSnapshot: builtin }, null, 2),
      "application/json",
    );
  const readFile = async (file: File | undefined, backup: boolean) => {
    if (!file) return;
    try {
      const text = await file.text();
      if (backup) {
        setPendingBackup(validateBackup(JSON.parse(text), builtin));
        setActionError("");
        return;
      }
      const incoming = importArtists(
          text,
          file.name.toLowerCase().endsWith(".csv"),
        ),
        merged = mergeArtists(incoming, all),
        id = "pool:" + newSeed();
      setState((v) => ({
        ...v,
        importedArtists: [...v.importedArtists, ...merged.added],
        pools: [
          ...v.pools,
          {
            id,
            name: poolName.trim() || file.name.replace(/\.(json|csv)$/i, ""),
            members: merged.members,
          },
        ],
        poolId: id,
      }));
      setNotice(`已导入 ${merged.members.length} 位画师，新建画师池`);
      setActionError("");
      setModal(null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const currentCustom = state.pools.find((p) => p.id === state.poolId);
  const sourcePoolIds = useMemo(
    () => new Set(state.sources.map((x) => x.poolId)),
    [state.sources],
  );
  const activeSource = state.sources.find((x) => x.poolId === state.poolId);
  const manualPools = state.pools.filter((p) => !sourcePoolIds.has(p.id));
  const currentPoolLabel =
    state.poolId === "top100"
      ? "前100"
      : state.poolId === "top300"
        ? "前300"
        : state.poolId === "top1000"
          ? "前1000"
          : state.poolId === "favorites"
            ? "个人收藏"
            : (currentCustom?.name ?? "画师池");
  const tieredTotalPreview = useMemo(() => {
    const vals = [s.tierCounts.main, s.tierCounts.support, s.tierCounts.accent];
    if (vals.every((v) => /^\d+$/.test(v.trim())))
      return vals.reduce((acc, v) => acc + +v.trim(), 0);
    return null;
  }, [s.tierCounts]);
  const exactSplitPreview = useMemo(() => {
    if (s.mode !== "tiered" || s.countMode !== "exact") return null;
    if (!/^\d+$/.test(s.exact.trim()) || +s.exact.trim() < 1) return null;
    return roleCounts(+s.exact.trim());
  }, [s.mode, s.countMode, s.exact]);
  const error = actionError || outputError || feasible.error;

  return (
    <div className="workbench">
      <header className="topbar">
        <h1>NAI5 画师串</h1>
        <nav aria-label="工具">
          <button
            className="icon-button"
            aria-label="数据来源"
            title="数据来源"
            onClick={() => setModal("source")}
          >
            <Database size={22} />
          </button>
          <button
            className="icon-button"
            aria-label="备份 / 导入"
            title="备份 / 导入"
            onClick={() => setModal("backup")}
          >
            <Archive size={22} />
          </button>
          <button
            className="icon-button"
            aria-label="高级"
            title="高级：种子与细分范围"
            onClick={() => setModal("advanced")}
          >
            <SlidersHorizontal size={22} />
          </button>
          <button
            className="icon-button"
            aria-label="帮助"
            title="帮助"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={22} />
          </button>
          {typeof __NAI5_PWA__ !== "undefined" && __NAI5_PWA__ && (
            <WebAppTools />
          )}
        </nav>
      </header>
      {storageError && (
        <div className="alert" role="alert">
          {storageError}
          <button
            onClick={() =>
              loaded.raw !== null
                ? download("NAI5-原始存档.txt", loaded.raw)
                : exportBackup()
            }
          >
            {loaded.raw !== null ? "导出原存档" : "导出当前备份"}
          </button>
          {!canSave && (
            <button onClick={() => setCanSave(true)}>启用新存档</button>
          )}
        </div>
      )}
      <div className="mobile-tabs">
        <Segments
          label="工作区"
          value={tab}
          options={[
            ["config", "池与参数"],
            ["prompt", "画师串"],
            ["result", "抽取结果"],
          ]}
          onChange={setTab}
        />
      </div>
      <main
        ref={workspaceRef}
        className="workspace"
        style={
          {
            "--left-w": `${leftWidth}px`,
            "--right-w": `${rightWidth}px`,
          } as CSSProperties
        }
      >
        <div
          className={`left-column ${tab === "config" ? "mobile-active" : ""}`}
        >
        <section
          className={`panel pool-panel ${poolExpanded ? "expanded" : "collapsed"}`}
          aria-label="画师池面板"
        >
          <div className="panel-heading">
            <div className="heading-with-meta">
              <h2>画师池</h2>
              <span className="pool-badge" title={`${currentPoolLabel} · 可用 ${effective.length} / ${pool.length}`}>
                {currentPoolLabel} · {effective.length}/{pool.length}
              </span>
            </div>
            <div className="panel-heading-actions">
              {activeSource && (
                <button
                  className="icon-button"
                  aria-label={`刷新拉取源 ${activeSource.name}`}
                  title={`立即重新拉取：${activeSource.name}`}
                  disabled={srcBusyId !== null}
                  onClick={() => void runPullSource(activeSource, activeSource.id, false)}
                >
                  <RefreshCw
                    size={18}
                    className={srcBusyId === activeSource.id ? "spin" : ""}
                  />
                </button>
              )}
              <button
                className="icon-button"
                aria-label="新建或管理拉取源"
                title="拉取源：从网站/API读取画师 tag"
                onClick={() => {
                  setActionError("");
                  setModal("remoteSources");
                }}
              >
                <CloudDownload size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="画师池管理"
                title="画师池管理：新建、重命名、复制、删除"
                onClick={() => {
                  setPoolName(currentCustom?.name ?? "");
                  setModal("manage");
                }}
              >
                <Settings2 size={19} />
              </button>
            </div>
          </div>
          <div className="pool-switch">
            <Segments
              label="内置画师池"
              value={state.poolId}
              options={[
                ["top100", "前100"],
                ["top300", "前300"],
                ["top1000", "前1000"],
              ]}
              onChange={selectPool}
            />
            <div className="pool-select-row">
              <select
                aria-label="收藏或自建画师池"
                value={
                  ["top100", "top300", "top1000"].includes(state.poolId)
                    ? ""
                    : state.poolId
                }
                onChange={(e) => e.target.value && selectPool(e.target.value)}
              >
                <option value="" disabled>
                  收藏 / 拉取源 / 自建池
                </option>
                <option value="favorites">
                  个人收藏 · {state.favorites.length}
                </option>
                {state.sources.length > 0 && (
                  <optgroup label="网站拉取源">
                    {state.sources.map((src) => {
                      const p = state.pools.find((x) => x.id === src.poolId);
                      return (
                        <option key={src.poolId} value={src.poolId}>
                          [源] {src.name} · {p?.members.length ?? 0}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {manualPools.length > 0 && (
                  <optgroup label="自建画师池">
                    {manualPools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.members.length}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                className={`pool-expand-btn ${poolExpanded ? "selected" : ""}`}
                aria-expanded={poolExpanded}
                onClick={() => setPoolExpanded((v) => !v)}
              >
                {poolExpanded ? (
                  <>
                    收起 <ChevronUp size={15} />
                  </>
                ) : (
                  <>
                    列表 <ChevronDown size={15} />
                  </>
                )}
              </button>
            </div>
          </div>
          {!provenance.complete && (
            <button
              className="source-warning"
              onClick={() => setModal("source")}
            >
              数据未齐：{builtin.length} / 1000　查看原因
            </button>
          )}
          {poolExpanded && (
            <div className="pool-drawer">
          <div className="search-row">
            <Search aria-hidden="true" size={17} strokeWidth={2.6} />
            <input
              aria-label="搜索画师"
              placeholder="搜索 tag / 别名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="清空搜索"
              onClick={() => setSearch("")}
            >
              <X size={16} />
            </button>
          </div>
          <div className="list-meta">
            <label>
              <input
                type="checkbox"
                checked={allLibrary}
                onChange={(e) => setAllLibrary(e.target.checked)}
              />
              全库
            </label>
            <span>
              可用 {effective.length} / {pool.length}
            </span>
            <button
              className="text-button"
              onClick={() => setSelection(visible.map((a) => a.id))}
            >
              全选所见
            </button>
          </div>
          <div className="artist-list" role="group" aria-label="候选画师列表">
            {visible.map((a) => (
              <div
                key={a.id}
                className={`artist-item ${selection.includes(a.id) ? "checked" : ""} ${state.excluded.includes(a.id) ? "excluded" : ""}`}
              >
                <label>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${a.tag}`}
                    checked={selection.includes(a.id)}
                    onChange={() => setSelection((v) => toggle(v, a.id))}
                  />
                  <span title={[a.tag, ...(a.aliases ?? [])].join(" / ")}>
                    {a.tag}
                  </span>
                </label>
                <span className="rank">
                  {a.sourceRank ? String(a.sourceRank).padStart(3, "0") : "—"}
                </span>
                <button
                  className={`star ${state.favorites.includes(a.id) ? "on" : ""}`}
                  aria-label={`${state.favorites.includes(a.id) ? "取消收藏" : "收藏"} ${a.tag}`}
                  onClick={() => favorite(a.id)}
                >
                  <Star size={15} />
                </button>
              </div>
            ))}
            {!visible.length && (
              <div className="empty">
                {search ? "没有匹配画师" : "此画师池为空"}
                <button onClick={() => setAllLibrary(true)}>浏览全库</button>
              </div>
            )}
          </div>
          <div className="pool-actions">
            <div className="selection-line">
              <span>已选 {selection.length}</span>
              <button
                className="text-button"
                disabled={!selection.length}
                onClick={() => setSelection([])}
              >
                清除
              </button>
            </div>
            <div className="button-grid">
              <button
                disabled={!selection.length}
                onClick={() => {
                  setTargetPool(state.pools[0]?.id ?? "favorites");
                  setModal("add");
                }}
              >
                加入池
              </button>
              <button
                disabled={
                  !selection.length ||
                  (!currentCustom && state.poolId !== "favorites")
                }
                onClick={() => {
                  setState((v) => ({
                    ...v,
                    ...(v.poolId === "favorites"
                      ? {
                          favorites: v.favorites.filter(
                            (id) => !selection.includes(id),
                          ),
                        }
                      : {
                          pools: v.pools.map((p) =>
                            p.id === v.poolId
                              ? {
                                  ...p,
                                  members: p.members.filter(
                                    (id) => !selection.includes(id),
                                  ),
                                }
                              : p,
                          ),
                        }),
                  }));
                  setSelection([]);
                }}
              >
                移出池
              </button>
              <button
                disabled={!selection.length}
                onClick={() => {
                  setState((v) => ({
                    ...v,
                    excluded: [...new Set([...v.excluded, ...selection])],
                  }));
                  setSelection([]);
                }}
              >
                全局排除
              </button>
              <button
                disabled={!selection.length}
                onClick={() => {
                  setState((v) => ({
                    ...v,
                    excluded: v.excluded.filter(
                      (id) => !selection.includes(id),
                    ),
                  }));
                  setSelection([]);
                }}
              >
                取消排除
              </button>
            </div>
          </div>
            </div>
          )}
        </section>
        <section
          className="panel settings-panel"
          aria-label="参数面板"
        >
          <div className="panel-heading">
            <h2>参数与预设</h2>
            <button
              className="icon-button"
              aria-label="细分设置"
              title="细分设置"
              onClick={() => setModal("advanced")}
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
          <div className="settings-scroll">
            <section className="setting-section">
              <div className="setting-title">
                <h3>画师数量</h3>
                <Segments
                  label="数量模式"
                  value={s.countMode}
                  options={[
                    ["exact", "精确"],
                    ["range", "范围"],
                    ["tiered", "分层"],
                  ]}
                  onChange={(countMode) =>
                    change(
                      countMode === "tiered"
                        ? { countMode, mode: "tiered" }
                        : { countMode },
                    )
                  }
                />
              </div>
              {s.countMode === "exact" ? (
                <>
                  <Stepper
                    label="精确人数"
                    value={s.exact}
                    min={1}
                    onChange={(exact) => change({ exact })}
                  />
                  {exactSplitPreview && (
                    <div className="split-hint">
                      自动分层：主 {exactSplitPreview.main} / 辅{" "}
                      {exactSplitPreview.support} / 点缀{" "}
                      {exactSplitPreview.accent}
                    </div>
                  )}
                </>
              ) : s.countMode === "tiered" ? (
                <div className="tier-counts">
                  {(["main", "support", "accent"] as const).map((t) => (
                    <div className="setting-row tier-count-row" key={t}>
                      <span className={`tier-label ${t}`}>
                        {tierLabels[t]}
                      </span>
                      <Stepper
                        label={`${tierLabels[t]}画师数量`}
                        value={s.tierCounts[t]}
                        min={0}
                        onChange={(val) =>
                          change({
                            tierCounts: { ...s.tierCounts, [t]: val },
                          })
                        }
                      />
                    </div>
                  ))}
                  <div className="split-hint">
                    合计：{tieredTotalPreview !== null ? `${tieredTotalPreview} 位` : "—"}
                  </div>
                </div>
              ) : (
                <div className="count-range">
                  <Stepper
                    label="最少人数"
                    value={s.countMin}
                    min={1}
                    onChange={(countMin) => change({ countMin })}
                  />
                  <span>至</span>
                  <Stepper
                    label="最多人数"
                    value={s.countMax}
                    min={1}
                    onChange={(countMax) => change({ countMax })}
                  />
                </div>
              )}
            </section>
            <section className="setting-section">
              <h3>权重模式</h3>
              <Segments
                label="权重模式"
                value={s.mode}
                options={[
                  ["tiered", "主次分层"],
                  ["free", "自由随机"],
                ]}
                onChange={(mode) => {
                  if (mode === "free" && s.countMode === "tiered") {
                    const fallback =
                      tieredTotalPreview && tieredTotalPreview >= 1
                        ? String(tieredTotalPreview)
                        : "5";
                    change({ mode, countMode: "exact", exact: fallback });
                  } else {
                    change({ mode });
                  }
                }}
              />
              {s.mode === "tiered" ? (
                <div className="tier-ranges">
                  {(["main", "support", "accent"] as const).map((t) => (
                    <div className="setting-row" key={t}>
                      <span className={`tier-label ${t}`}>{tierLabels[t]}</span>
                      <RangeFields
                        label={`${tierLabels[t]}画师权重`}
                        value={s.tiered.ranges[t]}
                        onChange={(r) =>
                          change({
                            tiered: {
                              ...s.tiered,
                              ranges: { ...s.tiered.ranges, [t]: r },
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="setting-row">
                  <span>共同范围</span>
                  <RangeFields
                    label="自由权重"
                    value={s.free.range}
                    onChange={(range) => change({ free: { ...s.free, range } })}
                  />
                </div>
              )}
            </section>
            <section className="setting-section">
              <div className="setting-title">
                <h3>画师总权重</h3>
                {s.mode === "tiered" && s.tiered.total.mode === "auto" && (
                  <span className="muted">按人数计算</span>
                )}
              </div>
              <TotalControls
                s={s}
                onChange={(total) =>
                  change(
                    s.mode === "tiered"
                      ? { tiered: { ...s.tiered, total } }
                      : { free: { ...s.free, total } },
                  )
                }
              />
              {feasible.partial && feasible.plans.length > 0 && (
                <p className="constraint-note">
                  可抽数量：{feasible.plans.map((p) => p.n).join("、")}
                </p>
              )}
            </section>
            <section className="setting-section preset-section">
              <div className="setting-title">
                <h3>质量预设</h3>
                <button className="text-button" onClick={openPreset}>
                  编辑
                </button>
              </div>
              <Segments
                label="预设风格"
                value={s.style}
                options={[
                  ["regular", "常规"],
                  ["paint", "手绘厚涂"],
                  ["depth", "2.5D精致"],
                ]}
                onChange={(style) => change({ style }, true)}
              />
              <Segments
                label="预设长度"
                value={s.length}
                options={[
                  ["short", "短"],
                  ["medium", "中"],
                  ["long", "长"],
                ]}
                onChange={(length) => change({ length }, true)}
              />
              <div className="preset-extra">
                <button
                  aria-pressed={s.style === "off"}
                  className={s.style === "off" ? "selected" : ""}
                  onClick={() => change({ style: "off" }, true)}
                >
                  关闭预设
                </button>
                <select
                  aria-label="自建预设"
                  value={s.style === "custom" ? s.customPresetId : ""}
                  onChange={(e) =>
                    change(
                      { style: "custom", customPresetId: e.target.value },
                      true,
                    )
                  }
                >
                  <option value="" disabled>
                    自建预设
                  </option>
                  {state.customPresets.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {activePreset?.core && (
                <div className="core-controls">
                  <div className="setting-row">
                    <label htmlFor="depth-range">3D 强度</label>
                    <input
                      id="depth-range"
                      aria-label="3D 强度滑块"
                      type="range"
                      min="0.20"
                      max="0.80"
                      step="0.01"
                      value={s.intensity}
                      onChange={(e) =>
                        change({ intensity: (+e.target.value).toFixed(2) })
                      }
                    />
                    <input
                      aria-label="3D 强度"
                      className="small-number"
                      inputMode="decimal"
                      value={s.intensity}
                      onChange={(e) => change({ intensity: e.target.value })}
                    />
                  </div>
                  <div className="setting-row">
                    <label htmlFor="face-range">脸部抑制</label>
                    <input
                      id="face-range"
                      aria-label="脸部抑制滑块"
                      type="range"
                      min="-1.50"
                      max="-0.30"
                      step="0.01"
                      value={s.face}
                      onChange={(e) =>
                        change({ face: (+e.target.value).toFixed(2) })
                      }
                    />
                    <input
                      aria-label="3D 脸抑制"
                      className="small-number"
                      inputMode="decimal"
                      value={s.face}
                      onChange={(e) => change({ face: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
        </div>
        <div
          className="col-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左侧栏与画师串宽度"
          title="拖拽调整宽度，双击恢复默认"
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            startColResize("left", e.clientX);
          }}
          onDoubleClick={() => {
            setLeftWidth(324);
            setRightWidth(356);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setLeftWidth((w) => Math.max(270, w - 16));
            if (e.key === "ArrowRight") setLeftWidth((w) => Math.min(480, w + 16));
            if (e.key === "Home") setLeftWidth(324);
          }}
        />
        <section
          className={`panel prompt-panel ${tab === "prompt" ? "mobile-active" : ""}`}
          aria-label="画师串输出面板"
        >
          <div className="panel-heading">
            <h2>画师串</h2>
            <span className="prompt-meta">
              {outputTab === "artists"
                ? `仅画师 · ${out.artists.length} 字`
                : `画师＋预设 · ${out.combined.length} 字`}
            </span>
          </div>
          <div className="prompt-toolbar">
            <Segments
              label="输出预览"
              value={outputTab}
              options={[
                ["artists", "画师串"],
                ["combined", "画师＋预设"],
              ]}
              onChange={setOutputTab}
            />
            <div className="output-options">
              <label>
                <input
                  type="checkbox"
                  checked={s.prefix}
                  onChange={(e) => change({ prefix: e.target.checked })}
                />
                artist:
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.yearEnabled}
                  onChange={(e) => change({ yearEnabled: e.target.checked })}
                />
                年份
              </label>
              {s.yearEnabled && (
                <input
                  aria-label="年份词"
                  inputMode="numeric"
                  className="year-input"
                  value={s.year}
                  onChange={(e) => change({ year: e.target.value })}
                />
              )}
            </div>
          </div>
          <div className="prompt-stage">
            <div
              ref={promptWrapRef}
              className={`prompt-resize-wrap ${promptHeight !== null ? "custom-height" : ""}`}
              style={
                promptHeight !== null
                  ? { height: `${promptHeight}px` }
                  : undefined
              }
            >
              <textarea
                aria-label="提示词输出"
                readOnly
                value={out[outputTab]}
                onFocus={(e) => e.target.select()}
                spellCheck={false}
              />
            </div>
            <div
              className="prompt-drag-handle"
              role="separator"
              aria-orientation="horizontal"
              aria-label="上下拉伸画师串输入框"
              title="拖拽上下拉伸画师串高度，双击恢复自适应"
              onMouseDown={(e) => {
                e.preventDefault();
                startPromptResize(e.clientY);
              }}
              onDoubleClick={() => setPromptHeight(null)}
            >
              <span className="grip-dots" aria-hidden="true" />
            </div>
          </div>
          <div className="main-actions center-actions">
            <div className="seed-row">
              <span className="muted">
                {activePreset?.name ?? "预设已关闭"}
              </span>
              <div className="seed-line" title={state.result?.seed}>
                种子 {state.result?.seed ?? "—"}
              </div>
            </div>
            <button
              className="roll"
              disabled={!feasible.plans.length || !!outputError}
              onClick={doRoll}
            >
              ROLL <span>重新调配</span>
            </button>
            <div className="copy-actions">
              <button
                disabled={!out.artists}
                onClick={() => copy(out.artists)}
              >
                复制画师串
              </button>
              <button
                disabled={!out.combined || !!outputError}
                onClick={() => copy(out.combined)}
              >
                复制画师＋预设
              </button>
            </div>
          </div>
        </section>
        <div
          className="col-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整画师串与抽取结果宽度"
          title="拖拽调整宽度，双击恢复默认"
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            startColResize("right", e.clientX);
          }}
          onDoubleClick={() => {
            setLeftWidth(324);
            setRightWidth(356);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setRightWidth((w) => Math.min(500, w + 16));
            if (e.key === "ArrowRight") setRightWidth((w) => Math.max(290, w - 16));
            if (e.key === "Home") setRightWidth(356);
          }}
        />
        <section
          className={`panel result-panel ${tab === "result" ? "mobile-active" : ""}`}
          aria-label="抽取结果面板"
        >
          <div className="panel-heading">
            <h2>抽取结果</h2>
            <span className="result-totals">
              <b>{rows.length}</b> 位　总权重{" "}
              <b data-testid="weight-sum">{formatWeight(sumWeights(rows))}</b>
            </span>
          </div>
          <div className="result-tools">
            <button
              onClick={() =>
                act((seed) => rerollWeights(s, effective, rows, seed))
              }
            >
              重掷权重
            </button>
            <button
              disabled={
                s.mode === "free" ||
                !rows.some((r) => r.tier === "support" && r.lock === "none")
              }
              onClick={() =>
                act((seed) =>
                  replaceRows(
                    s,
                    effective,
                    rows,
                    rows
                      .filter((r) => r.tier === "support")
                      .map((r) => r.artist.id),
                    seed,
                  ),
                )
              }
            >
              只换辅助
            </button>
            <button
              disabled={
                s.mode === "free" ||
                !rows.some((r) => r.tier === "accent" && r.lock === "none")
              }
              onClick={() =>
                act((seed) =>
                  replaceRows(
                    s,
                    effective,
                    rows,
                    rows
                      .filter((r) => r.tier === "accent")
                      .map((r) => r.artist.id),
                    seed,
                  ),
                )
              }
            >
              只换点缀
            </button>
          </div>
          {stale && (
            <div className="pending-note">
              设置已变更，当前仍为上次结果；ROLL 后应用。
            </div>
          )}
          <div className="result-table" role="table" aria-label="画师结果">
            <div className="result-header" role="row">
              <span>层级</span>
              <span>画师</span>
              <span>权重</span>
              <span>锁</span>
              <span>换</span>
              <span>藏</span>
            </div>
            <div className="result-rows">
              {rows.map((r) => (
                <div
                  className={`result-row ${r.tier}`}
                  role="row"
                  key={r.artist.id}
                  data-testid="result-row"
                >
                  <button
                    className={`role-cell ${r.tier}`}
                    title={
                      r.tier === "main"
                        ? "主画师"
                        : s.mode === "tiered"
                          ? "设为主画师"
                          : "自由模式"
                    }
                    aria-label={`${r.artist.tag} ${r.tier === "main" ? "主画师" : "设为主画师"}`}
                    disabled={s.mode === "free"}
                    onClick={() =>
                      act((seed) =>
                        setMain(s, effective, rows, r.artist.id, seed),
                      )
                    }
                  >
                    {tierLabels[r.tier]}
                  </button>
                  <div className="name-cell">
                    <a
                      href={safeSourceUrl(r.artist.sourceUrl)}
                      target="_blank"
                      rel="noreferrer"
                      title="到来源页面查看样图"
                    >
                      {r.artist.tag}
                    </a>
                  </div>
                  <WeightInput
                    row={r}
                    onApply={(v) =>
                      act((seed) =>
                        editWeight(s, effective, rows, r.artist.id, v, seed),
                      )
                    }
                  />
                  <button
                    className={`lock-cell ${r.lock !== "none" ? "locked" : ""}`}
                    aria-label={`${r.artist.tag} 锁定：${r.lock === "none" ? "未锁" : r.lock === "artist" ? "锁画师" : "锁权重"}`}
                    title="依次切换：未锁 → 锁画师 → 锁权重"
                    onClick={() =>
                      setState((v) => ({
                        ...v,
                        result: v.result
                          ? {
                              ...v.result,
                              rows: v.result.rows.map((x) =>
                                x.artist.id === r.artist.id
                                  ? {
                                      ...x,
                                      lock:
                                        x.lock === "none"
                                          ? "artist"
                                          : x.lock === "artist"
                                            ? "weight"
                                            : "none",
                                    }
                                  : x,
                              ),
                            }
                          : null,
                      }))
                    }
                  >
                    {r.lock === "none" ? (
                      <LockOpen size={16} />
                    ) : (
                      <>
                        <Lock size={15} />
                        <span>{r.lock === "artist" ? "人" : "重"}</span>
                      </>
                    )}
                  </button>
                  <button
                    className="replace-cell"
                    aria-label={`替换 ${r.artist.tag}`}
                    title="替换此画师"
                    disabled={r.lock !== "none"}
                    onClick={() =>
                      act((seed) =>
                        replaceRows(s, effective, rows, [r.artist.id], seed),
                      )
                    }
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    className={`star favorite-cell ${state.favorites.includes(r.artist.id) ? "on" : ""}`}
                    aria-label={`${state.favorites.includes(r.artist.id) ? "取消收藏" : "收藏"}结果 ${r.artist.tag}`}
                    onClick={() => favorite(r.artist.id)}
                  >
                    <Star size={17} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="result-summary">
            <span>
              {s.mode === "tiered"
                ? `主 ${rows.filter((r) => r.tier === "main").length} / 辅 ${rows.filter((r) => r.tier === "support").length} / 点缀 ${rows.filter((r) => r.tier === "accent").length}`
                : "自由权重"}
            </span>
            <button className="text-button" onClick={() => saveCurrent(true)}>
              <Star size={14} /> 收藏结果
            </button>
          </div>
          <details className="history">
            <summary>
              历史记录 <span>{state.history.length} / 50</span>
            </summary>
            <div className="history-controls">
              <label>
                <input
                  type="checkbox"
                  checked={historyFavoriteOnly}
                  onChange={(e) => setHistoryFavoriteOnly(e.target.checked)}
                />
                仅收藏
              </label>
              <button onClick={() => saveCurrent()}>保存当前</button>
            </div>
            <div className="history-list">
              {state.history
                .filter((h) => !historyFavoriteOnly || h.favorite)
                .map((h) => (
                  <div className="history-row" key={h.id}>
                    <button
                      className={h.favorite ? "star on" : "star"}
                      aria-label={`${h.favorite ? "取消收藏" : "收藏"}历史 ${h.id}`}
                      onClick={() =>
                        setState((v) => ({
                          ...v,
                          history: v.history.map((x) =>
                            x.id === h.id ? { ...x, favorite: !x.favorite } : x,
                          ),
                        }))
                      }
                    >
                      <Star size={15} />
                    </button>
                    <button
                      className="history-restore"
                      title={h.combinedText}
                      onClick={() => {
                        setState((v) => restoreHistory(v, h));
                        setActionError("");
                        setNotice("已原样恢复历史结果");
                      }}
                    >
                      <span>
                        {h.result.rows.map((r) => r.artist.tag).join(" / ")}
                      </span>
                      <small>
                        {new Date(h.createdAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {h.result.rows.length} 位 ·{" "}
                        {formatWeight(sumWeights(h.result.rows))} ·{" "}
                        {h.preset?.name ?? "无预设"}
                      </small>
                    </button>
                  </div>
                ))}
            </div>
          </details>
        </section>
      </main>
      <div
        className={`status-line ${error ? "error" : ""}`}
        role={error ? "alert" : "status"}
      >
        {error ||
          notice ||
          `${activePreset?.name ?? "预设已关闭"}${canSave && !storageError ? " · 已保存到本机" : " · 仅当前会话"}`}
      </div>
      <div className="mobile-bottom-bar" aria-label="快捷操作">
        <button
          className="roll"
          disabled={!feasible.plans.length || !!outputError}
          onClick={doRoll}
        >
          ROLL
        </button>
        <div className="copy-actions">
          <button disabled={!out.artists} onClick={() => copy(out.artists)}>
            复制画师串
          </button>
          <button
            disabled={!out.combined || !!outputError}
            onClick={() => copy(out.combined)}
          >
            复制画师＋预设
          </button>
        </div>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {modal && (
        <Modal
          title={
            {
              advanced: "高级设置",
              source: "数据来源",
              remoteSources: "画师拉取源",
              help: "使用帮助",
              manage: "画师池管理",
              backup: "备份与导入",
              preset: "编辑质量预设",
              copy: "复制提示词",
              export: "导出文件",
              add: "加入画师池",
            }[modal]
          }
          onClose={() => {
            setModal(null);
            setPendingBackup(null);
            setActionError("");
          }}
        >
          {actionError && (
            <p className="alert" role="alert">
              {actionError}
            </p>
          )}
          {modal === "advanced" && (
            <>
              <section className="modal-section">
                <h3>随机种子</h3>
                <input
                  className="wide"
                  aria-label="随机种子"
                  value={s.seed}
                  placeholder="留空，每次生成新种子"
                  onChange={(e) => change({ seed: e.target.value })}
                />
                <p>
                  同一数据版本、有效池、参数、锁定状态和种子可复现。当前结果种子：
                  <code>{state.result?.seed}</code>
                </p>
                <button
                  onClick={() => change({ seed: state.result?.seed ?? "" })}
                >
                  使用当前种子
                </button>
                <button onClick={() => change({ seed: "" })}>
                  恢复自动种子
                </button>
              </section>
              <section className="modal-section">
                <h3>主次模式全局范围</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={s.tiered.globalEnabled}
                    onChange={(e) =>
                      change({
                        tiered: {
                          ...s.tiered,
                          globalEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  启用，与各层范围取交集
                </label>
                <RangeFields
                  label="全局权重"
                  value={s.tiered.global}
                  onChange={(global) =>
                    change({ tiered: { ...s.tiered, global } })
                  }
                />
              </section>
              <section className="modal-section">
                <h3>当前可行数量与总和</h3>
                {feasible.error ? (
                  <p className="alert">{feasible.error}</p>
                ) : (
                  <div className="feasible-list">
                    {feasible.plans.slice(0, 100).map((p) => (
                      <div key={p.n}>
                        {p.n} 人　{formatWeight(p.min)}–{formatWeight(p.max)}
                        {s.mode === "tiered" && p.autoTarget !== null
                          ? `　自动 ${formatWeight(p.autoTarget)}`
                          : ""}
                      </div>
                    ))}
                    {feasible.plans.length > 100 && (
                      <p>
                        其余 {feasible.plans.length - 100} 个可行人数未展开。
                      </p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
          {modal === "source" && (
            <>
              <dl className="source-details">
                <dt>榜单</dt>
                <dd>V5 收藏前1000 · TAGs 第三方榜单</dd>
                <dt>实际内置</dt>
                <dd>{builtin.length} 位 / 目标 1000 位</dd>
                <dt>采集开始（UTC）</dt>
                <dd>{provenance.collectionStartedAt}</dd>
                <dt>采集结束（UTC）</dt>
                <dd>{provenance.collectionEndedAt}</dd>
                <dt>数据版本</dt>
                <dd>{provenance.version}</dd>
                <dt>排序</dt>
                <dd>V5 候选集，FAVS 降序；同票保留源站顺序。</dd>
              </dl>
              {!provenance.complete && (
                <p className="alert">
                  来源采集未完成，当前保留 {builtin.length} 条真实结果。原因：{provenance.limitation}
                </p>
              )}
              <p>
                FAVS = 站内收藏数；POSTS = Danbooru 投稿数；SCORE = Danbooru
                单张最高分。未取得字段记为 null。v5_gallery_sample 表示观察到第三方 V5
                样图；v5_gallery_listing 表示在 V5 候选榜中，但卡片显示其他模型或没有样图。
                两种记录都不代表官方训练名单。
              </p>
              {provenance.listingOnlyCount > 0 && <p>本次 {provenance.listingOnlyCount} 条仅有 V5 榜单归属证据；保留源站名次，未用其他榜单补位。实际缩略图模型与链接另存于数据文件。</p>}
              <p>
                <a href={provenance.sourceUrl} target="_blank" rel="noreferrer">
                  打开 V5 收藏榜与画师样图
                </a>
              </p>
              <details>
                <summary>逐页来源</summary>
                {provenance.pages.map((p) => (
                  <p key={p.page}>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      第 {p.page} 页 · {p.rowCount} 条
                    </a>
                    　{p.fetchedAt}
                  </p>
                ))}
              </details>
              <div className="dialog-actions">
                <button
                  onClick={() =>
                    download(
                      "artists.v5.top1000.json",
                      JSON.stringify(builtin, null, 2),
                      "application/json",
                    )
                  }
                >
                  数据 JSON
                </button>
                <button
                  onClick={() =>
                    download(
                      "artists.v5.top1000.csv",
                      artistsCsv(builtin),
                      "text/csv",
                    )
                  }
                >
                  数据 CSV
                </button>
                <button
                  onClick={() =>
                    download(
                      "source.json",
                      JSON.stringify(provenance, null, 2),
                      "application/json",
                    )
                  }
                >
                  来源记录
                </button>
              </div>
            </>
          )}
          {modal === "help" && (
            <>
              <h3>先选池，再 ROLL</h3>
              <p>
                搜索只过滤列表。抽取来自当前池减去全局排除名单，等概率、无放回；收藏数与输出权重不影响抽中概率。内置榜单池只读，可在管理中复制为自建池。
              </p>
              <h3>锁定与调整</h3>
              <p>
                锁定按钮依次切换：未锁 → 锁人 →
                锁重。锁人保留身份和层级，锁重再保留权重。点击“辅 /
                点缀”层级可与主画师交换；交换前需解锁双方。
              </p>
              <p>
                “换”保持该行权重；“只换辅助 /
                点缀”保持全部位置权重和主画师；“重掷权重”保持全部身份。手动权重在失焦或回车后应用，必要时重分配其他未锁定权重。
              </p>
              <h3>总和只算画师</h3>
              <p>
                主次模式：主 1 位，辅助 ceil((N−1)/3)，其余点缀。自动总和 = 0.95
                + 0.50×辅助 + 0.20×点缀，5 人为
                2.35。范围数量先筛可行人数，再等概率选取。
              </p>
              <h3>预设与正向输出</h3>
              <p>
                3d 与负权重 3d face
                都放在正向提示词；不参与画师总和。切换风格、长度、参数、前缀或年份不会重抽画师。高级输入接受推荐滑块区间之外的合法正
                / 负值。
              </p>
              <p>
                NovelAI 的 Add Quality Tags
                会另外追加词。要单独比较本工具预设，可按需关闭它。
              </p>
              <p>
                <a
                  href="https://docs.novelai.net/en/image/strengthening-weakening/"
                  target="_blank"
                  rel="noreferrer"
                >
                  官方数字加权语法
                </a>{" "}
                ·{" "}
                <a
                  href="https://docs.novelai.net/en/image/qualitytags/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Add Quality Tags
                </a>
              </p>
              <h3>保存</h3>
              <p>
                浏览器允许本地存储时，会自动保留最近 50
                次结果。历史包含当时的完整预设、实际画师、权重、种子与数据版本；恢复不重抽。切换预设后可用“保存当前”另存。存储失败时更改仅保留在本次会话。重要结果请导出完整备份，清理浏览器数据会删除本地存档。
              </p>
            </>
          )}
          {modal === "remoteSources" && (
            <>
              {state.sources.length > 0 && (
                <section className="modal-section">
                  <h3>已配置拉取源 · {state.sources.length}</h3>
                  <div className="remote-source-list">
                    {state.sources.map((src) => {
                      const linkedPool = state.pools.find(
                        (p) => p.id === src.poolId,
                      );
                      const isBusy = srcBusyId === src.id;
                      return (
                        <div className="remote-source-card" key={src.id}>
                          <div className="remote-source-head">
                            <strong>{src.name}</strong>
                            <span className="muted">
                              {linkedPool?.members.length ?? 0} 位
                              {src.lastFetchedAt
                                ? ` · ${new Date(src.lastFetchedAt).toLocaleString("zh-CN", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                                : " · 未拉取"}
                            </span>
                          </div>
                          <div className="remote-source-url" title={src.url}>
                            {src.url}
                          </div>
                          {src.lastError && (
                            <div className="remote-source-err">
                              上次错误：{src.lastError}
                            </div>
                          )}
                          <div className="remote-source-actions">
                            <button
                              disabled={srcBusyId !== null}
                              onClick={() =>
                                void runPullSource(src, src.id, srcAppend)
                              }
                            >
                              {isBusy ? "拉取中…" : "立即拉取"}
                            </button>
                            <button
                              disabled={!linkedPool?.members.length}
                              onClick={() => {
                                selectPool(src.poolId);
                                setModal(null);
                              }}
                            >
                              选用此池
                            </button>
                            <button
                              disabled={srcBusyId !== null}
                              onClick={() => loadSourceForEdit(src)}
                            >
                              编辑
                            </button>
                            <button
                              disabled={srcBusyId !== null}
                              onClick={() => deleteSource(src)}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              <section className="modal-section">
                <h3>{editingSourceId ? "编辑拉取源" : "新建拉取源"}</h3>
                <div className="template-chips" role="group" aria-label="快捷网站模板">
                  {SOURCE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={srcUrl === tpl.url && tpl.url ? "selected" : ""}
                      onClick={() => resetSourceForm(tpl)}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
                <p className="muted">
                  {SOURCE_TEMPLATES.find((t) => t.url && t.url === srcUrl)?.hint ??
                    (typeof __NAI5_BROWSER_ONLY__ !== "undefined" &&
                    __NAI5_BROWSER_ONLY__
                      ? "支持公开数据源；含 {page} 时可连续拉取多页。跨域受限时可导入文件或粘贴内容提取。"
                      : "填写网站/API 地址；含 {page} 时支持连续拉取多页。网页访问需要数据源允许跨域；也可导入文件或粘贴内容提取。")}
                </p>
                <label className="form-label">
                  源名称（同时作为生成的画师池名）
                  <input
                    className="wide"
                    aria-label="拉取源名称"
                    value={srcName}
                    onChange={(e) => setSrcName(e.target.value)}
                    placeholder="例如：Danbooru 热门画师"
                  />
                </label>
                <label className="form-label">
                  目标网址（URL，可用 {"{page}"} 代表页码）
                  <input
                    className="wide"
                    aria-label="拉取源网址"
                    value={srcUrl}
                    onChange={(e) => setSrcUrl(e.target.value)}
                    placeholder="https://danbooru.donmai.us/tags.json?search[category]=1&..."
                  />
                </label>
                <label className="form-label">
                  解析方式
                  <select
                    className="wide"
                    aria-label="拉取源解析方式"
                    value={srcParser}
                    onChange={(e) =>
                      setSrcParser(e.target.value as SourceParserMode)
                    }
                  >
                    {PARSER_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {(srcParser === "html-selector" ||
                  srcParser === "text-regex") && (
                  <label className="form-label">
                    {srcParser === "html-selector"
                      ? "CSS 选择器（例如 a[href*=\"/artist/\"] 或 .artist-name）"
                      : "正则表达式（优先取第 1 个捕获组，例如 artist:([a-z0-9_() -]+)）"}
                    <input
                      className="wide"
                      aria-label="选择器或正则"
                      value={srcSelector}
                      onChange={(e) => setSrcSelector(e.target.value)}
                      placeholder={
                        srcParser === "html-selector"
                          ? 'a[href*="/artist/"]'
                          : "artist:([a-z0-9_() -]+)"
                      }
                    />
                  </label>
                )}
                {srcUrl.includes("{page}") && (
                  <div className="source-page-row">
                    <label className="form-label">
                      起始页
                      <input
                        type="number"
                        min={1}
                        max={999}
                        aria-label="拉取起始页"
                        value={srcPageStart}
                        onChange={(e) => setSrcPageStart(e.target.value)}
                      />
                    </label>
                    <label className="form-label">
                      拉取页数（1–10）
                      <input
                        type="number"
                        min={1}
                        max={10}
                        aria-label="拉取页数"
                        value={srcPageCount}
                        onChange={(e) => setSrcPageCount(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                <div className="source-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={srcReplaceUnderscores}
                      onChange={(e) =>
                        setSrcReplaceUnderscores(e.target.checked)
                      }
                    />
                    下划线 _ 转空格（适配 NAI5）
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={srcAppend}
                      onChange={(e) => setSrcAppend(e.target.checked)}
                    />
                    追加合并到已有池（不勾则覆盖）
                  </label>
                </div>
                {srcProgress && (
                  <p className="muted" role="status">
                    {srcProgress}
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    className="selected"
                    disabled={srcBusyId !== null}
                    onClick={() => void saveAndPullSource()}
                  >
                    {srcBusyId === "form" ? "拉取中…" : "保存并立即拉取"}
                  </button>
                  <button
                    disabled={srcBusyId !== null}
                    onClick={saveSourceOnly}
                  >
                    仅保存源
                  </button>
                  {editingSourceId && (
                    <button
                      disabled={srcBusyId !== null}
                      onClick={() => resetSourceForm()}
                    >
                      新建其他源
                    </button>
                  )}
                </div>
              </section>
              <details className="manual-extract-box">
                <summary>目标站点有验证页 / 登录限制？粘贴网页源码或文本直接提取</summary>
                <textarea
                  className="preset-editor manual-paste-area"
                  aria-label="粘贴网页源码或文本"
                  value={manualRawText}
                  onChange={(e) => setManualRawText(e.target.value)}
                  placeholder="把浏览器里复制的网页 HTML、JSON、CSV 或画师清单粘贴到这里，按上方解析方式提取并写入该源对应的画师池…"
                  spellCheck={false}
                />
                <div className="dialog-actions">
                  <button
                    disabled={!manualRawText.trim()}
                    onClick={extractFromManualPaste}
                  >
                    从粘贴内容提取并保存
                  </button>
                </div>
              </details>
            </>
          )}
          {modal === "manage" && (
            <>
              <label className="form-label">
                当前画师池
                <select
                  className="wide"
                  aria-label="管理当前池"
                  value={state.poolId}
                  onChange={(e) => selectPool(e.target.value)}
                >
                  <option value="top100">前100</option>
                  <option value="top300">前300</option>
                  <option value="top1000">前1000</option>
                  <option value="favorites">个人收藏</option>
                  {state.pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                画师池名称
                <input
                  aria-label="画师池名称"
                  className="wide"
                  value={poolName}
                  onChange={(e) => setPoolName(e.target.value)}
                  placeholder="例如：我的厚涂池"
                />
              </label>
              <div className="dialog-actions">
                <button onClick={() => createPool()}>新建空池</button>
                <button onClick={() => createPool(true)}>复制当前池</button>
                <button
                  disabled={!currentCustom}
                  onClick={() => {
                    if (!poolName.trim()) {
                      setActionError("请输入名称");
                      return;
                    }
                    setState((v) => ({
                      ...v,
                      pools: v.pools.map((p) =>
                        p.id === v.poolId ? { ...p, name: poolName.trim() } : p,
                      ),
                    }));
                    setNotice("已重命名");
                  }}
                >
                  重命名
                </button>
                <button
                  disabled={!currentCustom}
                  onClick={() => {
                    if (
                      window.confirm(
                        `删除自建池“${currentCustom?.name}”？画师与历史不会删除。`,
                      )
                    ) {
                      setState((v) => ({
                        ...v,
                        pools: v.pools.filter((p) => p.id !== v.poolId),
                        sources: v.sources.filter(
                          (src) => src.poolId !== v.poolId,
                        ),
                        poolId: "top1000",
                      }));
                      setPoolName("");
                    }
                  }}
                >
                  删除池
                </button>
                <button
                  onClick={() => {
                    setActionError("");
                    setModal("remoteSources");
                  }}
                >
                  管理网站拉取源
                </button>
              </div>
              <p>
                {pool.length} 位成员，{effective.length}{" "}
                位可用。创建后到主列表切换“全库”，勾选画师并点“加入池”。
              </p>
              <h3>全局排除 · {state.excluded.length}</h3>
              <div className="excluded-list">
                {all
                  .filter((a) => state.excluded.includes(a.id))
                  .map((a) => (
                    <div key={a.id}>
                      <span>{a.tag}</span>
                      <button
                        onClick={() =>
                          setState((v) => ({
                            ...v,
                            excluded: v.excluded.filter((id) => id !== a.id),
                          }))
                        }
                      >
                        恢复
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
          {modal === "add" && (
            <>
              <p>将选中的 {selection.length} 位画师加入：</p>
              <select
                className="wide"
                aria-label="加入目标池"
                value={targetPool}
                onChange={(e) => setTargetPool(e.target.value)}
              >
                <option value="favorites">个人收藏</option>
                {state.pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="dialog-actions">
                <button onClick={() => addToPool(targetPool)}>确认加入</button>
                <button
                  onClick={() => {
                    setPoolName("");
                    setModal("manage");
                  }}
                >
                  新建池
                </button>
              </div>
            </>
          )}
          {modal === "backup" && (
            <>
              <section className="modal-section">
                <h3>完整备份</h3>
                <p>
                  包含参数、自建池、收藏、排除、自建预设、当前结果与最近 50
                  条历史，格式版本 1。
                </p>
                <button onClick={exportBackup}>导出完整 JSON 备份</button>
                <label className="file-button">
                  读取备份
                  <input
                    aria-label="读取完整备份"
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void readFile(file, true);
                    }}
                  />
                </label>
                {pendingBackup && (
                  <div className="import-preview">
                    <p>
                      已验证：{pendingBackup.pools.length} 个自建池，
                      {pendingBackup.history.length}{" "}
                      条历史。恢复会替换本机配置。
                    </p>
                    <button
                      onClick={() => {
                        setBackupUndo(state);
                        setState(pendingBackup);
                        setCanSave(true);
                        setPendingBackup(null);
                        setNotice("完整备份已恢复");
                      }}
                    >
                      恢复此备份
                    </button>
                  </div>
                )}
                {backupUndo && (
                  <button
                    onClick={() => {
                      setState(backupUndo);
                      setBackupUndo(null);
                      setNotice("已撤销本次恢复");
                    }}
                  >
                    撤销本次恢复
                  </button>
                )}
              </section>
              <section className="modal-section">
                <h3>导入画师池</h3>
                <p>
                  JSON 数组或含 artists 数组的对象；CSV 至少有 tag 表头。可选
                  id、displayName、aliases（JSON
                  数组）、sourceRank、favorites、postCount、topScore、sourceUrl、modelEvidence。未知来源不标记为
                  V5。
                </p>
                <label className="form-label">
                  导入池名称
                  <input
                    className="wide"
                    aria-label="导入池名称"
                    value={poolName}
                    onChange={(e) => setPoolName(e.target.value)}
                    placeholder="留空使用文件名"
                  />
                </label>
                <label className="file-button">
                  选择 JSON / CSV
                  <input
                    aria-label="导入画师文件"
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void readFile(file, false);
                    }}
                  />
                </label>
              </section>
              <section className="modal-section">
                <h3>导出当前池 · {pool.length} 位</h3>
                <button
                  onClick={() =>
                    download(
                      "NAI5-画师池.json",
                      JSON.stringify(
                        { formatVersion: 1, artists: pool },
                        null,
                        2,
                      ),
                      "application/json",
                    )
                  }
                >
                  导出池 JSON
                </button>
                <button
                  onClick={() =>
                    download("NAI5-画师池.csv", artistsCsv(pool), "text/csv")
                  }
                >
                  导出池 CSV
                </button>
              </section>
            </>
          )}
          {modal === "preset" && (
            <>
              <label className="form-label">
                名称
                <input
                  className="wide"
                  aria-label="预设名称"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </label>
              <textarea
                className="preset-editor"
                aria-label="预设正文"
                value={presetDraft}
                onChange={(e) => setPresetDraft(e.target.value)}
                spellCheck={false}
              />
              <p>
                保留词序和加权结构。修改 3d / 3d face
                数字会同步到独立控件；每个核心词只保留一组。
              </p>
              <div className="dialog-actions">
                <button onClick={() => savePreset(false)}>保存编辑</button>
                <button onClick={() => savePreset(true)}>另存为自建</button>
                <button
                  disabled={
                    !activePreset ||
                    !defaultPresets.some((p) => p.id === activePreset.id)
                  }
                  onClick={() => {
                    const p = defaultPresets.find(
                      (p) => p.id === activePreset?.id,
                    )!;
                    setState((v) => {
                      const edits = { ...v.presetEdits };
                      delete edits[p.id];
                      return {
                        ...v,
                        presetEdits: edits,
                        restoredPreset: undefined,
                      };
                    });
                    setPresetDraft(renderPreset(p, s));
                    setPresetName(p.name);
                    setNotice("已恢复默认正文");
                  }}
                >
                  恢复默认正文
                </button>
                {s.style === "custom" && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm("删除此自建预设？历史中的预设仍保留。")
                      ) {
                        setState((v) => ({
                          ...v,
                          customPresets: v.customPresets.filter(
                            (p) => p.id !== s.customPresetId,
                          ),
                          settings: {
                            ...v.settings,
                            style: "depth",
                            customPresetId: "",
                          },
                          restoredPreset: undefined,
                        }));
                        setModal(null);
                      }
                    }}
                  >
                    删除自建预设
                  </button>
                )}
              </div>
            </>
          )}
          {modal === "export" && exportFile && (
            <>
              <p className="export-filename">{exportFile.name}</p>
              <p role="status">{exportStatus}</p>
              <div className="dialog-actions export-actions">
                <button
                  onClick={() =>
                    download(exportFile.name, exportFile.content, exportFile.type)
                  }
                >
                  再次下载
                </button>
                {canShareTextFile(exportFile) && (
                  <button
                    disabled={shareBusy}
                    onClick={async () => {
                      setShareBusy(true);
                      const result = await shareTextFile(exportFile);
                      setShareBusy(false);
                      setExportStatus({
                        shared: "系统分享已完成；保存位置以你在分享面板中的选择为准。",
                        cancelled: "已取消分享。文件内容仍在下方，可以再次下载或复制。",
                        unavailable: "此浏览器暂不支持分享这个文件，请下载或复制下方文本。",
                        failed: "系统分享未完成，请再次尝试，或下载、复制下方文本。",
                      }[result]);
                    }}
                  >
                    {shareBusy ? "正在分享…" : "保存 / 分享"}
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (await copyTextToClipboard(exportFile.content)) {
                      setExportStatus("已复制全部文件内容。");
                    } else {
                      exportTextRef.current?.focus();
                      exportTextRef.current?.select();
                      setExportStatus("剪贴板不可用。请长按下方文本，选择全选并复制。保存时使用上方文件名。");
                    }
                  }}
                >
                  复制全部文本
                </button>
              </div>
              <label className="form-label export-text-label">
                文件内容（可全选复制）
                <textarea
                  ref={exportTextRef}
                  aria-label="导出文件内容"
                  className="export-text"
                  readOnly
                  value={exportFile.content}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            </>
          )}
          {modal === "copy" && (
            <>
              <p>剪贴板不可用。选中文本后复制，或下载为文本文件。</p>
              <textarea
                aria-label="可选复制文本"
                className="preset-editor"
                readOnly
                value={copyText}
                onFocus={(e) => e.target.select()}
              />
              <button onClick={() => download("NAI5-提示词.txt", copyText)}>
                下载提示词.txt
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
