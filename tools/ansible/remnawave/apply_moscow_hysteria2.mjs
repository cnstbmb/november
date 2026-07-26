#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const TOKEN_ENV = path.join(ROOT, ".private/ansible/prod/remnashop/.env");
const API_BASE = process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api";
const PROFILE_UUID = "ba4464ac-3ca1-4599-8047-53300afe0d43";
const NODE_UUID = "fd23ab8a-e142-42f9-9cef-000656cf7eb1";
const TAG = "HYSTERIA2_MOSCOW";
const HOST_REMARK = "MOSCOW HYSTERIA2";
const PUBLIC_SQUAD_NAME = "Public Squad";
const MOSCOW_HOST = "moscow.himenkov.ru";
const MOSCOW_PUBLIC_IP = "5.42.111.142";
const HYSTERIA_PORT = Number(process.env.REMNAWAVE_MOSCOW_HYSTERIA2_PORT || 443);
const DEFAULT_OUTBOUND = "GRPC_TO_EXIT";
const SHARED_MOSCOW_INBOUNDS = [
  "VLESS_REALITY_MOSCOW",
  "BRIDGE_MASTER_IN",
  "VLESS_XHTTP_MOSCOW",
  "VLESS_REALITY_HOME_WIFI",
];
const MOSCOW_SERVICE_DOMAINS = [
  "domain:sub.moscow.himenkov.ru",
  "domain:panel.moscow.himenkov.ru",
  "domain:bot.moscow.himenkov.ru",
  "domain:moscow.himenkov.ru",
];
const LOCAL_PROFILE_PATHS = [
  path.join(ROOT, ".private/configs/MASTER_NODE.json"),
  path.join(ROOT, ".private/ansible/prod/remnawave-topology/profiles/02-master-moscow.himenkov.ru.profile.json"),
];

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(TOKEN_ENV, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${TOKEN_ENV}`);
  return (match[1] || match[2] || match[3]).trim();
}

function backupDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(ROOT, ".private/backups/moscow-hysteria2", stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n");
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

function hysteriaInbound() {
  return {
    tag: TAG,
    port: HYSTERIA_PORT,
    listen: "0.0.0.0",
    protocol: "hysteria",
    settings: {
      clients: [],
      version: 2,
    },
    sniffing: {
      enabled: true,
      routeOnly: true,
      destOverride: ["http", "tls", "quic"],
      metadataOnly: false,
    },
    streamSettings: {
      network: "hysteria",
      security: "tls",
      tlsSettings: {
        alpn: ["h3"],
        maxVersion: "1.3",
        minVersion: "1.3",
        serverName: MOSCOW_HOST,
        certificates: [
          {
            usage: "encipherment",
            keyFile: `/etc/letsencrypt/live/${MOSCOW_HOST}/privkey.pem`,
            certificateFile: `/etc/letsencrypt/live/${MOSCOW_HOST}/fullchain.pem`,
          },
        ],
      },
      hysteriaSettings: {
        version: 2,
        masquerade: {
          url: `https://${MOSCOW_HOST}/`,
          type: "proxy",
          insecure: false,
          rewriteHost: true,
        },
        udpIdleTimeout: 60,
      },
    },
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasAnyMoscowClientTag(rule) {
  return Array.isArray(rule.inboundTag) && rule.inboundTag.some((tag) => SHARED_MOSCOW_INBOUNDS.includes(tag));
}

function shouldShareMoscowRule(rule) {
  if (!hasAnyMoscowClientTag(rule)) return false;
  if (rule.outboundTag === "BLOCK") return true;
  if (rule.outboundTag !== "IPv4") return false;
  if (Array.isArray(rule.domain) && rule.domain.includes("geosite:youtube")) return true;
  if (Array.isArray(rule.domain) && MOSCOW_SERVICE_DOMAINS.every((domain) => rule.domain.includes(domain))) {
    return true;
  }
  if (Array.isArray(rule.ip) && rule.ip.includes(MOSCOW_PUBLIC_IP) && rule.port === "443") return true;
  return false;
}

