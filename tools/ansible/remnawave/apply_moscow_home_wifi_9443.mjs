#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const TOKEN_ENV = path.join(ROOT, ".private/ansible/prod/remnashop/.env");
const PROFILE_UUID = "ba4464ac-3ca1-4599-8047-53300afe0d43";
const NODE_UUID = "fd23ab8a-e142-42f9-9cef-000656cf7eb1";
const OLD_TAG = "VLESS_REALITY_MOSCOW";
const NEW_TAG = "VLESS_REALITY_HOME_WIFI";
const HYSTERIA_TAG = "HYSTERIA2_MOSCOW";
const SQUAD_NAME = "Moscow Home WiFi";
const HOST_REMARK = "MOSCOW HOME WIFI";
const HYSTERIA_HOST_REMARK = "MOSCOW HYSTERIA2";
const API_BASE = process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api";
const LOCAL_MOSCOW_OUTBOUND = "IPv4";
const AMSTERDAM_OUTBOUND = "GRPC_TO_EXIT";

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(TOKEN_ENV, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${TOKEN_ENV}`);
  return (match[1] || match[2] || match[3]).trim();
}

function backupDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(ROOT, ".private/backups/moscow-home-wifi-9443", stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function api(method, endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const details = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`${method} ${endpoint} failed: ${res.status} ${details}`);
  }
  return data;
}

function writeJson(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n");
}

function ensureInbound(config) {
  config.inbounds = config.inbounds.filter((inbound) => inbound.tag !== HYSTERIA_TAG && inbound.tag !== NEW_TAG);
  const base = config.inbounds.find((inbound) => inbound.tag === OLD_TAG);
  if (!base) throw new Error(`${OLD_TAG} not found in MASTER_NODE profile`);

  const next = JSON.parse(JSON.stringify(base));
  next.tag = NEW_TAG;
  next.port = 9443;
  next.streamSettings.realitySettings.shortIds = ["9443b5ef"];
  next.streamSettings.realitySettings.serverNames = ["moscow.himenkov.ru"];

  const baseIndex = config.inbounds.findIndex((inbound) => inbound.tag === OLD_TAG);
  config.inbounds.splice(baseIndex + 1, 0, next);

  for (const rule of config.routing.rules) {
    if (Array.isArray(rule.inboundTag)) {
      rule.inboundTag = rule.inboundTag.filter((tag) => tag !== HYSTERIA_TAG);
      rule.inboundTag = rule.inboundTag.filter((tag) => tag !== NEW_TAG);
      const shouldShareRule = rule.inboundTag.includes(OLD_TAG) && rule.outboundTag === "BLOCK";
      if (shouldShareRule && !rule.inboundTag.includes(NEW_TAG)) {
        rule.inboundTag.push(NEW_TAG);
      }
      if (rule.outboundTag === AMSTERDAM_OUTBOUND && rule.inboundTag.includes(OLD_TAG)) {
        rule.inboundTag = [OLD_TAG];
      }
    }
  }

  config.routing.rules = config.routing.rules.filter((rule) =>
    !Array.isArray(rule.inboundTag) || rule.inboundTag.length > 0
  );

  const homeWifiBlockRules = [];
  for (const rule of config.routing.rules) {
    if (Array.isArray(rule.inboundTag) && rule.inboundTag.includes(NEW_TAG) && rule.outboundTag === "BLOCK") {
      homeWifiBlockRules.push({ ...JSON.parse(JSON.stringify(rule)), inboundTag: [NEW_TAG] });
      rule.inboundTag = rule.inboundTag.filter((tag) => tag !== NEW_TAG);
    }
  }
  config.routing.rules = config.routing.rules.filter((rule) =>
    !Array.isArray(rule.inboundTag) || rule.inboundTag.length > 0
  );

  const homeWifiRules = [
    ...homeWifiBlockRules,
    { type: "field", inboundTag: [NEW_TAG], ip: ["geoip:ru"], outboundTag: LOCAL_MOSCOW_OUTBOUND },
    { type: "field", inboundTag: [NEW_TAG], domain: ["geosite:category-ru"], outboundTag: LOCAL_MOSCOW_OUTBOUND },
    { type: "field", inboundTag: [NEW_TAG], domain: ["geosite:youtube"], outboundTag: LOCAL_MOSCOW_OUTBOUND },
    { type: "field", inboundTag: [NEW_TAG], outboundTag: AMSTERDAM_OUTBOUND },
  ];
  const isSafetyRule = (rule) =>
    (rule.port === "53" && rule.outboundTag === "DNS_OUT") ||
    (Array.isArray(rule.protocol) && rule.protocol.includes("bittorrent") && rule.outboundTag === "BLOCK") ||
    (Array.isArray(rule.ip) && rule.ip.includes("geoip:private") && rule.outboundTag === "BLOCK");
  const insertionIndex = config.routing.rules.findIndex((rule) => !isSafetyRule(rule));
  if (insertionIndex >= 0) config.routing.rules.splice(insertionIndex, 0, ...homeWifiRules);
  else config.routing.rules.push(...homeWifiRules);
}

const TOKEN = readToken();
const dir = backupDir();

const profileBefore = await api("GET", `/config-profiles/${PROFILE_UUID}`);
writeJson(dir, "profile.before.json", profileBefore);

const config = profileBefore.response.config;
ensureInbound(config);
writeJson(dir, "profile.patch.json", { uuid: PROFILE_UUID, config });

const profileAfterPatch = await api("PATCH", "/config-profiles", { uuid: PROFILE_UUID, config });
writeJson(dir, "profile.patch.response.json", profileAfterPatch);

const inboundsAfter = await api("GET", `/config-profiles/${PROFILE_UUID}/inbounds`);
writeJson(dir, "profile-inbounds.after.json", inboundsAfter);
const inboundList = Array.isArray(inboundsAfter.response)
  ? inboundsAfter.response
  : inboundsAfter.response?.inbounds || [];
const homeWifiInbound = inboundList.find((inbound) => inbound.tag === NEW_TAG);
if (!homeWifiInbound) throw new Error(`${NEW_TAG} inbound was not returned by Remnawave`);

const nodesBefore = await api("GET", "/nodes");
writeJson(dir, "nodes.before.json", nodesBefore);
const targetNode = (nodesBefore.response || []).find((node) => node.uuid === NODE_UUID);
if (!targetNode) throw new Error(`Node ${NODE_UUID} was not returned by Remnawave`);
const activeInboundUuids = (targetNode.configProfile?.activeInbounds || []).map((inbound) => inbound.uuid);
if (!activeInboundUuids.includes(homeWifiInbound.uuid)) {
  const nodePatch = {
    uuid: NODE_UUID,
    configProfile: {
      activeConfigProfileUuid: PROFILE_UUID,
      activeInbounds: [...activeInboundUuids, homeWifiInbound.uuid],
    },
  };
  writeJson(dir, "node.patch.json", nodePatch);
  const nodeAfterPatch = await api("PATCH", "/nodes", nodePatch);
  writeJson(dir, "node.patch.response.json", nodeAfterPatch);
}

const hostsBefore = await api("GET", "/hosts");
writeJson(dir, "hosts.before.json", hostsBefore);
const hosts = hostsBefore.response || [];

for (const host of hosts.filter((host) => host.remark === HYSTERIA_HOST_REMARK || host.port === 5443)) {
  const deleted = await api("DELETE", `/hosts/${host.uuid}`);
  writeJson(dir, `host.delete.${host.uuid}.json`, deleted);
}

const hostBody = {
  inbound: {
    configProfileUuid: PROFILE_UUID,
    configProfileInboundUuid: homeWifiInbound.uuid,
  },
  remark: HOST_REMARK,
  address: "moscow.himenkov.ru",
  port: 9443,
  sni: "moscow.himenkov.ru",
  fingerprint: "chrome",
  securityLayer: "DEFAULT",
  allowInsecure: false,
  isDisabled: false,
  isHidden: false,
  nodes: [NODE_UUID],
  excludedInternalSquads: [],
  excludeFromSubscriptionTypes: [],
};
const existingHomeWifiHost = hosts.find((host) => host.remark === HOST_REMARK || host.port === 9443);
const hostAfter = existingHomeWifiHost
  ? await api("PATCH", "/hosts", { uuid: existingHomeWifiHost.uuid, ...hostBody })
  : await api("POST", "/hosts", hostBody);
writeJson(dir, existingHomeWifiHost ? "host.home-wifi.update.response.json" : "host.home-wifi.create.response.json", hostAfter);

const squadsBefore = await api("GET", "/internal-squads");
writeJson(dir, "internal-squads.before.json", squadsBefore);
const squads = squadsBefore.response?.internalSquads || [];
const existingSquad = squads.find((squad) => squad.name === SQUAD_NAME);
const squadBody = {
  name: SQUAD_NAME,
  inbounds: [homeWifiInbound.uuid],
};
const squadAfter = existingSquad
  ? await api("PATCH", "/internal-squads", { uuid: existingSquad.uuid, ...squadBody })
  : await api("POST", "/internal-squads", squadBody);
writeJson(dir, existingSquad ? "internal-squad.update.response.json" : "internal-squad.create.response.json", squadAfter);

const hostsAfter = await api("GET", "/hosts");
const squadsAfter = await api("GET", "/internal-squads");
writeJson(dir, "hosts.after.json", hostsAfter);
writeJson(dir, "internal-squads.after.json", squadsAfter);

const restartAfter = await api("POST", `/nodes/${NODE_UUID}/actions/restart`);
writeJson(dir, "node.restart.response.json", restartAfter);

console.log(JSON.stringify({
  backupDir: dir,
  inbound: { uuid: homeWifiInbound.uuid, tag: homeWifiInbound.tag, port: homeWifiInbound.port },
  host: { uuid: hostAfter.uuid || hostAfter.response?.uuid, remark: HOST_REMARK, port: 9443 },
  squad: { uuid: squadAfter.uuid || squadAfter.response?.uuid, name: SQUAD_NAME },
  restart: restartAfter.response || restartAfter,
}, null, 2));
