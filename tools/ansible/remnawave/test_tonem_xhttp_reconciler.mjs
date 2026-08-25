import assert from "node:assert/strict";
import test from "node:test";

import {
  canCleanupCanaryArtifacts,
  canRetire,
  profileWithCanary,
  profileWithoutLegacy,
  userSquadUpdatePayload,
  xhttpHostPayload,
} from "./tonem_xhttp_reconciler.mjs";

const target = {
  domain: "app.tonem.ru",
  legacyInboundTag: "OLD",
  canaryInboundTag: "NEW",
  canaryHostRemark: "TONEM CANARY HOME",
  backendListen: "127.0.0.1",
  backendPort: 10086,
  mode: "packet-up",
  path: "/assets/abcdefghijklmnopqrstuvwxyz123456/",
};

const profile = {
  inbounds: [
    {
      tag: "OLD",
      protocol: "vless",
      settings: { clients: [{ id: "injected-at-runtime" }], decryption: "none" },
      streamSettings: { network: "xhttp", xhttpSettings: { path: "/old/" } },
    },
  ],
  routing: {
    rules: [{ type: "field", inboundTag: ["OLD"], outboundTag: "IPv4" }],
  },
};

test("canary inbound is isolated on its own port and routing rule", () => {
  const next = profileWithCanary(profile, target);
  const canary = next.inbounds.find((item) => item.tag === "NEW");
  assert.equal(canary.listen, "127.0.0.1");
  assert.equal(canary.port, 10086);
  assert.equal(canary.streamSettings.security, "none");
  assert.equal(canary.streamSettings.xhttpSettings.host, "app.tonem.ru");
  assert.deepEqual(canary.settings.clients, []);
  assert.equal(
    next.routing.rules.some(
      (rule) => rule.inboundTag?.includes("NEW") && rule.outboundTag === "IPv4",
    ),
    true,
  );
});

test("canary preserves default routing when legacy has no inbound-specific rule", () => {
  const defaultRoutedProfile = structuredClone(profile);
  defaultRoutedProfile.routing.rules = [
    { type: "field", protocol: ["bittorrent"], outboundTag: "BLOCK" },
  ];

  const next = profileWithCanary(defaultRoutedProfile, target);

  assert.equal(next.inbounds.some((item) => item.tag === "NEW"), true);
  assert.deepEqual(next.routing.rules, defaultRoutedProfile.routing.rules);
});

test("legacy retirement preserves canary and removes legacy routing", () => {
  const retired = profileWithoutLegacy(profileWithCanary(profile, target), target);
  assert.deepEqual(retired.inbounds.map((item) => item.tag), ["NEW"]);
  assert.equal(
    retired.routing.rules.some((rule) => rule.inboundTag?.includes("OLD")),
    false,
  );
});

test("canary refuses a backend port already used by another inbound", () => {
  const collision = structuredClone(profile);
  collision.inbounds.push({ tag: "OTHER", listen: "0.0.0.0", port: 10086 });
  assert.throws(() => profileWithCanary(collision, target), /collides with OTHER/);
});

test("host payload uses exact TLS origin", () => {
  const host = xhttpHostPayload(target, "profile", "inbound", ["node"]);
  assert.equal(host.address, "app.tonem.ru");
  assert.equal(host.sni, "app.tonem.ru");
  assert.equal(host.host, "app.tonem.ru");
  assert.equal(host.alpn, "h2,http/1.1");
});

test("user squad patch supports both deployed and current Remnawave identifiers", () => {
  assert.deepEqual(userSquadUpdatePayload({ id: 42, uuid: "user-uuid" }, ["squad-uuid"]), {
    id: 42,
    uuid: "user-uuid",
    activeInternalSquads: ["squad-uuid"],
  });
  assert.throws(
    () => userSquadUpdatePayload({ id: 42 }, []),
    /Remnawave user UUID is required/,
  );
  assert.throws(
    () => userSquadUpdatePayload({ uuid: "user-uuid" }, []),
    /numeric id is required/,
  );
});

test("retirement gate enforces the approved overlap", () => {
  const cutover = "2026-08-01T00:00:00.000Z";
  assert.equal(canRetire(cutover, 14, new Date("2026-08-14T23:59:59.000Z")), false);
  assert.equal(canRetire(cutover, 14, new Date("2026-08-15T00:00:00.000Z")), true);
});

test("canary artifacts are removable only after production uses the canary inbound", () => {
  const ready = {
    cutoverAt: "2026-08-01T00:00:00.000Z",
    canaryInboundUuid: "new-inbound",
    productionHostInboundUuid: "new-inbound",
    productionSquadInboundUuids: [
      ["old-inbound", "new-inbound"],
      ["new-inbound"],
    ],
  };
  assert.equal(canCleanupCanaryArtifacts(ready), true);
  assert.equal(
    canCleanupCanaryArtifacts({ ...ready, productionHostInboundUuid: "old-inbound" }),
    false,
  );
  assert.equal(
    canCleanupCanaryArtifacts({
      ...ready,
      productionSquadInboundUuids: [["old-inbound"]],
    }),
    false,
  );
});
