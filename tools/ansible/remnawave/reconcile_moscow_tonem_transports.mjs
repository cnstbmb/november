#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  profileWithoutLegacyTransportDomains,
  profileWithTonemTransportDomains,
  transportDomainDrift,
  transportLegacyRetirementDrift,
} from "./moscow_tonem_transports.mjs";
import { parseProfileConfig } from "./tonem_xhttp_reconciler.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../..");
const privateRoot = path.join(rootDir, ".private");
const tokenEnvFile = path.join(privateRoot, "ansible/prod/remnashop/.env");
const backupDir = path.join(privateRoot, "backups/tonem-transports");
const backupKeyFile = path.join(privateRoot, "keys/tonem-xhttp-backup.key");
const profileUuid = "ba4464ac-3ca1-4599-8047-53300afe0d43";
const nodeUuid = "51a6f00b-0b03-4228-926c-8a031ba88c65";
const domain = "live.tonem.ru";
const legacyDomain = "moscow.himenkov.ru";
const hysteriaTag = "HYSTERIA2_MOSCOW";
const reserveTag = "VLESS_REALITY_HOME_WIFI";
const hysteriaRemark = "MOSCOW HYSTERIA2";
const reserveRemark = "MOSCOW RESERVE";
const localProfileFiles = [
  path.join(privateRoot, "configs/MASTER_NODE.json"),
  path.join(
    privateRoot,
    "ansible/prod/remnawave-topology/profiles/02-master-moscow.himenkov.ru.profile.json",
  ),
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(tokenEnvFile, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  assert(match, `REMNAWAVE_TOKEN not found in ${tokenEnvFile}`);
  return (match[1] || match[2] || match[3]).trim();
}

function apiBase() {
  return (process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api").replace(
    /\/$/,
    "",
  );
}

async function api(method, endpoint, body) {
  const response = await fetch(`${apiBase()}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${readToken()}`,
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
  return result?.response?.[key] ?? [];
}

function uuids(items) {
  return (items ?? []).map((item) => (typeof item === "string" ? item : item.uuid));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
}

function backupKey() {
  assert(fs.existsSync(backupKeyFile), "TONEM encrypted backup key is missing");
  const key = fs.readFileSync(backupKeyFile);
  assert(key.length === 32, "TONEM encrypted backup key must contain exactly 32 bytes");
  return key;
}

function encryptedBackup(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value))),
    cipher.final(),
  ]);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const file = path.join(backupDir, `${stamp}-moscow-tonem-transports.json.enc`);
  writeJsonAtomic(file, {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
  return file;
}

function hostPayload(host, inboundUuid, address, sni) {
  return {
    uuid: host.uuid,
    inbound: {
      configProfileUuid: profileUuid,
      configProfileInboundUuid: inboundUuid,
    },
    remark: host.remark,
    address,
    port: host.port,
    path: host.path ?? null,
    sni,
    host: host.host ?? null,
    alpn: host.alpn ?? null,
    fingerprint: host.fingerprint ?? "chrome",
    securityLayer: host.securityLayer ?? "DEFAULT",
    isDisabled: Boolean(host.isDisabled),
    isHidden: Boolean(host.isHidden),
    nodes: uuids(host.nodes).length > 0 ? uuids(host.nodes) : [nodeUuid],
    excludedInternalSquads: uuids(host.excludedInternalSquads),
    excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes ?? [],
  };
}

async function readState() {
  const [profileResult, inboundsResult, hostsResult, nodesResult] = await Promise.all([
    api("GET", `/config-profiles/${profileUuid}`),
    api("GET", `/config-profiles/${profileUuid}/inbounds`),
    api("GET", "/hosts"),
    api("GET", "/nodes"),
  ]);
  const profileConfig = parseProfileConfig(profileResult.response.config);
  const inbounds = responseList(inboundsResult, "inbounds");
  const hosts = responseList(hostsResult, "hosts");
  const nodes = responseList(nodesResult, "nodes");
  return {
    profileConfig,
    hysteriaInbound: inbounds.find((item) => item.tag === hysteriaTag),
    reserveInbound: inbounds.find((item) => item.tag === reserveTag),
    hysteriaHost: hosts.find((item) => item.remark === hysteriaRemark),
    reserveHost: hosts.find((item) => item.remark === reserveRemark),
    node: nodes.find((item) => item.uuid === nodeUuid),
  };
}

function validateState(state) {
  assert(state.hysteriaInbound, `${hysteriaTag} inbound is missing`);
  assert(state.reserveInbound, `${reserveTag} inbound is missing`);
  assert(state.hysteriaHost, `${hysteriaRemark} Host is missing`);
  assert(state.reserveHost, `${reserveRemark} Host is missing`);
  assert(state.node, "Moscow node is missing");
}

function summary(mode, state, encryptedBackupCreated = false, retainLegacy = true) {
  validateState(state);
  const hysteriaTls = state.profileConfig.inbounds.find(
    (item) => item.tag === hysteriaTag,
  ).streamSettings.tlsSettings;
  const reserveReality = state.profileConfig.inbounds.find(
    (item) => item.tag === reserveTag,
  ).streamSettings.realitySettings;
  const certificateFiles = (hysteriaTls.certificates ?? []).map(
    (item) => item.certificateFile,
  );
  return {
    mode,
    domain,
    profileDrift: retainLegacy
      ? transportDomainDrift(state.profileConfig, { domain, legacyDomain })
      : transportLegacyRetirementDrift(state.profileConfig, { domain, legacyDomain }),
    hysteria: {
      hostPresent: Boolean(state.hysteriaHost),
      subscriptionUsesTonem:
        state.hysteriaHost.address === domain && state.hysteriaHost.sni === domain,
      liveCertificateConfigured: certificateFiles.includes(
        `/etc/letsencrypt/live/${domain}/fullchain.pem`,
      ),
      legacyCertificateRetained: certificateFiles.includes(
        `/etc/letsencrypt/live/${legacyDomain}/fullchain.pem`,
      ),
    },
    reserve: {
      hostPresent: Boolean(state.reserveHost),
      subscriptionUsesTonem:
        state.reserveHost.address === domain && state.reserveHost.sni === domain,
      liveServerNameConfigured: (reserveReality.serverNames ?? []).includes(domain),
      legacyServerNameRetained: (reserveReality.serverNames ?? []).includes(legacyDomain),
    },
    encryptedBackupCreated,
  };
}

async function restartNode() {
  await api("POST", `/nodes/${nodeUuid}/actions/restart`, { forceRestart: true });
}

async function apply(retainLegacy = true) {
  const before = await readState();
  validateState(before);
  const desiredProfile = retainLegacy
    ? profileWithTonemTransportDomains(before.profileConfig, { domain, legacyDomain })
    : profileWithoutLegacyTransportDomains(before.profileConfig, { domain, legacyDomain });
  const localBefore = Object.fromEntries(
    localProfileFiles
      .filter((file) => fs.existsSync(file))
      .map((file) => [file, fs.readFileSync(file, "utf8")]),
  );
  encryptedBackup({
    profileConfig: before.profileConfig,
    hysteriaHost: before.hysteriaHost,
    reserveHost: before.reserveHost,
    node: before.node,
  });

  try {
    if (JSON.stringify(desiredProfile) !== JSON.stringify(before.profileConfig)) {
      await api("PATCH", "/config-profiles", { uuid: profileUuid, config: desiredProfile });
    }
    const afterProfile = await readState();
    validateState(afterProfile);
    const activeInboundUuids = uuids(afterProfile.node.configProfile?.activeInbounds);
    const requiredInboundUuids = [
      afterProfile.hysteriaInbound.uuid,
      afterProfile.reserveInbound.uuid,
    ];
    if (requiredInboundUuids.some((uuid) => !activeInboundUuids.includes(uuid))) {
      await api("PATCH", "/nodes", {
        uuid: nodeUuid,
        configProfile: {
          activeConfigProfileUuid: profileUuid,
          activeInbounds: [...new Set([...activeInboundUuids, ...requiredInboundUuids])],
        },
      });
    }
    await api(
      "PATCH",
      "/hosts",
      hostPayload(afterProfile.hysteriaHost, afterProfile.hysteriaInbound.uuid, domain, domain),
    );
    await api(
      "PATCH",
      "/hosts",
      hostPayload(afterProfile.reserveHost, afterProfile.reserveInbound.uuid, domain, domain),
    );
    for (const file of localProfileFiles) {
      if (fs.existsSync(file)) writeJsonAtomic(file, desiredProfile);
    }
    await restartNode();
    const verified = await readState();
    const result = summary(retainLegacy ? "applied" : "legacy-retired", verified, true, retainLegacy);
    assert(result.profileDrift === false, "Profile verification failed");
    assert(result.hysteria.subscriptionUsesTonem, "Hysteria2 Host verification failed");
    assert(result.reserve.subscriptionUsesTonem, "Reserve Host verification failed");
    if (!retainLegacy) {
      assert(!result.hysteria.legacyCertificateRetained, "Legacy Hysteria2 certificate remains");
      assert(!result.reserve.legacyServerNameRetained, "Legacy Reserve serverName remains");
    }
    return result;
  } catch (error) {
    await api("PATCH", "/config-profiles", {
      uuid: profileUuid,
      config: before.profileConfig,
    }).catch(() => undefined);
    const rolledBack = await readState().catch(() => null);
    if (rolledBack) {
      await api(
        "PATCH",
        "/hosts",
        hostPayload(
          before.hysteriaHost,
          rolledBack.hysteriaInbound?.uuid ?? before.hysteriaInbound.uuid,
          before.hysteriaHost.address,
          before.hysteriaHost.sni,
        ),
      ).catch(() => undefined);
      await api(
        "PATCH",
        "/hosts",
        hostPayload(
          before.reserveHost,
          rolledBack.reserveInbound?.uuid ?? before.reserveInbound.uuid,
          before.reserveHost.address,
          before.reserveHost.sni,
        ),
      ).catch(() => undefined);
    }
    for (const [file, contents] of Object.entries(localBefore)) {
      fs.writeFileSync(file, contents, { mode: 0o600 });
    }
    await restartNode().catch(() => undefined);
    throw new Error(`TONEM transport migration rolled back: ${error.message}`);
  }
}

const args = new Set(process.argv.slice(2));
const overlapCheck = args.size === 1 && args.has("--check");
const overlapApply = args.size === 1 && args.has("--apply");
const retiredCheck = args.size === 1 && args.has("--check-retired");
const retireApply =
  args.size === 2 && args.has("--retire-legacy") && args.has("--apply");
assert(
  overlapCheck || overlapApply || retiredCheck || retireApply,
  "Use --check, --apply, --check-retired, or --retire-legacy --apply",
);
let result;
if (overlapApply) result = await apply(true);
else if (retireApply) result = await apply(false);
else result = summary(retiredCheck ? "check-retired" : "check", await readState(), false, !retiredCheck);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
