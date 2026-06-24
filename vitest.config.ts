import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror tsconfig "@/*" -> "src/*" so tests can import app modules.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
