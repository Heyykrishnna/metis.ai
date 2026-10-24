import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.integration.test.ts"],
    setupFiles: ["dotenv/config"],
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  },
});
