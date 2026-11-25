import { defineConfig } from "vite";

// Relative paths, so the built game runs from any folder (Toki serves it at its own address).
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 1200 },
});
