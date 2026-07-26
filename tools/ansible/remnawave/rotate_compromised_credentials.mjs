#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const TOKEN_ENV = path.join(ROOT, ".private/ansible/prod/remnashop/.env");
const API_BASE = process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api";
const PROFILE_UUID = "ba4464ac-3ca1-4599-8047-53300afe0d43";
const APPLY = process.argv.includes("--apply");
const UNKNOWN_ARGS = process.argv.slice(2).filter((arg) => arg !== "--apply");

const MASTER_NODE_NAME = "moscow.himenkov.ru";
const REALITY_INBOUNDS = [
  "VLESS_REALITY_MOSCOW",
  "VLESS_REALITY_HOME_WIFI",
];
const SERVICES = [
  {
    username: "bridge_master_to_home_ru",
    outboundTag: "GRPC_TO_HOME_RU",
    targetNodeName: "home.himenkov.ru",
    expectedSquad: "Bridge Exit Squad",
  },
  {
    username: "bridge_master_to_exit",
    outboundTag: "GRPC_TO_EXIT",
    targetNodeName: "himenkov.ru",
    expectedSquad: "Bridge Exit Squad",
  },
];
const PRIMARY_LOCAL_CONFIGS = [
  path.join(ROOT, ".private/configs/MASTER_NODE.json"),
  path.join(
    ROOT,
    ".private/ansible/prod/remnawave-topology/profiles/02-master-moscow.himenkov.ru.profile.json",
  ),
];
const TAGGED_LOCAL_CONFIGS = [
  path.join(ROOT, ".private/sidecar/moscow-home-wifi-9443/config.json"),
];