function isDefaultRouteFor(tag) {
  return (rule) =>
    rule?.type === "field" &&
    Array.isArray(rule.inboundTag) &&
    rule.inboundTag.length === 1 &&
    rule.inboundTag[0] === tag &&
    !rule.domain &&
    !rule.ip &&
    !rule.port &&
    !rule.balancerTag &&
    !rule.protocol;
}

function ensureInboundAndRoutes(config) {
  if (!Array.isArray(config.inbounds)) throw new Error("MASTER_NODE profile has no inbounds array");
  if (!Array.isArray(config.routing?.rules)) throw new Error("MASTER_NODE profile has no routing.rules array");

  config.inbounds = config.inbounds.filter((inbound) => inbound.tag !== TAG);
  const xhttpIndex = config.inbounds.findIndex((inbound) => inbound.tag === "VLESS_XHTTP_MOSCOW");
  const insertIndex = xhttpIndex >= 0 ? xhttpIndex + 1 : config.inbounds.length;
  config.inbounds.splice(insertIndex, 0, hysteriaInbound());

  for (const rule of config.routing.rules) {
    if (!Array.isArray(rule.inboundTag)) continue;
    rule.inboundTag = rule.inboundTag.filter((tag) => tag !== TAG);
    if (shouldShareMoscowRule(rule)) {
      rule.inboundTag = unique([...rule.inboundTag, TAG]);
    }
  }

  config.routing.rules = config.routing.rules.filter((rule) => {
    if (!Array.isArray(rule.inboundTag)) return true;
    if (rule.inboundTag.length === 0) return false;
    return !isDefaultRouteFor(TAG)(rule);
  });

  config.routing.rules.push({
    type: "field",
    inboundTag: [TAG],
    outboundTag: DEFAULT_OUTBOUND,
  });
}

