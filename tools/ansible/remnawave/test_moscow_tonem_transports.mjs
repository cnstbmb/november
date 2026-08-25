import assert from "node:assert/strict";
import test from "node:test";

import {
  profileWithoutLegacyTransportDomains,
  profileWithTonemTransportDomains,
  transportDomainDrift,
  transportLegacyRetirementDrift,
} from "./moscow_tonem_transports.mjs";

const profile = {
  inbounds: [
    {
      tag: "HYSTERIA2_MOSCOW",
      streamSettings: {
        tlsSettings: {
          serverName: "moscow.himenkov.ru",
          certificates: [
            {
              usage: "encipherment",
              keyFile: "/etc/letsencrypt/live/moscow.himenkov.ru/privkey.pem",
              certificateFile: "/etc/letsencrypt/live/moscow.himenkov.ru/fullchain.pem",
            },
          ],
        },
        hysteriaSettings: {
          masquerade: { url: "https://moscow.himenkov.ru/", type: "proxy" },
        },
      },
    },
    {
      tag: "VLESS_REALITY_HOME_WIFI",
      streamSettings: {
        realitySettings: {
          target: "127.0.0.1:443",
          serverNames: ["moscow.himenkov.ru"],
          privateKey: "must-stay-unchanged",
        },
      },
    },
  ],
  routing: { rules: [{ type: "field", inboundTag: ["HYSTERIA2_MOSCOW"], outboundTag: "IPv4" }] },
};

test("moves Hysteria2 and Reserve to TONEM while retaining legacy compatibility", () => {
  const next = profileWithTonemTransportDomains(profile);
  const hysteria = next.inbounds[0];
  const reserve = next.inbounds[1];

  assert.equal(hysteria.streamSettings.tlsSettings.serverName, "live.tonem.ru");
  assert.deepEqual(
    hysteria.streamSettings.tlsSettings.certificates.map((item) => item.certificateFile),
    [
      "/etc/letsencrypt/live/live.tonem.ru/fullchain.pem",
      "/etc/letsencrypt/live/moscow.himenkov.ru/fullchain.pem",
    ],
  );
  assert.equal(hysteria.streamSettings.hysteriaSettings.masquerade.url, "https://live.tonem.ru/");
  assert.deepEqual(reserve.streamSettings.realitySettings.serverNames, [
    "live.tonem.ru",
    "moscow.himenkov.ru",
  ]);
  assert.equal(reserve.streamSettings.realitySettings.privateKey, "must-stay-unchanged");
  assert.deepEqual(next.routing, profile.routing);
});

test("migration is idempotent", () => {
  const once = profileWithTonemTransportDomains(profile);
  const twice = profileWithTonemTransportDomains(once);
  assert.deepEqual(twice, once);
  assert.equal(transportDomainDrift(profile), true);
  assert.equal(transportDomainDrift(once), false);
});

test("retirement removes only legacy transport compatibility", () => {
  const overlap = profileWithTonemTransportDomains(profile);
  const retired = profileWithoutLegacyTransportDomains(overlap);
  const hysteria = retired.inbounds[0];
  const reserve = retired.inbounds[1];

  assert.deepEqual(
    hysteria.streamSettings.tlsSettings.certificates.map((item) => item.certificateFile),
    ["/etc/letsencrypt/live/live.tonem.ru/fullchain.pem"],
  );
  assert.deepEqual(reserve.streamSettings.realitySettings.serverNames, ["live.tonem.ru"]);
  assert.equal(transportLegacyRetirementDrift(overlap), true);
  assert.equal(transportLegacyRetirementDrift(retired), false);
  assert.deepEqual(profileWithoutLegacyTransportDomains(retired), retired);
});