if (UNKNOWN_ARGS.length > 0) {
  throw new Error(`Unknown arguments: ${UNKNOWN_ARGS.join(" ")}`);
}

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(TOKEN_ENV, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${TOKEN_ENV}`);
  return (match[1] || match[2] || match[3]).trim();
}

const TOKEN = readToken();

async function api(method, endpoint, body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`${method} ${endpoint}: HTTP ${res.status}`);
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
      }
    }
  }
  throw lastError;
}

function responseOf(value) {
  return value?.response ?? value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function profileConfig(profileResponse) {
  const config = responseOf(profileResponse)?.config;
  if (!config?.inbounds || !config?.outbounds) {
    throw new Error("Remnawave profile response has no config");
  }
  return config;
}

function findReality(config, tag) {
  const inbound = config.inbounds.find((item) => item.tag === tag);
  if (!inbound) throw new Error(`Reality inbound ${tag} not found`);
  if (inbound.streamSettings?.security !== "reality") {
    throw new Error(`${tag} is not a Reality inbound`);
  }
  if (!inbound.streamSettings.realitySettings?.privateKey) {
    throw new Error(`${tag} has no Reality privateKey`);
  }
  return inbound;
}

function findOutboundUser(config, tag) {
  const outbound = config.outbounds.find((item) => item.tag === tag);
  const user = outbound?.settings?.vnext?.[0]?.users?.[0];
  if (!user?.id) throw new Error(`Outbound ${tag} has no VLESS user id`);
  return user;
}

function generateRealityPair() {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const publicJwk = publicKey.export({ format: "jwk" });
  if (!privateJwk.d || !publicJwk.x) {
    throw new Error("Node.js did not return raw X25519 JWK values");
  }
  return {
    privateKey: privateJwk.d,
    publicKey: publicJwk.x,
    shortIds: [randomBytes(8).toString("hex")],
  };
}

async function resolveServiceUser(username) {
  const resolved = responseOf(await api("POST", "/users/resolve", { username }));
  if (!resolved?.uuid) throw new Error(`Unable to resolve service user ${username}`);
  const user = responseOf(await api("GET", `/users/${resolved.uuid}`));
  if (!user?.vlessUuid) throw new Error(`Service user ${username} has no VLESS UUID`);
  return user;
}

function validateServiceUser(service, user, config) {
  if (user.status !== "ACTIVE") {
    throw new Error(`${service.username} is not ACTIVE`);
  }
  const squads = (user.activeInternalSquads || []).map((item) => item.name);
  if (!squads.includes(service.expectedSquad)) {
    throw new Error(`${service.username} is not in ${service.expectedSquad}`);
  }
  if (findOutboundUser(config, service.outboundTag).id !== user.vlessUuid) {
    throw new Error(`${service.outboundTag} does not match live ${service.username}`);
  }
}

function safeUserSnapshot(user) {
  return {
    uuid: user.uuid,
    id: user.id,
    username: user.username,
    status: user.status,
    shortUuid: user.shortUuid,
    vlessUuid: user.vlessUuid,
    activeInternalSquads: user.activeInternalSquads,
  };
}

function makeBackupDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(ROOT, ".private/backups/credential-rotation", stamp);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}

function writeSecureJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function backupLocalFiles(dir) {
  const localDir = path.join(dir, "local-before");
  fs.mkdirSync(localDir, { mode: 0o700 });
  for (const file of [...PRIMARY_LOCAL_CONFIGS, ...TAGGED_LOCAL_CONFIGS]) {
    if (!fs.existsSync(file)) continue;
    const name = path.relative(ROOT, file).replaceAll("/", "__");
    const target = path.join(localDir, name);
    fs.copyFileSync(file, target);
    fs.chmodSync(target, 0o600);
  }
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.credential-rotation-${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

function applyTaggedSecrets(config, realityPairs, serviceUuids) {
  for (const tag of REALITY_INBOUNDS) {
    const inbound = config.inbounds?.find((item) => item.tag === tag);
    if (!inbound) continue;
    const settings = inbound.streamSettings?.realitySettings;
    if (!settings) throw new Error(`${tag} exists without realitySettings in a local config`);
    settings.privateKey = realityPairs[tag].privateKey;
    settings.shortIds = realityPairs[tag].shortIds;
  }
  for (const service of SERVICES) {
    const outbound = config.outbounds?.find((item) => item.tag === service.outboundTag);
    if (!outbound) continue;
    const user = outbound.settings?.vnext?.[0]?.users?.[0];
    if (!user) throw new Error(`${service.outboundTag} exists without a local VLESS user`);
    user.id = serviceUuids[service.username];
  }
}

function syncLocalConfigs(finalConfig, realityPairs, serviceUuids) {
  for (const file of PRIMARY_LOCAL_CONFIGS) {
    writeJsonAtomic(file, finalConfig);
  }
  for (const file of TAGGED_LOCAL_CONFIGS) {
    if (!fs.existsSync(file)) continue;
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    applyTaggedSecrets(config, realityPairs, serviceUuids);
    writeJsonAtomic(file, config);
  }
}

async function restartNodes(nodes, names) {
  for (const name of [...new Set(names)]) {
    const node = nodes.find((item) => item.name === name);
    if (!node?.uuid) throw new Error(`Node ${name} was not returned by Remnawave`);
    const result = responseOf(await api("POST", `/nodes/${node.uuid}/actions/restart`));
    if (result?.eventSent === false) {
      throw new Error(`Remnawave did not send restart event to ${name}`);
    }
  }
}

function rotationStateForDisk(realityPairs, serviceUuids) {
  return {
    generatedAt: new Date().toISOString(),
    reality: realityPairs,
    serviceUsers: serviceUuids,
  };
}

const profileBeforeResponse = await api("GET", `/config-profiles/${PROFILE_UUID}`);
const profileBefore = profileConfig(profileBeforeResponse);
const usersBefore = {};

for (const service of SERVICES) {
  const user = await resolveServiceUser(service.username);
  validateServiceUser(service, user, profileBefore);
  usersBefore[service.username] = user;
}

const realitySummary = REALITY_INBOUNDS.map((tag) => {
  const reality = findReality(profileBefore, tag).streamSettings.realitySettings;
  return {
    tag,
    hasPrivateKey: Boolean(reality.privateKey),
    shortIdCount: reality.shortIds?.length || 0,
  };
});

const existingPrivateKeys = REALITY_INBOUNDS.map(
  (tag) => findReality(profileBefore, tag).streamSettings.realitySettings.privateKey,
);

console.log(JSON.stringify({
  mode: APPLY ? "apply" : "check",
  profileUuid: PROFILE_UUID,
  realityInbounds: realitySummary,
  realityPrivateKeysAreDistinct: new Set(existingPrivateKeys).size === existingPrivateKeys.length,
  serviceUsers: SERVICES.map((service) => ({
    username: service.username,
    status: usersBefore[service.username].status,
    outboundTag: service.outboundTag,
    outboundMatchesLiveUser: true,
  })),
}, null, 2));

if (!APPLY) {
  console.log("CHECK ONLY: run with --apply to rotate credentials.");
  process.exit(0);
}

const backupDir = makeBackupDir();
backupLocalFiles(backupDir);
writeSecureJson(path.join(backupDir, "profile.before.json"), responseOf(profileBeforeResponse));
writeSecureJson(
  path.join(backupDir, "service-users.before.json"),
  Object.fromEntries(
    Object.entries(usersBefore).map(([username, user]) => [username, safeUserSnapshot(user)]),
  ),
);

const workingConfig = clone(profileBefore);
const realityPairs = Object.fromEntries(
  REALITY_INBOUNDS.map((tag) => [tag, generateRealityPair()]),
);
for (const tag of REALITY_INBOUNDS) {
  const settings = findReality(workingConfig, tag).streamSettings.realitySettings;
  settings.privateKey = realityPairs[tag].privateKey;
  settings.shortIds = realityPairs[tag].shortIds;
}

const serviceUuids = {};
let realityApplied = false;

for (const service of SERVICES) {
  const oldUser = usersBefore[service.username];
  const revoked = responseOf(
    await api("POST", `/users/${oldUser.uuid}/actions/revoke`, {
      revokeOnlyPasswords: true,
    }),
  );
  if (!revoked?.vlessUuid || revoked.vlessUuid === oldUser.vlessUuid) {
    throw new Error(`Remnawave did not rotate VLESS UUID for ${service.username}`);
  }

  serviceUuids[service.username] = revoked.vlessUuid;
  findOutboundUser(workingConfig, service.outboundTag).id = revoked.vlessUuid;
  writeSecureJson(
    path.join(backupDir, "rotation.secrets.json"),
    rotationStateForDisk(realityPairs, serviceUuids),
  );

  await api("PATCH", "/config-profiles", {
    uuid: PROFILE_UUID,
    config: workingConfig,
  });

  const nodesResponse = responseOf(await api("GET", "/nodes"));
  const nodes = Array.isArray(nodesResponse) ? nodesResponse : nodesResponse?.nodes || [];
  await restartNodes(nodes, [service.targetNodeName, MASTER_NODE_NAME]);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const liveUser = await resolveServiceUser(service.username);
  const liveProfile = profileConfig(await api("GET", `/config-profiles/${PROFILE_UUID}`));
  if (liveUser.vlessUuid !== revoked.vlessUuid) {
    throw new Error(`Live UUID verification failed for ${service.username}`);
  }
  if (findOutboundUser(liveProfile, service.outboundTag).id !== revoked.vlessUuid) {
    throw new Error(`Live outbound verification failed for ${service.outboundTag}`);
  }
  if (!realityApplied) {
    for (const tag of REALITY_INBOUNDS) {
      const livePrivateKey = findReality(liveProfile, tag).streamSettings.realitySettings.privateKey;
      if (livePrivateKey !== realityPairs[tag].privateKey) {
        throw new Error(`Live Reality verification failed for ${tag}`);
      }
    }
    realityApplied = true;
  }
  console.log(`ROTATED ${service.username}; secrets were not printed.`);
}

const finalProfileResponse = await api("GET", `/config-profiles/${PROFILE_UUID}`);
const finalConfig = profileConfig(finalProfileResponse);
syncLocalConfigs(finalConfig, realityPairs, serviceUuids);

const usersAfter = {};
for (const service of SERVICES) {
  usersAfter[service.username] = safeUserSnapshot(await resolveServiceUser(service.username));
}
writeSecureJson(path.join(backupDir, "profile.after.json"), responseOf(finalProfileResponse));
writeSecureJson(path.join(backupDir, "service-users.after.json"), usersAfter);

console.log(JSON.stringify({
  result: "credentials rotated",
  backupDir,
  realityInbounds: REALITY_INBOUNDS,
  serviceUsers: SERVICES.map((service) => service.username),
  localConfigsSynchronized: [...PRIMARY_LOCAL_CONFIGS, ...TAGGED_LOCAL_CONFIGS]
    .filter((file) => fs.existsSync(file))
    .map((file) => path.relative(ROOT, file)),
  secretsPrinted: false,
}, null, 2));