function responseList(data, key) {
  if (Array.isArray(data?.response)) return data.response;
  if (Array.isArray(data?.response?.[key])) return data.response[key];
  if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function hostBody(inboundUuid) {
  return {
    inbound: {
      configProfileUuid: PROFILE_UUID,
      configProfileInboundUuid: inboundUuid,
    },
    remark: HOST_REMARK,
    address: MOSCOW_HOST,
    port: HYSTERIA_PORT,
    sni: MOSCOW_HOST,
    alpn: "h3",
    fingerprint: "chrome",
    securityLayer: "TLS",
    allowInsecure: false,
    isDisabled: false,
    isHidden: false,
    nodes: [NODE_UUID],
    excludedInternalSquads: [],
    excludeFromSubscriptionTypes: [],
  };
}

function writeLocalProfiles(config, dir) {
  for (const file of LOCAL_PROFILE_PATHS) {
    if (!fs.existsSync(file)) continue;
    writeJson(dir, `${path.basename(file)}.before-local.json`, JSON.parse(fs.readFileSync(file, "utf8")));
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    writeJson(dir, `${path.basename(file)}.after-local.json`, config);
  }
}

const TOKEN = readToken();
const dir = backupDir();

const profileBefore = await api("GET", `/config-profiles/${PROFILE_UUID}`);
writeJson(dir, "profile.before.json", profileBefore);

const config = profileBefore.response.config;
ensureInboundAndRoutes(config);
writeJson(dir, "profile.patch.json", { uuid: PROFILE_UUID, config });

const profileAfterPatch = await api("PATCH", "/config-profiles", { uuid: PROFILE_UUID, config });
writeJson(dir, "profile.patch.response.json", profileAfterPatch);

const patchedConfig = profileAfterPatch.response?.config || config;
writeLocalProfiles(patchedConfig, dir);

const inboundsAfter = await api("GET", `/config-profiles/${PROFILE_UUID}/inbounds`);
writeJson(dir, "profile-inbounds.after.json", inboundsAfter);
const inboundList = responseList(inboundsAfter, "inbounds");
const hysteriaInboundAfter = inboundList.find((inbound) => inbound.tag === TAG);
if (!hysteriaInboundAfter) throw new Error(`${TAG} inbound was not returned by Remnawave`);

const nodesBefore = await api("GET", "/nodes");
writeJson(dir, "nodes.before.json", nodesBefore);
const targetNode = responseList(nodesBefore, "nodes").find((node) => node.uuid === NODE_UUID);
if (!targetNode) throw new Error(`Node ${NODE_UUID} was not returned by Remnawave`);
const activeInboundUuids = (targetNode.configProfile?.activeInbounds || []).map((inbound) => inbound.uuid);
if (!activeInboundUuids.includes(hysteriaInboundAfter.uuid)) {
  const nodePatch = {
    uuid: NODE_UUID,
    configProfile: {
      activeConfigProfileUuid: PROFILE_UUID,
      activeInbounds: [...activeInboundUuids, hysteriaInboundAfter.uuid],
    },
  };
  writeJson(dir, "node.patch.json", nodePatch);
  const nodeAfterPatch = await api("PATCH", "/nodes", nodePatch);
  writeJson(dir, "node.patch.response.json", nodeAfterPatch);
}

const hostsBefore = await api("GET", "/hosts");
writeJson(dir, "hosts.before.json", hostsBefore);
const hosts = responseList(hostsBefore, "hosts");
const existingHost = hosts.find(
  (host) =>
    host.remark === HOST_REMARK ||
    host.inbound?.configProfileInboundUuid === hysteriaInboundAfter.uuid,
);
const hostPatch = hostBody(hysteriaInboundAfter.uuid);
writeJson(dir, existingHost ? "host.update.json" : "host.create.json", existingHost ? { uuid: existingHost.uuid, ...hostPatch } : hostPatch);
const hostAfter = existingHost
  ? await api("PATCH", "/hosts", { uuid: existingHost.uuid, ...hostPatch })
  : await api("POST", "/hosts", hostPatch);
writeJson(dir, existingHost ? "host.update.response.json" : "host.create.response.json", hostAfter);

const squadsBefore = await api("GET", "/internal-squads");
writeJson(dir, "internal-squads.before.json", squadsBefore);
const squads = responseList(squadsBefore, "internalSquads");
const publicSquad = squads.find((squad) => squad.name === PUBLIC_SQUAD_NAME);
if (!publicSquad) throw new Error(`${PUBLIC_SQUAD_NAME} was not returned by Remnawave`);
const publicSquadInboundUuids = unique([
  ...(publicSquad.inbounds || []).map((inbound) => inbound.uuid),
  hysteriaInboundAfter.uuid,
]);
const squadPatch = {
  uuid: publicSquad.uuid,
  name: publicSquad.name,
  inbounds: publicSquadInboundUuids,
};
writeJson(dir, "internal-squad.public.patch.json", squadPatch);
const squadAfter = await api("PATCH", "/internal-squads", squadPatch);
writeJson(dir, "internal-squad.public.patch.response.json", squadAfter);

const hostsAfter = await api("GET", "/hosts");
const squadsAfter = await api("GET", "/internal-squads");
writeJson(dir, "hosts.after.json", hostsAfter);
writeJson(dir, "internal-squads.after.json", squadsAfter);

const restartAfter = await api("POST", `/nodes/${NODE_UUID}/actions/restart`);
writeJson(dir, "node.restart.response.json", restartAfter);

console.log(JSON.stringify({
  backupDir: dir,
  inbound: {
    uuid: hysteriaInboundAfter.uuid,
    tag: hysteriaInboundAfter.tag,
    port: HYSTERIA_PORT,
    network: hysteriaInboundAfter.network,
    security: hysteriaInboundAfter.security,
  },
  host: {
    uuid: hostAfter.uuid || hostAfter.response?.uuid,
    remark: HOST_REMARK,
    address: MOSCOW_HOST,
    port: HYSTERIA_PORT,
  },
  publicSquad: {
    uuid: publicSquad.uuid,
    inboundCount: publicSquadInboundUuids.length,
  },
  route: {
    defaultOutbound: DEFAULT_OUTBOUND,
    ruTraffic: "HOME_OR_MOSCOW",
    youtube: "IPv4",
    selfIp: MOSCOW_PUBLIC_IP,
  },
  restart: restartAfter.response || restartAfter,
}, null, 2));
