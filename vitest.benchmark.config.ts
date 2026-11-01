import path from "node:path";

import { defineConfig } from "vitest/config";

// Benchmarks are excluded from `pnpm test`; run them with `pnpm benchmark`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    include: ["benchmark/**/*.benchmark.ts"],
    testTimeout: 120000,
  },
});
