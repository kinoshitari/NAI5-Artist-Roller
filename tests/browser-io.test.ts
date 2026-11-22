import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canShareTextFile,
  copyTextToClipboard,
  requestTextDownload,
  shareTextFile,
} from "../src/browser-io";

const backup = {
  name: "NAI5-完整备份.json",
  content: '{"画师池":["anmi"],"formatVersion":1}',
  type: "application/json",
};

function mockDocument() {
  const previousFocus = { focus: vi.fn() };
  const textarea = {
    value: "",
    readOnly: false,
    style: { cssText: "" },
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
    remove: vi.fn(),
  };
  const link = {
    href: "",
    download: "",
    hidden: false,
    click: vi.fn(),
    remove: vi.fn(),
  };
  const body = { appendChild: vi.fn() };
  const dialog = { appendChild: vi.fn() };
  const document = {
    activeElement: previousFocus,
    body,
    querySelector: vi.fn(() => dialog),
    createElement: vi.fn((tag: string) => tag === "a" ? link : textarea),
    execCommand: vi.fn(() => true),
  };
  vi.stubGlobal("document", document);
  return { document, previousFocus, textarea, link, body, dialog };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("浏览器剪贴板与手动复制回退", () => {
  it("剪贴板权限可用时直接复制完整文本", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyTextToClipboard(backup.content)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(backup.content);
  });

  it("剪贴板拒绝时，在当前弹窗内使用选区复制并恢复焦点", async () => {
    const dom = mockDocument();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    expect(await copyTextToClipboard(backup.content)).toBe(true);
    expect(dom.dialog.appendChild).toHaveBeenCalledWith(dom.textarea);
    expect(dom.body.appendChild).not.toHaveBeenCalled();
    expect(dom.textarea.value).toBe(backup.content);
    expect(dom.textarea.setSelectionRange).toHaveBeenCalledWith(0, backup.content.length);
    expect(dom.textarea.remove).toHaveBeenCalledOnce();
    expect(dom.previousFocus.focus).toHaveBeenCalledOnce();
  });

  it("本地文件环境中两种复制能力均不可用时返回手动回退并清理元素", async () => {
    const dom = mockDocument();
    vi.stubGlobal("navigator", {});
    dom.document.execCommand.mockImplementation(() => { throw new Error("Unavailable"); });
    expect(await copyTextToClipboard(backup.content)).toBe(false);
    expect(dom.textarea.remove).toHaveBeenCalledOnce();
    expect(dom.previousFocus.focus).toHaveBeenCalledOnce();
  });
});

describe("可下载的完整文件与系统分享", () => {
  it("请求下载保留文件名、内容和 MIME，等待浏览器消费 Blob 后释放", async () => {
    vi.useFakeTimers();
    const dom = mockDocument();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    expect(requestTextDownload(backup)).toBe(true);
    expect(dom.link.download).toBe(backup.name);
    expect(dom.link.click).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe(backup.type);
    expect(await blob.text()).toBe(backup.content);
    vi.advanceTimersByTime(1000);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:backup");
    expect(dom.link.remove).toHaveBeenCalledOnce();
  });

  it("浏览器无法发起下载时返回失败，不报告已保存并立即释放 Blob", () => {
    const dom = mockDocument();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    dom.link.click.mockImplementation(() => { throw new Error("Blocked"); });
    expect(requestTextDownload(backup)).toBe(false);
    expect(revoke).toHaveBeenCalledWith("blob:failed");
    expect(dom.link.remove).toHaveBeenCalledOnce();
  });

  it("没有 Blob 下载能力时返回可供界面显示手动回退的结果", () => {
    mockDocument();
    vi.stubGlobal("URL", {});
    expect(requestTextDownload(backup)).toBe(false);
  });

  it("能力检测通过后同步开启系统分享，保留 JSON 文件内容", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { canShare: vi.fn(() => true), share });
    expect(canShareTextFile(backup)).toBe(true);
    const result = shareTextFile(backup);
    // The share call must run before the handler loses its user activation.
    expect(share).toHaveBeenCalledOnce();
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.name).toBe(backup.name);
    expect(file.type).toBe(backup.type);
    expect(await file.text()).toBe(backup.content);
    expect(await result).toBe("shared");
  });

  it("取消分享单独返回 cancelled，保留用户重新下载或复制的选择", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")),
    });
    expect(await shareTextFile(backup)).toBe("cancelled");
  });

  it("支持网页分享但不支持文件分享时不发送空分享", async () => {
    const share = vi.fn();
    vi.stubGlobal("navigator", { canShare: () => false, share });
    expect(canShareTextFile(backup)).toBe(false);
    expect(await shareTextFile(backup)).toBe("unavailable");
    expect(share).not.toHaveBeenCalled();
  });
});
