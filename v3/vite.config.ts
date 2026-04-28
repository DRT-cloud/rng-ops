import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.resolve(__dirname, "app");

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
  plugins: [react()],
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
  },
});
