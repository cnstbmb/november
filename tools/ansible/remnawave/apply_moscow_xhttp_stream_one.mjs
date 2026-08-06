#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const TOKEN_ENV = path.join(ROOT, ".private/ansible/prod/remnashop/.env");
const API_BASE = process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api";
const PROFILE_UUID = "ba4464ac-3ca1-4599-8047-53300afe0d43";
const NODE_UUID = "51a6f00b-0b03-4228-926c-8a031ba88c65";
const XHTTP_TAG = "VLESS_XHTTP_MOSCOW";
const XHTTP_HOST = "moscow.himenkov.ru";
const XHTTP_PATH = "/fluegergeheimer-xhttp/";
const XHTTP_MODE = "stream-one";
const XHTTP_OUTBOUND = process.env.REMNAWAVE_MOSCOW_XHTTP_OUTBOUND || null;
const XHTTP_EXTRA_PARAMS = {
  xmux: {
    maxConcurrency: "16-32",
    maxConnections: 0,
    cMaxReuseTimes: 0,
    hMaxRequestTimes: "600-900",
    hMaxReusableSecs: "1800-3000",
    hKeepAlivePeriod: 0,
  },
};
const LOCAL_PROFILE_PATHS = [
  path.join(ROOT, ".private/configs/MASTER_NODE.json"),
  path.join(
    ROOT,
    ".private/ansible/prod/remnawave-topology/profiles/02-master-moscow.himenkov.ru.profile.json",
  ),
];
const MOSCOW_SERVICE_INBOUNDS = [
  "VLESS_REALITY_MOSCOW",
  "BRIDGE_MASTER_IN",
  XHTTP_TAG,
  "VLESS_REALITY_HOME_WIFI",
  "HYSTERIA2_MOSCOW",
];
const MOSCOW_SERVICE_DOMAINS = [
  "domain:sub.moscow.himenkov.ru",
  "domain:panel.moscow.himenkov.ru",
  "domain:bot.moscow.himenkov.ru",
  "domain:moscow.himenkov.ru",
];
const MOSCOW_SELF_IP = "193.124.64.187";

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(TOKEN_ENV, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${TOKEN_ENV}`);
  return (match[1] || match[2] || match[3]).trim();
}

function backupDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(ROOT, ".private/backups/moscow-xhttp-stream-one", stamp);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function writeLocalProfile(file, config) {
  const temp = `${file}.xhttp-update-${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
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

function hardenMoscowXhttpInbound(config) {
  const inbound = config.inbounds.find((item) => item.tag === XHTTP_TAG);
  if (!inbound) throw new Error(`${XHTTP_TAG} not found in MASTER_NODE profile`);

  const xhttpSettings = inbound.streamSettings?.xhttpSettings;
  if (!xhttpSettings) throw new Error(`${XHTTP_TAG} has no xhttpSettings`);

  xhttpSettings.host = XHTTP_HOST;
  xhttpSettings.path = XHTTP_PATH;
  xhttpSettings.mode = XHTTP_MODE;
  xhttpSettings.scMaxBufferedPosts ??= 30;
  xhttpSettings.scMaxEachPostBytes ??= "1000000";
  xhttpSettings.scStreamUpServerSecs ??= "20-80";
}

function sameArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isMoscowServiceBypassRule(rule) {
  return (
    rule?.type === "field" &&
    rule.outboundTag === "IPv4" &&
    rule.inboundTag?.includes?.(XHTTP_TAG) &&
    sameArray(rule.domain || [], MOSCOW_SERVICE_DOMAINS)
  );
}

function isMoscowSelf443BypassRule(rule) {
  return (
    rule?.type === "field" &&
    rule.outboundTag === "IPv4" &&
    rule.port === "443" &&
    rule.inboundTag?.includes?.(XHTTP_TAG) &&
    sameArray(rule.ip || [], [MOSCOW_SELF_IP])
  );
}

function addMoscowServiceBypass(config) {
  const rules = config.routing?.rules;
  if (!Array.isArray(rules)) throw new Error("MASTER_NODE profile has no routing.rules array");

  const bypassRules = [
    {
      type: "field",
      domain: MOSCOW_SERVICE_DOMAINS,
      inboundTag: MOSCOW_SERVICE_INBOUNDS,
      outboundTag: "IPv4",
    },
    {
      type: "field",
      ip: [MOSCOW_SELF_IP],
      port: "443",
      inboundTag: MOSCOW_SERVICE_INBOUNDS,
      outboundTag: "IPv4",
    },
  ];

  config.routing.rules = rules.filter(
    (rule) => !isMoscowServiceBypassRule(rule) && !isMoscowSelf443BypassRule(rule),
  );

  const insertionIndex = config.routing.rules.findIndex(
    (rule) =>
      rule?.inboundTag?.includes?.(XHTTP_TAG) &&
      !rule.domain &&
      !rule.ip &&
      !rule.port &&
      !rule.balancerTag,
  );
  if (insertionIndex >= 0) config.routing.rules.splice(insertionIndex, 0, ...bypassRules);
  else config.routing.rules.push(...bypassRules);
}

function routeMoscowXhttpDirect(config) {
  const rules = config.routing?.rules;
  if (!Array.isArray(rules)) throw new Error("MASTER_NODE profile has no routing.rules array");

  const rule = rules.find(
    (item) =>
      item?.type === "field" &&
      item.inboundTag?.length === 1 &&
      item.inboundTag[0] === XHTTP_TAG &&
      !item.domain &&
      !item.ip &&
      !item.port &&
      !item.balancerTag,
  );
  if (!rule) throw new Error(`${XHTTP_TAG} default routing rule not found`);
  if (XHTTP_OUTBOUND) rule.outboundTag = XHTTP_OUTBOUND;
  return rule.outboundTag;
}

function hostTargets(hosts, inboundUuid) {
  return hosts.filter((host) => {
    const boundInboundUuid = host.inbound?.configProfileInboundUuid;
    return host.remark === "MOSCOW" || boundInboundUuid === inboundUuid;
  });
}

function hostPatch(host, inboundUuid) {
  return {
    uuid: host.uuid,
    inbound: {
      configProfileUuid: PROFILE_UUID,
      configProfileInboundUuid: inboundUuid,
    },
    remark: host.remark,
    address: XHTTP_HOST,
    port: 443,
    path: XHTTP_PATH,
    sni: XHTTP_HOST,
    host: XHTTP_HOST,
    alpn: "h2,http/1.1",
    fingerprint: host.fingerprint || "chrome",
    securityLayer: "TLS",
    xHttpExtraParams: XHTTP_EXTRA_PARAMS,
    muxParams: host.muxParams || null,
    sockoptParams: host.sockoptParams || null,
    finalMask: host.finalMask || null,
    allowInsecure: false,
    shuffleHost: false,
    mihomoX25519: false,
    isDisabled: false,
    isHidden: host.isHidden || false,
    overrideSniFromAddress: false,
    keepSniBlank: false,
    nodes: host.nodes || [NODE_UUID],
    excludedInternalSquads: host.excludedInternalSquads || [],
    excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes || [],
  };
}

const TOKEN = readToken();
const dir = backupDir();

const profileBefore = await api("GET", `/config-profiles/${PROFILE_UUID}`);
writeJson(dir, "profile.before.json", profileBefore);

const config = profileBefore.response.config;
hardenMoscowXhttpInbound(config);
addMoscowServiceBypass(config);
const xhttpOutbound = routeMoscowXhttpDirect(config);
writeJson(dir, "profile.patch.json", { uuid: PROFILE_UUID, config });
const profileAfter = await api("PATCH", "/config-profiles", { uuid: PROFILE_UUID, config });
writeJson(dir, "profile.patch.response.json", profileAfter);

const inboundsAfter = await api("GET", `/config-profiles/${PROFILE_UUID}/inbounds`);
writeJson(dir, "profile-inbounds.after.json", inboundsAfter);
const inboundList = Array.isArray(inboundsAfter.response)
  ? inboundsAfter.response
  : inboundsAfter.response?.inbounds || [];
const moscowXhttpInbound = inboundList.find((inbound) => inbound.tag === XHTTP_TAG);
if (!moscowXhttpInbound) throw new Error(`${XHTTP_TAG} was not returned by Remnawave`);

const hostsBefore = await api("GET", "/hosts");
writeJson(dir, "hosts.before.json", hostsBefore);
const targets = hostTargets(hostsBefore.response || [], moscowXhttpInbound.uuid);
if (targets.length === 0) throw new Error(`No hosts bound to ${XHTTP_TAG} were found`);

const hostUpdates = [];
for (const host of targets) {
  const patch = hostPatch(host, moscowXhttpInbound.uuid);
  writeJson(dir, `host.${host.remark.replace(/[^a-zA-Z0-9_-]/g, "_")}.patch.json`, patch);
  const updated = await api("PATCH", "/hosts", patch);
  writeJson(dir, `host.${host.remark.replace(/[^a-zA-Z0-9_-]/g, "_")}.patch.response.json`, updated);
  hostUpdates.push({
    uuid: host.uuid,
    remark: host.remark,
    address: patch.address,
    port: patch.port,
    path: patch.path,
    mode: XHTTP_MODE,
    xHttpExtraParams: patch.xHttpExtraParams,
  });
}

const restartAfter = await api("POST", `/nodes/${NODE_UUID}/actions/restart`);
writeJson(dir, "node.restart.response.json", restartAfter);

const hostsAfter = await api("GET", "/hosts");
writeJson(dir, "hosts.after.json", hostsAfter);
const profileFinal = await api("GET", `/config-profiles/${PROFILE_UUID}`);
writeJson(dir, "profile.after.json", profileFinal);
for (const file of LOCAL_PROFILE_PATHS) {
  writeLocalProfile(file, profileFinal.response.config);
}

console.log(JSON.stringify({
  backupDir: dir,
  profile: {
    uuid: PROFILE_UUID,
    inbound: XHTTP_TAG,
    serverMode: XHTTP_MODE,
    outbound: xhttpOutbound,
  },
  hosts: hostUpdates,
  localProfilesSynchronized: LOCAL_PROFILE_PATHS.map((file) => path.relative(ROOT, file)),
  restart: restartAfter.response || restartAfter,
}, null, 2));
