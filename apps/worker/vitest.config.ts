import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@family-manager/shared": path.resolve(__dirname, "../../packages/shared/src")
    }
  }
});
