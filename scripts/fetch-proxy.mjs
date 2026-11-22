import net from "node:net";
import dns from "node:dns/promises";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip === "::" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (net.isIP(v4) !== 4) return false;
  const parts = v4.split(".").map(Number);
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertPublicHttpUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("网址格式无效，请输入完整的 http:// 或 https:// 地址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http 或 https 网址");
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("禁止访问本机或内网地址");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("禁止访问本机或私有网络地址");
    return parsed;
  }
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.some((r) => isPrivateIp(r.address))) {
      throw new Error("目标域名解析到内网地址，已拒绝");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("拒绝")) throw err;
  }
  return parsed;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

export async function handleProxyFetch(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
    return;
  }
  const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
  const targetRaw = reqUrl.searchParams.get("url") || "";
  let targetUrl;
  try {
    targetUrl = await assertPublicHttpUrl(targetRaw);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : "网址无效" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "NAI5-Artist-Roller/1.1 (+https://github.com/kinoshitari/NAI5-Artist-Roller)",
        Accept: "application/json, application/xml, text/xml, text/html, text/plain, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
      },
    });
    if (response.url) {
      await assertPublicHttpUrl(response.url);
    }
    const reader = response.body?.getReader();
    const chunks = [];
    let total = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          controller.abort();
          sendJson(res, 413, { ok: false, error: "响应体积超过 5 MB 上限" });
          return;
        }
        chunks.push(value);
      }
    }
    const body = Buffer.concat(chunks).toString("utf-8");
    sendJson(res, 200, {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url || targetUrl.toString(),
      contentType: response.headers.get("content-type") || "",
      cfMitigated: response.headers.get("cf-mitigated") || "",
      body,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    sendJson(res, isAbort ? 504 : 502, {
      ok: false,
      error: isAbort
        ? "拉取超时（15 秒），请检查网络或目标站点可用性"
        : `拉取失败：${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    clearTimeout(timer);
  }
}
