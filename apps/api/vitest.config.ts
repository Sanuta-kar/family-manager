import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // SWC emits the decorator metadata NestJS DI relies on, which vitest's default
  // esbuild transform drops (leaving constructor-injected providers undefined).
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    // Integration tests share a single Postgres test database; run serially in one
    // process so truncation between tests never races across workers.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["./test/setup-env.ts"],
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"]
  }
});
