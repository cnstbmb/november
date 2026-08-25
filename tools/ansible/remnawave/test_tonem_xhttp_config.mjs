import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRolloutReady,
  createDefaultConfig,
  rolloutReadinessErrors,
  sanitizedSummary,
  validateConfig,
} from "./tonem_xhttp_config.mjs";

test("default config uses unique high-entropy paths without enabling exit", () => {
  const config = createDefaultConfig();
  validateConfig(config);
  const paths = Object.values(config.targets).map((target) => target.path);
  assert.equal(new Set(paths).size, 3);
  assert.equal(config.targets.exit.enabled, false);
  assert.equal(config.targets.moscow.dockerBridgeCidr, "172.18.0.0/16");
  assert.equal(config.targets.home.inventoryTarget, "home.himenkov.ru");
  assert.match(config.targets.home.path, /^\/assets\/[A-Za-z0-9_-]{22,}\/$/);
});

test("summary never exposes secret paths or legacy paths", () => {
  const config = createDefaultConfig({
    homeLegacy: {
      host: "home.example.com",
      path: "/assets/legacy-secret/",
      backendListen: "127.0.0.1",
      backendPort: 10085,
    },
  });
  const serialized = JSON.stringify(sanitizedSummary(config));
  assert.equal(serialized.includes(config.targets.home.path), false);
  assert.equal(serialized.includes("legacy-secret"), false);
  assert.equal(config.targets.home.legacyVhosts.length, 1);
});

test("rollout readiness lists every missing operator value", () => {
  const config = createDefaultConfig();
  assert.deepEqual(rolloutReadinessErrors(config), [
    "moscow.publicIpv4 is required",
    "moscow.canaryUserShortUuid is required",
    "moscow.productionSquadNames is required",
    "home.publicIpv4 is required",
    "home.canaryUserShortUuid is required",
  ]);
  assert.throws(() => assertRolloutReady(config), /rollout is not ready/);

  config.targets.moscow.publicIpv4 = "192.0.2.10";
  config.targets.moscow.canaryUserShortUuid = "private-value";
  config.targets.moscow.productionSquadNames = ["MOSCOW"];
  config.targets.home.publicIpv4 = "192.0.2.20";
  config.targets.home.canaryUserShortUuid = "private-value";
  assert.doesNotThrow(() => assertRolloutReady(config));
});

test("apex and duplicate paths are rejected", () => {
  const apex = createDefaultConfig();
  apex.targets.moscow.domain = "tonem.ru";
  assert.throws(() => validateConfig(apex), /live\.tonem\.ru/);

  const duplicate = createDefaultConfig();
  duplicate.targets.home.path = duplicate.targets.moscow.path;
  assert.throws(() => validateConfig(duplicate), /unique path/);

  const publicBackend = createDefaultConfig();
  publicBackend.targets.moscow.dockerBridgeCidr = "";
  assert.throws(() => validateConfig(publicBackend), /dockerBridgeCidr/);

  const exposedHome = createDefaultConfig();
  exposedHome.targets.home.backendListen = "0.0.0.0";
  assert.throws(() => validateConfig(exposedHome), /loopback-only/);

  const missingInventoryHost = createDefaultConfig();
  missingInventoryHost.targets.home.inventoryTarget = "home_node";
  assert.throws(() => validateConfig(missingInventoryHost), /home\.himenkov\.ru/);
});
