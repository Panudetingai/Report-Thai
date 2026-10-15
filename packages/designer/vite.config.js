import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: dir,
  resolve: {
    alias: {
      "@thaireport/client": path.join(dir, "../client/src/index.js"),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [path.join(dir, ".."), path.join(dir, "../..")] },
  },
  optimizeDeps: {
    exclude: ["@thaireport/client"],
  },
});
