import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYoutubeExitProfile,
  patchMasterForYoutube,
  youtubeContract,
} from "./moscow_youtube_exit.mjs";

function masterFixture() {
  return {
    outbounds: [
      { tag: "IPv4", protocol: "freedom" },
      {
        tag: "GRPC_TO_EXIT",
        protocol: "vless",
        settings: {
          vnext: [
            {
              address: "198.51.100.20",
              port: 8443,
              users: [{ id: "11111111-1111-4111-8111-111111111111", encryption: "none" }],
            },
          ],
        },
      },
      { tag: "DNS_OUT", protocol: "freedom" },
    ],
    routing: {
      rules: [
        { type: "field", protocol: ["bittorrent"], outboundTag: "BLOCK" },
        {
          type: "field",
          inboundTag: ["VLESS_REALITY_DIRECT_MSK"],
          outboundTag: "IPv4",
        },
        {
          type: "field",
          inboundTag: ["VLESS_REALITY_MOSCOW"],
          outboundTag: "GRPC_TO_EXIT",
        },
        {
          type: "field",
          inboundTag: ["VLESS_XHTTP_MOSCOW"],
          outboundTag: "GRPC_TO_EXIT",
        },
      ],
    },
  };
}

const youtubeOptions = {
  address: "203.0.113.50",
  bridgePort: 8443,
  certDomain: "youtube.example.com",
};

test("routes only Moscow traffic that previously used the transit exit", () => {
  const patched = patchMasterForYoutube(masterFixture(), youtubeOptions);
  const youtubeProfile = buildYoutubeExitProfile(youtubeOptions);
  const contract = youtubeContract(patched, youtubeProfile);

  assert.deepEqual(contract, {
    youtubeRuleCount: 1,
    youtubeOutboundCount: 1,
    youtubeInboundCount: 1,
    routedInboundTags: ["VLESS_REALITY_MOSCOW", "VLESS_XHTTP_MOSCOW"],
    directInboundRouted: false,
  });
  assert.equal(
    patched.outbounds.find((item) => item.tag === "GRPC_TO_EXIT").settings.vnext[0].address,
    "198.51.100.20",
  );
});

test("patching is idempotent", () => {
  const once = patchMasterForYoutube(masterFixture(), youtubeOptions);
  const twice = patchMasterForYoutube(once, youtubeOptions);
  assert.deepEqual(twice, once);
});

test("YouTube exit has no public client inbound", () => {
  const profile = buildYoutubeExitProfile(youtubeOptions);
  assert.deepEqual(profile.inbounds.map((item) => item.tag), ["BRIDGE_YOUTUBE_IN"]);
  assert.equal(profile.inbounds[0].streamSettings.security, "tls");
  assert.equal(profile.inbounds[0].streamSettings.tlsSettings.serverName, "youtube.example.com");
});
