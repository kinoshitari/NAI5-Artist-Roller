import { useEffect, useRef, useState } from "react";
import { Download, Globe, RefreshCw, X } from "lucide-react";
import "./pwa.css";

type OfflineState = "preparing" | "ready" | "unavailable";

function hasOfflineCopy(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(ready);
    };
    const timeout = setTimeout(() => finish(false), 8_000);
    channel.port1.onmessage = (event) => finish(event.data?.ready === true);
    try {
      worker.postMessage({ type: "OFFLINE_STATUS" }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

/** The standalone HTML and native app omit this hosted-web-only entry. */
export function WebAppTools() {
  const [open, setOpen] = useState(false);
  const [offlineState, setOfflineState] = useState<OfflineState>("preparing");
  const [online, setOnline] = useState(navigator.onLine);
  const [waiting, setWaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    let disposed = false;
    const updateConnection = () => setOnline(navigator.onLine);
    const onControllerChange = () => {
      if (updateRequested.current) location.reload();
    };
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const cleanup = () => {
      disposed = true;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
    if (!window.isSecureContext || !("serviceWorker" in navigator)) {
      setOfflineState("unavailable");
      return cleanup;
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    const refreshStatus = async (worker: ServiceWorker | null) => {
      if (!worker) return;
      const ready = await hasOfflineCopy(worker);
      if (!disposed) setOfflineState(ready ? "ready" : "unavailable");
    };
    void navigator.serviceWorker.register(new URL("./sw.js", document.baseURI), {
      scope: "./",
      updateViaCache: "none",
    }).then((reg) => {
      if (disposed) return;
      registration.current = reg;
      setWaiting(!!reg.waiting);
      if (reg.active) void refreshStatus(reg.active);
      const watchWorker = () => {
        if (disposed) return;
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (disposed) return;
          if (worker.state === "installed") setWaiting(!!reg.waiting && !!reg.active);
          if (worker.state === "redundant" && !reg.active) setOfflineState("unavailable");
          if (worker.state === "activated") void refreshStatus(worker);
        });
      };
      watchWorker();
      reg.addEventListener("updatefound", watchWorker);
      void navigator.serviceWorker.ready.then((readyReg) => {
        if (!disposed) void refreshStatus(readyReg.active);
      });
    }).catch(() => {
      if (!disposed) setOfflineState("unavailable");
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function checkForUpdate() {
    if (!registration.current) {
      setNotice("请联网后重新打开此网页，再准备离线内容。");
      return;
    }
    setChecking(true);
    setNotice("");
    try {
      await registration.current.update();
      setWaiting(!!registration.current.waiting);
      const active = registration.current.active;
      if (active) setOfflineState(await hasOfflineCopy(active) ? "ready" : "unavailable");
      setNotice(registration.current.installing ? "正在下载更新，完成后会显示更新按钮。" : "已检查更新。");
    } catch {
      setNotice("暂时无法检查更新，请确认网络后再试。已有离线内容仍可继续使用。");
    } finally {
      setChecking(false);
    }
  }

  function applyUpdate() {
    const worker = registration.current?.waiting;
    if (!worker) return;
    updateRequested.current = true;
    worker.postMessage({ type: "SKIP_WAITING" });
  }

  return <>
    <button className="icon-button" title="网页版与离线使用" onClick={() => setOpen(true)}>
      <Globe size={16} />网页版
    </button>
    {open && <dialog ref={dialog} className="modal web-app-dialog" aria-labelledby="web-app-title"
      onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
      <div className="modal-head">
        <h2 id="web-app-title">网页版</h2>
        <button aria-label="关闭弹窗" className="close" onClick={() => setOpen(false)}><X size={20} /></button>
      </div>
      <div className="modal-body">
        <section className="modal-section">
          <h3>离线使用</h3>
          <p className={`web-offline-status ${offlineState}`} role="status">
            {offlineState === "ready" ? "离线已就绪" : offlineState === "preparing" ? "正在准备离线内容…" : "离线内容尚未就绪"}
          </p>
          <p>{online ? "当前已联网。" : "当前未联网。"}首次联网打开后，等显示“离线已就绪”即可断网使用画师库、调配、预设和备份。在线拉取源仍需网络。</p>
          {offlineState === "unavailable" && <p>请使用 HTTPS 网页并允许网站存储，然后联网重新打开。</p>}
          <div className="dialog-actions">
            <button onClick={() => void checkForUpdate()} disabled={checking || !online}>
              <RefreshCw size={16} />{checking ? "正在检查…" : "检查更新"}
            </button>
            {waiting && <button onClick={applyUpdate}>更新并重新打开</button>}
          </div>
          {waiting && <p>新版已下载。更新会刷新网页；请先完成当前编辑，并按需导出备份。</p>}
          {notice && <p role="status">{notice}</p>}
        </section>
        <section className="modal-section">
          <h3>添加到主屏幕</h3>
          <p>iPhone / iPad：用 Safari 打开此网址，点“分享”→“添加到主屏幕”，如有“作为网页 App 打开”选项，请开启。</p>
          <p>安卓：在 Chrome 菜单中选择“安装应用”或“添加到主屏幕”。安装后先联网打开一次，并确认离线已就绪。</p>
          <p>设置保存在当前浏览器内。清理网站数据会移除设置和离线内容；重要内容请使用“备份 / 导入”导出。</p>
        </section>
        <section className="modal-section">
          <h3>独立 HTML</h3>
          <p>内含完整画师库和功能，可用支持本地 HTML 的浏览器打开。iPhone 请通过上方的 Safari 网页方式使用；“文件”里的预览无法保证运行交互功能。</p>
          <a className="web-download" href="./downloads/NAI5-Artist-Roller-Offline.html" download="NAI5-Artist-Roller-Offline.html">
            <Download size={16} />下载独立 HTML
          </a>
        </section>
      </div>
    </dialog>}
  </>;
}
