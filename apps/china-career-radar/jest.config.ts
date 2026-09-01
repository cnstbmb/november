import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^socks-proxy-agent$": "<rootDir>/test/mocks/socks-proxy-agent.ts",
  },
  clearMocks: true,
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts", "!src/cli.ts"],
};

export default config;
