#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../..");
const tokenEnvFile = path.join(rootDir, ".private/ansible/prod/remnashop/.env");
const masterVarsFile = path.join(rootDir, ".private/ansible/prod/group_vars/master.yml");
const privateConfigFile = path.join(rootDir, ".private/ansible/prod/remnawave-home-xhttp.json");
const backupRoot = path.join(rootDir, ".private/backups/home-xhttp");
const localProfileFiles = [
  path.join(rootDir, ".private/configs/HOME_EXIT_NODE.json"),
  path.join(
    rootDir,
    ".private/ansible/prod/remnawave-topology/profiles/04-home-exit-home.himenkov.ru.profile.json",
  ),
];
const apiBase = (
  process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api"
).replace(/\/$/, "");
const homeNodeName = "home.himenkov.ru";
const homeHostRemark = "HOME";
const homeSquadName = "HOME";
const monitoringSquadName = "HOME Monitoring Squad";
const bridgeSquadName = "Bridge Exit Squad";
const bridgeInboundTag = "BRIDGE_HOME_RU_IN";
const xhttpInboundTag = "VLESS_HOME_REALITY_DIRECT";

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(tokenEnvFile, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${tokenEnvFile}`);
  return (match[1] || match[2] || match[3]).trim();
}

function readMonitoringShortUuid() {
  const vars = fs.readFileSync(masterVarsFile, "utf8");
  const match = vars.match(
    /^monitoring_xray_checker_subscription_url:\s*["']?([^"'\n]+)["']?/m,
  );
  if (!match) throw new Error("monitoring_xray_checker_subscription_url not found");
  return new URL(match[1]).pathname.split("/").filter(Boolean).at(-1);
}

function newPrivateConfig() {
  return {
    host: homeNodeName,
    publicPort: 443,
    backendListen: "127.0.0.1",
    backendPort: 10085,
    backendHost: "",
    mode: "packet-up",
    path: `/assets/${crypto.randomBytes(24).toString("base64url")}/`,
  };
}

function readPrivateConfig({ create = false } = {}) {
  if (fs.existsSync(privateConfigFile)) {
    return JSON.parse(fs.readFileSync(privateConfigFile, "utf8"));
  }
  if (!create) return null;
  const config = newPrivateConfig();
  fs.mkdirSync(path.dirname(privateConfigFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(privateConfigFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(privateConfigFile, 0o600);
  return config;
}

const token = readToken();

async function api(method, endpoint, body) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.message || data?.response?.message || "no API message";
    throw new Error(`${method} ${endpoint} failed with HTTP ${response.status}: ${detail}`);
  }
  return data;
}

function responseList(result, key) {
  if (Array.isArray(result?.response)) return result.response;
  return result?.response?.[key] || [];
}

function parseConfig(value) {
  if (typeof value === "string") return JSON.parse(value);
  return structuredClone(value);
}

async function readState() {
  const [hostsResult, squadsResult, usersResult, nodesResult] = await Promise.all([
    api("GET", "/hosts"),
    api("GET", "/internal-squads"),
    api("GET", "/users?start=1&size=1000"),
    api("GET", "/nodes"),
  ]);
  const hosts = responseList(hostsResult, "hosts");
  const squads = responseList(squadsResult, "internalSquads");
  const users = responseList(usersResult, "users");
  const nodes = responseList(nodesResult, "nodes");
  const homeHost = hosts.find((item) => item.remark === homeHostRemark);
  const bridgeSquad = squads.find((item) => item.name === bridgeSquadName);
  const bridgeInbound = bridgeSquad?.inbounds?.find((item) => item.tag === bridgeInboundTag);
  const homeNode = nodes.find((item) => item.name === homeNodeName);
  if (!homeHost || !bridgeSquad || !bridgeInbound || !homeNode) {
    throw new Error("HOME Host, Bridge Exit Squad/inbound, or HOME node is missing");
  }
  const profileResult = await api("GET", `/config-profiles/${bridgeInbound.profileUuid}`);
  const profileConfig = parseConfig(profileResult.response.config);
  return {
    homeHost,
    bridgeSquad,
    bridgeInbound,
    homeNode,
    homeSquad: squads.find((item) => item.name === homeSquadName),
    monitoringSquad: squads.find((item) => item.name === monitoringSquadName),
    monitoringUser: users.find((item) => item.shortUuid === readMonitoringShortUuid()),
    profileUuid: bridgeInbound.profileUuid,
    profileConfig,
  };
}

function desiredInbound(config) {
  return {
    tag: xhttpInboundTag,
    port: Number(config.backendPort),
    listen: config.backendListen,
    protocol: "vless",
    settings: { clients: [], decryption: "none" },
    sniffing: {
      enabled: true,
      destOverride: ["http", "tls", "quic", "fakedns"],
    },
    streamSettings: {
      network: "xhttp",
      security: "none",
      xhttpSettings: {
        host: config.backendHost ?? "",
        mode: config.mode,
        path: config.path,
        scMaxBufferedPosts: 30,
        scMaxEachPostBytes: "1000000",
      },
    },
  };
}

function updateProfile(profileConfig, privateConfig) {
  const config = structuredClone(profileConfig);
  config.inbounds = (config.inbounds || []).filter((item) => item.tag !== xhttpInboundTag);
  const bridgeIndex = config.inbounds.findIndex((item) => item.tag === bridgeInboundTag);
  if (bridgeIndex < 0) throw new Error(`${bridgeInboundTag} is missing from HOME profile`);
  config.inbounds.splice(bridgeIndex + 1, 0, desiredInbound(privateConfig));
  const rules = config.routing?.rules;
  if (!Array.isArray(rules)) throw new Error("HOME profile has no routing.rules");
  config.routing.rules = rules.filter(
    (rule) => !(rule.inboundTag || []).includes(xhttpInboundTag),
  );
  config.routing.rules.push({
    type: "field",
    inboundTag: [xhttpInboundTag],
    outboundTag: "IPv4",
  });
  return config;
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.home-xhttp-${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

function createBackup(label, value) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(backupRoot, `${stamp}-${label}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeJsonAtomic(path.join(dir, "before.json"), value);
  return dir;
}

