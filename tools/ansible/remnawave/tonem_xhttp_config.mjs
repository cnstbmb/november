import crypto from "node:crypto";

export const CONFIG_VERSION = 1;
export const MIN_PATH_TOKEN_LENGTH = 22;

export function newSecretPath() {
  return `/assets/${crypto.randomBytes(24).toString("base64url")}/`;
}

function target({
  domain,
  mode,
  proxyProtocol,
  backendListen,
  backendPort,
  nginxUpstream,
  enabled = true,
  image,
}) {
  return {
    enabled,
    domain,
    publicIpv4: "",
    mode,
    proxyProtocol,
    backendListen,
    backendPort,
    nginxUpstream,
    path: newSecretPath(),
    image,
  };
}

export function createDefaultConfig({ homeLegacy } = {}) {
  const home = target({
    domain: "app.tonem.ru",
    mode: "packet-up",
    proxyProtocol: "http",
    backendListen: "127.0.0.1",
    backendPort: 10086,
    nginxUpstream: "127.0.0.1:10086",
    image: "cnstbmb/tonem-web:latest",
  });
  home.legacyVhosts = homeLegacy
    ? [
        {
          domain: homeLegacy.host,
          cert_name: homeLegacy.host,
          locations: [
            {
              path: homeLegacy.path,
              proxyProtocol: "http",
              upstream: `${homeLegacy.backendListen}:${homeLegacy.backendPort}`,
            },
          ],
        },
      ]
    : [];
  Object.assign(home, {
    inventoryTarget: "home.himenkov.ru",
    legacyInboundTag: "VLESS_HOME_REALITY_DIRECT",
    canaryInboundTag: "VLESS_XHTTP_TONEM_HOME_CANARY",
    productionHostRemark: "HOME",
    productionSquadNames: ["HOME", "HOME Monitoring Squad"],
    canarySquadName: "TONEM Canary Home",
    canaryHostRemark: "TONEM CANARY HOME",
    canaryUserShortUuid: "",
  });

  const moscow = target({
    domain: "live.tonem.ru",
    mode: "stream-one",
    proxyProtocol: "grpc",
    backendListen: "0.0.0.0",
    backendPort: 10086,
    nginxUpstream: "host.docker.internal:10086",
    image: "cnstbmb/tonem-web:latest",
  });
  Object.assign(moscow, {
    inventoryTarget: "master",
    dockerBridgeCidr: "172.18.0.0/16",
    legacyInboundTag: "VLESS_XHTTP_MOSCOW",
    canaryInboundTag: "VLESS_XHTTP_TONEM_MOSCOW_CANARY",
    productionHostRemark: "MOSCOW",
    productionSquadNames: [],
    canarySquadName: "TONEM Canary Moscow",
    canaryHostRemark: "TONEM CANARY MOSCOW",
    canaryUserShortUuid: "",
  });

  const exit = target({
    domain: "terminal.tonem.ru",
    mode: "stream-one",
    proxyProtocol: "grpc",
    backendListen: "127.0.0.1",
    backendPort: 10086,
    nginxUpstream: "127.0.0.1:10086",
    enabled: false,
    image: "cnstbmb/tonem-web:latest",
  });
  Object.assign(exit, {
    inventoryTarget: "",
    legacyInboundTag: "",
    canaryInboundTag: "VLESS_XHTTP_TONEM_EXIT_CANARY",
    productionHostRemark: "",
    productionSquadNames: [],
    canarySquadName: "TONEM Canary Exit",
    canaryHostRemark: "TONEM CANARY EXIT",
    canaryUserShortUuid: "",
    legacyVhosts: [],
  });

  return {
    version: CONFIG_VERSION,
    createdAt: new Date().toISOString(),
    overlapDays: 14,
    encryptedBackupRetentionDays: 30,
    rolloutOrder: ["moscow", "home", "exit"],
    targets: {
      moscow,
      home,
      exit,
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateIpv4(value, label) {
  if (!value) return;
  const octets = value.split(".");
  assert(octets.length === 4, `${label}.publicIpv4 must be IPv4`);
  assert(
    octets.every((item) => /^\d{1,3}$/.test(item) && Number(item) <= 255),
    `${label}.publicIpv4 must be IPv4`,
  );
}

function validateIpv4Cidr(value, label) {
  const [address, prefix, extra] = String(value ?? "").split("/");
  assert(address && extra === undefined && prefix !== undefined, `${label} must be an IPv4 CIDR`);
  validateIpv4(address, label);
  assert(/^\d{1,2}$/.test(prefix) && Number(prefix) <= 32, `${label} must be an IPv4 CIDR`);
}

export function validateConfig(config) {
  assert(config?.version === CONFIG_VERSION, `Expected config version ${CONFIG_VERSION}`);
  assert(config.overlapDays === 14, "overlapDays must remain 14 for the approved migration");
  assert(
    config.encryptedBackupRetentionDays === 30,
    "encryptedBackupRetentionDays must remain 30 for the approved migration",
  );
  assert(
    JSON.stringify(config.rolloutOrder) === JSON.stringify(["moscow", "home", "exit"]),
    "rolloutOrder must be moscow, home, exit",
  );

  const expectedDomains = {
    moscow: "live.tonem.ru",
    home: "app.tonem.ru",
    exit: "terminal.tonem.ru",
  };
  assert(config.targets?.moscow?.enabled === true, "moscow target must stay enabled");
  assert(config.targets?.home?.enabled === true, "home target must stay enabled");
  assert(
    config.targets.moscow.inventoryTarget === "master",
    "moscow.inventoryTarget must be master",
  );
  assert(
    config.targets.home.inventoryTarget === "home.himenkov.ru",
    "home.inventoryTarget must be home.himenkov.ru",
  );
  const paths = [];
  for (const [name, expectedDomain] of Object.entries(expectedDomains)) {
    const value = config.targets?.[name];
    assert(value, `Missing ${name} target`);
    assert(value.domain === expectedDomain, `${name}.domain must be ${expectedDomain}`);
    assert(value.domain !== "tonem.ru", "The Cloudflare apex cannot carry XHTTP");
    validateIpv4(value.publicIpv4, name);
    assert(Number.isInteger(value.backendPort), `${name}.backendPort must be an integer`);
    assert(value.backendPort > 0 && value.backendPort < 65536, `${name}.backendPort is invalid`);
    assert(["stream-one", "packet-up"].includes(value.mode), `${name}.mode is invalid`);
    assert(["grpc", "http"].includes(value.proxyProtocol), `${name}.proxyProtocol is invalid`);
    if (name === "moscow") {
      assert(value.backendListen === "0.0.0.0", "moscow backend must bind on the host");
      assert(
        value.nginxUpstream === `host.docker.internal:${value.backendPort}`,
        "moscow nginx upstream must use host.docker.internal",
      );
    } else {
      assert(value.backendListen === "127.0.0.1", `${name} backend must be loopback-only`);
      assert(
        value.nginxUpstream === `127.0.0.1:${value.backendPort}`,
        `${name} nginx upstream must be loopback-only`,
      );
    }
    assert(value.canaryInboundTag?.length > 0, `${name}.canaryInboundTag is required`);
    assert(value.canarySquadName?.length >= 2, `${name}.canarySquadName is required`);
    assert(value.canaryHostRemark?.length > 0, `${name}.canaryHostRemark is required`);
    if (name === "moscow") {
      validateIpv4Cidr(value.dockerBridgeCidr, "moscow.dockerBridgeCidr");
    }
    for (const legacyVhost of value.legacyVhosts ?? []) {
      for (const location of legacyVhost.locations ?? []) {
        assert(
          !String(location.upstream).endsWith(`:${value.backendPort}`),
          `${name}.backendPort must be separate from the legacy inbound`,
        );
      }
    }
    if (value.enabled) {
      assert(value.legacyInboundTag?.length > 0, `${name}.legacyInboundTag is required`);
      assert(value.productionHostRemark?.length > 0, `${name}.productionHostRemark is required`);
      assert(value.inventoryTarget?.length > 0, `${name}.inventoryTarget is required`);
    }
    assert(
      /^\/assets\/[A-Za-z0-9_-]{22,}\/$/.test(value.path),
      `${name}.path must be a high-entropy asset path`,
    );
    paths.push(value.path);
  }
  assert(new Set(paths).size === paths.length, "Every target must use a unique path");
  return config;
}

export function sanitizedSummary(config) {
  validateConfig(config);
  return {
    version: config.version,
    overlapDays: config.overlapDays,
    encryptedBackupRetentionDays: config.encryptedBackupRetentionDays,
    rolloutOrder: config.rolloutOrder,
    targets: Object.fromEntries(
      Object.entries(config.targets).map(([name, value]) => [
        name,
        {
          enabled: value.enabled,
          domain: value.domain,
          inventoryTargetConfigured: Boolean(value.inventoryTarget),
          publicIpv4Configured: Boolean(value.publicIpv4),
          mode: value.mode,
          proxyProtocol: value.proxyProtocol,
          backendListen: value.backendListen,
          backendPort: value.backendPort,
          dockerBridgeCidrConfigured:
            name === "moscow" ? Boolean(value.dockerBridgeCidr) : undefined,
          pathConfigured: Boolean(value.path),
          legacyVhostCount: value.legacyVhosts?.length ?? 0,
          canaryUserConfigured: Boolean(value.canaryUserShortUuid),
          productionSquadsConfigured: (value.productionSquadNames?.length ?? 0) > 0,
        },
      ]),
    ),
  };
}

export function rolloutReadinessErrors(config) {
  validateConfig(config);
  const errors = [];
  for (const name of config.rolloutOrder) {
    const target = config.targets[name];
    if (!target.enabled) continue;
    if (!target.publicIpv4) errors.push(`${name}.publicIpv4 is required`);
    if (!target.canaryUserShortUuid) {
      errors.push(`${name}.canaryUserShortUuid is required`);
    }
    if ((target.productionSquadNames ?? []).length === 0) {
      errors.push(`${name}.productionSquadNames is required`);
    }
  }
  return errors;
}

export function assertRolloutReady(config) {
  const errors = rolloutReadinessErrors(config);
  assert(
    errors.length === 0,
    `TONEM XHTTP rollout is not ready:\n- ${errors.join("\n- ")}`,
  );
  return config;
}
