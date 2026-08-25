export function parseProfileConfig(value) {
  return typeof value === "string" ? JSON.parse(value) : structuredClone(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function desiredCanaryInbound(target, legacyInbound) {
  assert(legacyInbound, `Legacy inbound ${target.legacyInboundTag} is missing`);
  const settings = structuredClone(legacyInbound.settings ?? {
    clients: [],
    decryption: "none",
  });
  settings.clients = [];
  return {
    tag: target.canaryInboundTag,
    listen: target.backendListen,
    port: Number(target.backendPort),
    protocol: "vless",
    settings,
    sniffing: structuredClone(
      legacyInbound.sniffing ?? {
        enabled: true,
        destOverride: ["http", "tls", "quic", "fakedns"],
      },
    ),
    streamSettings: {
      network: "xhttp",
      security: "none",
      xhttpSettings: {
        ...(legacyInbound.streamSettings?.xhttpSettings ?? {}),
        host: target.domain,
        mode: target.mode,
        path: target.path,
        scMaxBufferedPosts: 30,
        scMaxEachPostBytes: "1000000",
      },
    },
  };
}

export function profileWithCanary(profileConfig, target) {
  const profile = structuredClone(profileConfig);
  const inbounds = profile.inbounds ?? [];
  const portCollision = inbounds.find((item) => {
    if (item.tag === target.canaryInboundTag || Number(item.port) !== Number(target.backendPort)) {
      return false;
    }
    const existingListen = item.listen ?? "0.0.0.0";
    return (
      existingListen === target.backendListen ||
      existingListen === "0.0.0.0" ||
      target.backendListen === "0.0.0.0"
    );
  });
  assert(!portCollision, `Backend port ${target.backendPort} collides with ${portCollision?.tag}`);
  const legacyIndex = inbounds.findIndex((item) => item.tag === target.legacyInboundTag);
  assert(legacyIndex >= 0, `Legacy inbound ${target.legacyInboundTag} is missing`);
  const legacyInbound = inbounds[legacyIndex];
  const canary = desiredCanaryInbound(target, legacyInbound);
  profile.inbounds = inbounds.filter((item) => item.tag !== target.canaryInboundTag);
  const insertionIndex = profile.inbounds.findIndex(
    (item) => item.tag === target.legacyInboundTag,
  );
  profile.inbounds.splice(insertionIndex + 1, 0, canary);

  const rules = profile.routing?.rules;
  assert(Array.isArray(rules), "Config profile has no routing.rules");
  const legacyRules = rules.filter((rule) =>
    (rule.inboundTag ?? []).includes(target.legacyInboundTag),
  );
  const withoutCanary = rules.filter(
    (rule) => !(rule.inboundTag ?? []).includes(target.canaryInboundTag),
  );
  profile.routing.rules = [
    ...withoutCanary,
    ...legacyRules.map((rule) => ({
      ...structuredClone(rule),
      inboundTag: (rule.inboundTag ?? []).map((tag) =>
        tag === target.legacyInboundTag ? target.canaryInboundTag : tag,
      ),
    })),
  ];
  return profile;
}

export function profileWithoutLegacy(profileConfig, target) {
  const profile = structuredClone(profileConfig);
  assert(
    (profile.inbounds ?? []).some((item) => item.tag === target.canaryInboundTag),
    `Canary inbound ${target.canaryInboundTag} is missing`,
  );
  profile.inbounds = (profile.inbounds ?? []).filter(
    (item) => item.tag !== target.legacyInboundTag,
  );
  profile.routing.rules = (profile.routing?.rules ?? []).filter(
    (rule) => !(rule.inboundTag ?? []).includes(target.legacyInboundTag),
  );
  return profile;
}

export function xhttpHostPayload(target, profileUuid, inboundUuid, nodes = []) {
  return {
    inbound: {
      configProfileUuid: profileUuid,
      configProfileInboundUuid: inboundUuid,
    },
    remark: target.canaryHostRemark,
    address: target.domain,
    port: 443,
    path: target.path,
    sni: target.domain,
    host: target.domain,
    alpn: target.mode === "packet-up" ? "h2,http/1.1" : "h2",
    fingerprint: "chrome",
    securityLayer: "TLS",
    isDisabled: false,
    isHidden: false,
    nodes,
    excludedInternalSquads: [],
    excludeFromSubscriptionTypes: [],
  };
}

export function userSquadUpdatePayload(user, activeInternalSquads) {
  assert(Number.isInteger(user?.id), "Remnawave user numeric id is required");
  assert(typeof user?.uuid === "string" && user.uuid.length > 0, "Remnawave user UUID is required");
  return {
    id: user.id,
    uuid: user.uuid,
    activeInternalSquads: [...activeInternalSquads],
  };
}

export function canRetire(cutoverAt, overlapDays, now = new Date()) {
  if (!cutoverAt) return false;
  const deadline = new Date(cutoverAt).getTime() + overlapDays * 24 * 60 * 60 * 1000;
  return Number.isFinite(deadline) && now.getTime() >= deadline;
}

export function canCleanupCanaryArtifacts({
  cutoverAt,
  canaryInboundUuid,
  productionHostInboundUuid,
  productionSquadInboundUuids,
}) {
  if (!cutoverAt || !canaryInboundUuid) return false;
  if (productionHostInboundUuid !== canaryInboundUuid) return false;
  return (productionSquadInboundUuids ?? []).every((inbounds) =>
    (inbounds ?? []).includes(canaryInboundUuid),
  );
}