async function prepare() {
  const privateConfig = readPrivateConfig({ create: true });
  const state = await readState();
  const nextConfig = updateProfile(state.profileConfig, privateConfig);
  const profileChanged = JSON.stringify(nextConfig) !== JSON.stringify(state.profileConfig);
  const backupDir = profileChanged
    ? createBackup("prepare", {
        profileUuid: state.profileUuid,
        profileConfig: state.profileConfig,
        nodeUuid: state.homeNode.uuid,
        activeInbounds: state.homeNode.configProfile?.activeInbounds || [],
      })
    : null;
  if (profileChanged) {
    await api("PATCH", "/config-profiles", { uuid: state.profileUuid, config: nextConfig });
  }
  const inboundsResult = await api("GET", `/config-profiles/${state.profileUuid}/inbounds`);
  const xhttpInbound = responseList(inboundsResult, "inbounds").find(
    (item) => item.tag === xhttpInboundTag,
  );
  if (!xhttpInbound) throw new Error(`${xhttpInboundTag} was not returned after profile PATCH`);
  const activeUuids = (state.homeNode.configProfile?.activeInbounds || []).map((item) => item.uuid);
  const nodeChanged = !activeUuids.includes(xhttpInbound.uuid);
  if (nodeChanged) {
    await api("PATCH", "/nodes", {
      uuid: state.homeNode.uuid,
      configProfile: {
        activeConfigProfileUuid: state.profileUuid,
        activeInbounds: [...activeUuids, xhttpInbound.uuid],
      },
    });
  }
  for (const file of localProfileFiles) {
    const current = fs.existsSync(file) ? parseConfig(fs.readFileSync(file, "utf8")) : null;
    if (JSON.stringify(current) !== JSON.stringify(nextConfig)) writeJsonAtomic(file, nextConfig);
  }
  return {
    mode: profileChanged || nodeChanged ? "prepared" : "already-prepared",
    backupDir,
    backendPort: privateConfig.backendPort,
    pathConfigured: true,
  };
}

function squadPatch(squad, name, inboundUuid) {
  return squad
    ? { method: "PATCH", body: { uuid: squad.uuid, name, inbounds: [inboundUuid] } }
    : { method: "POST", body: { name, inbounds: [inboundUuid] } };
}

function hostPatch(host, profileUuid, inboundUuid, privateConfig) {
  return {
    uuid: host.uuid,
    inbound: { configProfileUuid: profileUuid, configProfileInboundUuid: inboundUuid },
    remark: homeHostRemark,
    address: privateConfig.host,
    port: privateConfig.publicPort,
    path: privateConfig.path,
    sni: privateConfig.host,
    host: privateConfig.host,
    alpn: "h2,http/1.1",
    fingerprint: host.fingerprint || "chrome",
    securityLayer: "TLS",
    allowInsecure: false,
    isDisabled: false,
    isHidden: false,
    nodes: host.nodes || [],
    excludedInternalSquads: host.excludedInternalSquads || [],
    excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes || [],
  };
}

