import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleProxyFetch } from "./scripts/fetch-proxy.mjs";

const nai5ProxyPlugin = () => ({
  name: "nai5-fetch-proxy",
  configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith("/__nai5_fetch")) {
        void handleProxyFetch(req, res);
        return;
      }
      next();
    });
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "pwa" ? [] : [nai5ProxyPlugin()])],
  base: "./",
  define: mode === "test" ? {} : {
    __NAI5_BROWSER_ONLY__: JSON.stringify(mode === "pwa"),
    __NAI5_PWA__: JSON.stringify(mode === "pwa"),
  },
  build: {
    target: ["safari15.4", "chrome100"],
    outDir: mode === "pwa" ? "dist-pwa" : "dist",
  },
  server: { strictPort: true },
}));
