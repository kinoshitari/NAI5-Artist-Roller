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

export default defineConfig({
  plugins: [react(), nai5ProxyPlugin()],
  base: "./",
  server: { strictPort: true },
});
