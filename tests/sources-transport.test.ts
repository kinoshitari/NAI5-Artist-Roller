import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { fetchSourceArtists, fetchUrlText } from "../src/sources";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
  CapacitorHttp: { get: vi.fn() },
}));

const sourceUrl = "https://example.com/artists.json";
const mockFetch = vi.fn<typeof fetch>();

function location(url: string) {
  vi.stubGlobal("window", { location: new URL(url) });
}

function textResponse(body = '["anmi","freng"]', status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("__NAI5_BROWSER_ONLY__", false);
  location("https://kinoshitari.github.io/NAI5-Artist-Roller/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("网页、单文件和原生端的画师来源请求", () => {
  it.each([
    "https://kinoshitari.github.io/NAI5-Artist-Roller/",
    "file:///Downloads/NAI5-Artist-Roller-Offline.html",
    "content://downloads/NAI5-Artist-Roller-Offline.html",
    "http://192.168.1.10:8080/",
  ])("%s 直接读取公开数据源，不请求本地代理", async (url) => {
    location(url);
    mockFetch.mockResolvedValueOnce(textResponse());
    const document = await fetchUrlText(sourceUrl);
    expect(document.body).toBe('["anmi","freng"]');
    expect(document.finalUrl).toBe(sourceUrl);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(sourceUrl);
  });

  it("纯网页版在 localhost 预览时也不依赖代理", async () => {
    location("http://localhost:8080/");
    vi.stubGlobal("__NAI5_BROWSER_ONLY__", true);
    mockFetch.mockResolvedValueOnce(textResponse());
    await fetchUrlText(sourceUrl);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(sourceUrl);
  });

  it("保留桌面本地服务提供的代理和最终来源信息", async () => {
    location("http://127.0.0.1:4173/");
    mockFetch.mockResolvedValueOnce(textResponse(JSON.stringify({
      ok: true,
      status: 200,
      finalUrl: "https://example.com/latest.json",
      contentType: "application/json",
      body: '["anmi"]',
    })));
    expect(await fetchUrlText(sourceUrl)).toEqual({
      body: '["anmi"]',
      finalUrl: "https://example.com/latest.json",
      contentType: "application/json",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/^\/__nai5_fetch\?/);
  });

  it("其他本地服务器没有代理时回退到公开数据源", async () => {
    location("http://localhost:4173/");
    mockFetch.mockResolvedValueOnce(textResponse('{"message":"Not Found"}', 404));
    mockFetch.mockResolvedValueOnce(textResponse());
    expect((await fetchUrlText(sourceUrl)).body).toBe('["anmi","freng"]');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe(sourceUrl);
  });

  it("保留明确的本地代理错误，不隐藏错误再次拉取", async () => {
    location("http://127.0.0.1:4173/");
    mockFetch.mockResolvedValueOnce(textResponse(JSON.stringify({
      ok: false,
      error: "拉取超时（15 秒）",
    }), 504));
    await expect(fetchUrlText(sourceUrl)).rejects.toThrow("拉取超时");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("保留 APK 的原生 HTTP 通道", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(CapacitorHttp.get).mockResolvedValue({
      status: 200,
      data: ["anmi"],
      headers: { "content-type": "application/json" },
      url: sourceUrl,
    });
    expect((await fetchUrlText(sourceUrl)).body).toBe('["anmi"]');
    expect(CapacitorHttp.get).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("网络失败显示可操作的导入和粘贴替代方式", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Load failed"));
    await expect(fetchUrlText(sourceUrl)).rejects.toThrow(/检查网络.*跨域.*导入.*手动粘贴/);
  });

  it("HTTPS 下的 HTTP 数据源说明混合内容限制", async () => {
    await expect(fetchUrlText("http://example.com/artists.json")).rejects.toThrow("HTTPS 地址");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("保留上游 HTTP 错误和人机验证提示", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Unavailable", 503));
    await expect(fetchUrlText(sourceUrl)).rejects.toThrow("HTTP 503");
    mockFetch.mockResolvedValueOnce(textResponse("Cloudflare: verify you are human", 403));
    await expect(fetchUrlText(sourceUrl)).rejects.toThrow("人机验证");
  });

  it("请求超时中止网络请求，避免拉取按钮一直等待", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    mockFetch.mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    const result = expect(fetchUrlText(sourceUrl)).rejects.toThrow("拉取超时（15 秒）");
    await vi.advanceTimersByTimeAsync(15000);
    await result;
    expect(signal?.aborted).toBe(true);
  });

  it("超时也覆盖已经收到响应头、仍未完成的正文", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(async (_url, init) => ({
      text: () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    }) as Response);
    const result = expect(fetchUrlText(sourceUrl)).rejects.toThrow("拉取超时（15 秒）");
    await vi.advanceTimersByTimeAsync(15000);
    await result;
  });

  it("多页抓取中途失败不返回不完整的画师池", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce(textResponse('["anmi"]'));
    mockFetch.mockResolvedValueOnce(textResponse("Unavailable", 503));
    const source = {
      url: "https://example.com/artists?page={page}",
      parser: "auto" as const,
      selector: "",
      pageStart: 1,
      pageCount: 2,
      replaceUnderscores: false,
    };
    const result = expect(fetchSourceArtists(source)).rejects.toThrow("HTTP 503");
    await vi.advanceTimersByTimeAsync(350);
    await result;
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(source.pageCount).toBe(2);
  });
});
