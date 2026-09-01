import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "socks-proxy-agent": resolve(
        __dirname,
        "test/mocks/socks-proxy-agent.ts",
      ),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/main.ts", "src/cli.ts"],
    },
  },
});
