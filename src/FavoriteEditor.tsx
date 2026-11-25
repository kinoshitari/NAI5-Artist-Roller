import { useRef, useState } from "react";
import { MAX_FAVORITE_NOTE, prepareReferenceImage } from "./favorite-reference";
import type { HistoryEntry } from "./types";

export function FavoriteEditor({
  entry,
  onSave,
}: {
  entry: HistoryEntry;
  onSave: (note: string, image: string | undefined) => void;
}) {
  const [note, setNote] = useState(entry.note ?? "");
  const [image, setImage] = useState(entry.referenceImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inProgress = useRef(false);
  const load = async (file: File) => {
    if (inProgress.current) return;
    inProgress.current = true;
    setBusy(true);
    setError("");
    try {
      setImage(await prepareReferenceImage(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inProgress.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.files).find((f) => f.type.startsWith("image/"))
          ?? Array.from(event.clipboardData.items).find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
        if (!file) return;
        event.preventDefault();
        void load(file);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSave(note.trim(), image);
      }}
    >
      <p className="favorite-artist-text">{entry.artistText}</p>
      <label className="form-label">
        备注
        <textarea autoFocus aria-label="备注" className="preset-editor" rows={4} maxLength={MAX_FAVORITE_NOTE}
          value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="form-label">
        参考图
        <input type="file" aria-label="参考图" disabled={busy} accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void load(file);
          }} />
      </label>
      <p>可粘贴剪贴板图片，或从相册选一张。保存的是压缩参考图，不是原图。</p>
      {image && (
        <div className="favorite-preview">
          <img src={image} alt="收藏参考图" />
          <button type="button" disabled={busy} onClick={() => { setImage(undefined); setError(""); }}>移除参考图</button>
        </div>
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="submit" disabled={busy}>{busy ? "处理图片中…" : "保存收藏备注"}</button>
      </div>
    </form>
  );
}
