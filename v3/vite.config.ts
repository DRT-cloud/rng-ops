import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { existsSync, statSync } from "node:fs";

const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.resolve(__dirname, "app");

// Build-time defense: rollupOptions below couples the build pipeline to
// the filesystem path src/sw.ts. If a future contributor moves the SW or
// breaks the entry config, the SW silently disappears from pb_public/
// and the app ships without offline plumbing. This plugin asserts the
// file exists and is non-empty after the bundle is written.
const swExistsAfterBuild: Plugin = {
  name: "rng-ops-sw-exists-assertion",
  apply: "build",
  closeBundle() {
    const swPath = path.resolve(repoRoot, "pb_public", "sw.js");
    if (!existsSync(swPath)) {
      throw new Error(
        `[rng-ops-sw-exists-assertion] expected ${swPath} to exist after build, but it does not. ` +
          `Check vite.config.ts build.rollupOptions for the sw entry, and src/sw.ts for compile errors.`,
      );
    }
    const size = statSync(swPath).size;
    if (size === 0) {
      throw new Error(
        `[rng-ops-sw-exists-assertion] ${swPath} exists but is zero bytes. ` +
          `The SW build emitted an empty file.`,
      );
    }
  },
};

export default defineConfig({
  root: appRoot,
  publicDir: path.resolve(appRoot, "public"),
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "src"),
      "@theme": path.resolve(__dirname, "theme"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  plugins: [react(), swExistsAfterBuild],
  server: {
    port: 5174,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:8090",
      "/_": "http://127.0.0.1:8090",
    },
  },
  build: {
    outDir: path.resolve(repoRoot, "pb_public"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    // Service worker is bundled as a separate root-level entry so the
    // resulting /sw.js sits at the bundle root (matching the path passed
    // to navigator.serviceWorker.register("/sw.js")).
    rollupOptions: {
      input: {
        main: path.resolve(appRoot, "index.html"),
        sw: path.resolve(appRoot, "src/sw.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js",
      },
    },
  },
});
