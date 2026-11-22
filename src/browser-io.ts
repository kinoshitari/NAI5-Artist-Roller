export interface TextFile {
  name: string;
  content: string;
  type: string;
}

/** Return true only when a clipboard API reports success. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Local files and permission restrictions may need the selection fallback.
  }
  if (typeof document === "undefined") return false;
  const previousFocus = document.activeElement as HTMLElement | null;
  let field: HTMLTextAreaElement | undefined;
  try {
    field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px";
    // A modal makes the rest of the page inert, so select within it when open.
    (document.querySelector("dialog[open]") ?? document.body).appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field?.remove();
    try {
      previousFocus?.focus({ preventScroll: true });
    } catch {
      // The previous element may have been removed while copying.
    }
  }
}

/** A true result means a download was requested, not that a file was saved. */
export function requestTextDownload(file: TextFile): boolean {
  let url: string | undefined;
  let link: HTMLAnchorElement | undefined;
  try {
    if (
      typeof document === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) return false;
    link = document.createElement("a");
    if (!("download" in link)) return false;
    url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
    link.href = url;
    link.download = file.name;
    link.hidden = true;
    (document.querySelector("dialog[open]") ?? document.body).appendChild(link);
    link.click();
    const downloadUrl = url;
    // Mobile browsers may consume the blob after the click handler returns.
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    return true;
  } catch {
    if (url) URL.revokeObjectURL(url);
    return false;
  } finally {
    link?.remove();
  }
}

function fileShareData(file: TextFile): ShareData | undefined {
  try {
    if (
      typeof navigator === "undefined" ||
      typeof File === "undefined" ||
      !navigator.share ||
      !navigator.canShare
    ) return;
    const data = {
      files: [new File([file.content], file.name, { type: file.type })],
      title: file.name,
    };
    if (navigator.canShare({ files: data.files })) return data;
  } catch {
    // Some browsers expose Web Share but cannot share this file type.
  }
}

export function canShareTextFile(file: TextFile): boolean {
  return !!fileShareData(file);
}

export type FileShareResult = "shared" | "cancelled" | "unavailable" | "failed";

/** Call directly from a click handler to preserve the native share gesture. */
export async function shareTextFile(file: TextFile): Promise<FileShareResult> {
  const data = fileShareData(file);
  if (!data) return "unavailable";
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    return error instanceof Error && error.name === "AbortError"
      ? "cancelled"
      : "failed";
  }
}