async function cutover() {
  const privateConfig = readPrivateConfig();
  if (!privateConfig) throw new Error("Run --prepare before --cutover");
  const landing = await fetch(`https://${privateConfig.host}/`, { redirect: "manual" });
  if (![200, 301, 302].includes(landing.status)) throw new Error(`Landing returned HTTP ${landing.status}`);
  const state = await readState();
  if (!state.monitoringUser) throw new Error("Monitoring service user was not found");
  const inboundsResult = await api("GET", `/config-profiles/${state.profileUuid}/inbounds`);
  const xhttpInbound = responseList(inboundsResult, "inbounds").find(
    (item) => item.tag === xhttpInboundTag,
  );
  if (!xhttpInbound) throw new Error(`${xhttpInboundTag} is not active in Remnawave`);
  const currentHomeTags = (state.homeSquad?.inbounds || []).map((item) => item.tag);
  const currentMonitoringTags = (state.monitoringSquad?.inbounds || []).map((item) => item.tag);
  const currentMonitoringSquads = (state.monitoringUser.activeInternalSquads || []).map(
    (item) => item.name,
  );
  const alreadyCutover =
    currentHomeTags.length === 1 && currentHomeTags[0] === xhttpInboundTag &&
    currentMonitoringTags.length === 1 && currentMonitoringTags[0] === xhttpInboundTag &&
    currentMonitoringSquads.includes(monitoringSquadName) &&
    Number(state.homeHost.port) === Number(privateConfig.publicPort) &&
    state.homeHost.path === privateConfig.path &&
    state.homeHost.inbound?.configProfileInboundUuid === xhttpInbound.uuid;
  if (alreadyCutover) {
    return { mode: "already-cutover", homeSquadMembersUntouched: true, monitoringAssigned: true };
  }
  const backupDir = createBackup("cutover", {
    homeHost: state.homeHost,
    homeSquad: state.homeSquad,
    monitoringSquad: state.monitoringSquad,
    monitoringUserUuid: state.monitoringUser.uuid,
    monitoringUserSquads: state.monitoringUser.activeInternalSquads || [],
  });
  try {
    const homeOperation = squadPatch(state.homeSquad, homeSquadName, xhttpInbound.uuid);
    await api(homeOperation.method, "/internal-squads", homeOperation.body);
    const monitoringOperation = squadPatch(
      state.monitoringSquad,
      monitoringSquadName,
      xhttpInbound.uuid,
    );
    const monitoringResult = await api(
      monitoringOperation.method,
      "/internal-squads",
      monitoringOperation.body,
    );
    const monitoringSquadUuid =
      state.monitoringSquad?.uuid || monitoringResult.response?.uuid || monitoringResult.uuid;
    if (!monitoringSquadUuid) throw new Error("Monitoring Squad UUID was not returned");
    const currentUserSquads = (state.monitoringUser.activeInternalSquads || []).map((item) => item.uuid);
    await api("PATCH", "/users", {
      uuid: state.monitoringUser.uuid,
      activeInternalSquads: [...new Set([...currentUserSquads, monitoringSquadUuid])],
    });
    await api("PATCH", "/hosts", hostPatch(state.homeHost, state.profileUuid, xhttpInbound.uuid, privateConfig));
    const verified = await readState();
    const homeTags = (verified.homeSquad?.inbounds || []).map((item) => item.tag);
    const monitorTags = (verified.monitoringSquad?.inbounds || []).map((item) => item.tag);
    const userSquads = (verified.monitoringUser?.activeInternalSquads || []).map((item) => item.name);
    if (
      homeTags.length !== 1 || homeTags[0] !== xhttpInboundTag ||
      monitorTags.length !== 1 || monitorTags[0] !== xhttpInboundTag ||
      !userSquads.includes(monitoringSquadName) ||
      Number(verified.homeHost.port) !== 443 ||
      verified.homeHost.inbound?.configProfileInboundUuid !== xhttpInbound.uuid
    ) throw new Error("HOME XHTTP verification failed after cutover");
    return { mode: "cutover", backupDir, homeSquadMembersUntouched: true, monitoringAssigned: true };
  } catch (error) {
    if (state.homeSquad) {
      await api("PATCH", "/internal-squads", {
        uuid: state.homeSquad.uuid,
        name: state.homeSquad.name,
        inbounds: (state.homeSquad.inbounds || []).map((item) => item.uuid),
      });
    }
    await api("PATCH", "/users", {
      uuid: state.monitoringUser.uuid,
      activeInternalSquads: (state.monitoringUser.activeInternalSquads || []).map((item) => item.uuid),
    });
    await api("PATCH", "/hosts", {
      uuid: state.homeHost.uuid,
      inbound: state.homeHost.inbound,
      port: state.homeHost.port,
      path: state.homeHost.path,
    });
    throw new Error(`Cutover rolled back: ${error.message}`);
  }
}

async function check() {
  const privateConfig = readPrivateConfig();
  const state = await readState();
  const inbound = state.profileConfig.inbounds?.find((item) => item.tag === xhttpInboundTag);
  return {
    mode: "check",
    privateConfigPresent: Boolean(privateConfig),
    profilePrepared: Boolean(inbound?.streamSettings?.network === "xhttp"),
    packetUp: inbound?.streamSettings?.xhttpSettings?.mode === "packet-up",
    nodeActive: (state.homeNode.configProfile?.activeInbounds || []).some(
      (item) => item.tag === xhttpInboundTag || item.uuid === inbound?.uuid,
    ),
    homeHostPort: state.homeHost.port,
    homeSquadInboundTags: (state.homeSquad?.inbounds || []).map((item) => item.tag),
    monitoringSquadPresent: Boolean(state.monitoringSquad),
  };
}

const args = new Set(process.argv.slice(2));
const result = args.has("--prepare")
  ? await prepare()
  : args.has("--cutover")
    ? await cutover()
    : await check();
console.log(JSON.stringify(result, null, 2));
