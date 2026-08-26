export const YOUTUBE_PROFILE_NAME = "YOUTUBE_EXIT_NODE";
export const YOUTUBE_INBOUND_TAG = "BRIDGE_YOUTUBE_IN";
export const YOUTUBE_OUTBOUND_TAG = "GRPC_TO_YOUTUBE";

const clone = (value) => structuredClone(value);

function dnsRule() {
  return {
    port: "53",
    type: "field",
    network: "TCP,UDP",
    outboundTag: "DNS_OUT",
  };
}

function blockPrivateRule() {
  return { ip: ["geoip:private"], type: "field", outboundTag: "BLOCK" };
}

function blockBittorrentRule() {
  return { type: "field", protocol: ["bittorrent"], outboundTag: "BLOCK" };
}

function freedomOutbound(tag, domainStrategy = "AsIs") {
  return {
    tag,
    protocol: "freedom",
    settings: { domainStrategy },
    streamSettings: {
      sockopt: {
        tcpMptcp: true,
        penetrate: true,
        tcpFastOpen: true,
      },
    },
  };
}

export function buildYoutubeExitProfile({ bridgePort, certDomain }) {
  return {
    log: { loglevel: "warning" },
    dns: {
      servers: [
        {
          port: 53,
          address: "127.0.0.1",
          skipFallback: true,
          queryStrategy: "UseIPv4",
        },
      ],
      queryStrategy: "UseIP",
    },
    inbounds: [
      {
        tag: YOUTUBE_INBOUND_TAG,
        port: Number(bridgePort),
        listen: "0.0.0.0",
        protocol: "vless",
        settings: { clients: [], decryption: "none" },
        sniffing: {
          enabled: true,
          destOverride: ["http", "tls", "quic", "fakedns"],
        },
        streamSettings: {
          network: "grpc",
          security: "tls",
          tlsSettings: {
            alpn: ["h2", "http/1.1"],
            minVersion: "1.2",
            maxVersion: "1.3",
            serverName: certDomain,
            certificates: [
              {
                usage: "encipherment",
                keyFile: `/etc/letsencrypt/live/${certDomain}/privkey.pem`,
                certificateFile: `/etc/letsencrypt/live/${certDomain}/fullchain.pem`,
              },
            ],
          },
          grpcSettings: { multiMode: false, serviceName: "" },
        },
      },
    ],
    outbounds: [
      freedomOutbound("DIRECT"),
      { tag: "BLOCK", protocol: "blackhole" },
      freedomOutbound("IPv4", "UseIPv4"),
      {
        tag: "DNS_OUT",
        protocol: "freedom",
        settings: { redirect: "127.0.0.1:53" },
      },
    ],
    routing: {
      rules: [
        dnsRule(),
        blockBittorrentRule(),
        blockPrivateRule(),
        {
          type: "field",
          network: "TCP,UDP",
          protocol: ["http", "tls", "quic"],
          outboundTag: "IPv4",
        },
        {
          type: "field",
          network: "TCP,UDP",
          outboundTag: "DIRECT",
        },
      ],
      domainStrategy: "AsIs",
    },
  };
}

export function collectMoscowTransitInboundTags(masterProfile) {
  const tags = [];
  for (const rule of masterProfile.routing?.rules ?? []) {
    const isDefaultTransitRule =
      rule.outboundTag === "GRPC_TO_EXIT" &&
      Array.isArray(rule.inboundTag) &&
      !rule.domain &&
      !rule.ip &&
      !rule.port &&
      !rule.protocol;
    if (!isDefaultTransitRule) continue;
    for (const tag of rule.inboundTag) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  if (tags.length === 0) {
    throw new Error("No Moscow inbounds with GRPC_TO_EXIT default routing were found");
  }
  return tags;
}

export function bridgeServiceUuid(masterProfile) {
  const exitOutbound = (masterProfile.outbounds ?? []).find(
    (item) => item.tag === "GRPC_TO_EXIT",
  );
  const uuid = exitOutbound?.settings?.vnext?.[0]?.users?.[0]?.id;
  if (!uuid) throw new Error("GRPC_TO_EXIT service UUID was not found");
  return uuid;
}

export function patchMasterForYoutube(masterProfile, {
  address,
  bridgePort,
  certDomain,
}) {
  const profile = clone(masterProfile);
  if (!Array.isArray(profile.outbounds) || !Array.isArray(profile.routing?.rules)) {
    throw new Error("Master profile has no outbounds or routing.rules");
  }

  const inboundTags = collectMoscowTransitInboundTags(profile);
  const serviceUuid = bridgeServiceUuid(profile);
  profile.outbounds = profile.outbounds.filter((item) => item.tag !== YOUTUBE_OUTBOUND_TAG);
  const dnsOutboundIndex = profile.outbounds.findIndex((item) => item.tag === "DNS_OUT");
  const youtubeOutbound = {
    tag: YOUTUBE_OUTBOUND_TAG,
    protocol: "vless",
    settings: {
      vnext: [
        {
          address,
          port: Number(bridgePort),
          users: [{ id: serviceUuid, encryption: "none" }],
        },
      ],
    },
    streamSettings: {
      network: "grpc",
      security: "tls",
      tlsSettings: {
        alpn: ["h2"],
        serverName: certDomain,
        fingerprint: "chrome",
        allowInsecure: false,
      },
      grpcSettings: { multiMode: false, serviceName: "" },
    },
  };
  if (dnsOutboundIndex < 0) profile.outbounds.push(youtubeOutbound);
  else profile.outbounds.splice(dnsOutboundIndex, 0, youtubeOutbound);

  profile.routing.rules = profile.routing.rules.filter(
    (rule) =>
      rule.outboundTag !== YOUTUBE_OUTBOUND_TAG &&
      !(Array.isArray(rule.domain) && rule.domain.includes("geosite:youtube")),
  );
  const youtubeRule = {
    type: "field",
    domain: ["geosite:youtube"],
    inboundTag: inboundTags,
    outboundTag: YOUTUBE_OUTBOUND_TAG,
  };
  const firstTransitOrHomeRule = profile.routing.rules.findIndex(
    (rule) => ["GRPC_TO_EXIT", "GRPC_TO_HOME_RU", "WG_TO_HOME_RU"].includes(rule.outboundTag),
  );
  if (firstTransitOrHomeRule < 0) profile.routing.rules.push(youtubeRule);
  else profile.routing.rules.splice(firstTransitOrHomeRule, 0, youtubeRule);
  return profile;
}

export function youtubeContract(masterProfile, youtubeProfile) {
  const youtubeRules = (masterProfile.routing?.rules ?? []).filter(
    (rule) => rule.outboundTag === YOUTUBE_OUTBOUND_TAG,
  );
  const youtubeOutbounds = (masterProfile.outbounds ?? []).filter(
    (item) => item.tag === YOUTUBE_OUTBOUND_TAG,
  );
  const youtubeInbounds = (youtubeProfile.inbounds ?? []).filter(
    (item) => item.tag === YOUTUBE_INBOUND_TAG,
  );
  return {
    youtubeRuleCount: youtubeRules.length,
    youtubeOutboundCount: youtubeOutbounds.length,
    youtubeInboundCount: youtubeInbounds.length,
    routedInboundTags: youtubeRules[0]?.inboundTag ?? [],
    directInboundRouted: (youtubeRules[0]?.inboundTag ?? []).some((tag) => tag.includes("DIRECT")),
  };
}
