#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateConfig } from "./tonem_xhttp_config.mjs";
import {
  canCleanupCanaryArtifacts,
  canRetire,
  parseProfileConfig,
  profileWithCanary,
  profileWithoutLegacy,
  userSquadUpdatePayload,
  xhttpHostPayload,
} from "./tonem_xhttp_reconciler.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../..");
const privateRoot = path.join(rootDir, ".private");
const configFile = path.join(privateRoot, "ansible/prod/remnawave-tonem-xhttp.json");
const tokenEnvFile = path.join(privateRoot, "ansible/prod/remnashop/.env");
const backupDir = path.join(privateRoot, "backups/tonem-xhttp");
const backupKeyFile = path.join(privateRoot, "keys/tonem-xhttp-backup.key");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
}

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(tokenEnvFile, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${tokenEnvFile}`);
  return (match[1] || match[2] || match[3]).trim();
}

function readApiBase() {
  return (
    process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api"
  ).replace(/\/$/, "");
}

async function api(method, endpoint, body) {
  const response = await fetch(`${readApiBase()}${endpoint}`, {
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
  return result?.response?.[key] || [];
}

function inboundRefs(squads) {
  return squads.flatMap((squad) => squad.inbounds ?? []);
}

function uuids(items) {
  return (items ?? []).map((item) => (typeof item === "string" ? item : item.uuid));
}

function hostRestorePayload(host) {
  const payload = {
    uuid: host.uuid,
    inbound: host.inbound,
    remark: host.remark,
    address: host.address,
    port: host.port,
    path: host.path ?? null,
    sni: host.sni ?? null,
    host: host.host ?? null,
    alpn: host.alpn ?? null,
    fingerprint: host.fingerprint ?? null,
    securityLayer: host.securityLayer ?? "DEFAULT",
    isDisabled: Boolean(host.isDisabled),
    isHidden: Boolean(host.isHidden),
    nodes: uuids(host.nodes),
    excludedInternalSquads: uuids(host.excludedInternalSquads),
    excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes ?? [],
  };
  return payload;
}

async function readState(target) {
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
  const refs = inboundRefs(squads);
  const legacyRef = refs.find((item) => item.tag === target.legacyInboundTag);
  const canaryRefFromSquad = refs.find((item) => item.tag === target.canaryInboundTag);
  assert(legacyRef || canaryRefFromSquad, "Neither legacy nor canary inbound is discoverable through squads");
  const profileUuid = legacyRef?.profileUuid || canaryRefFromSquad.profileUuid;
  const [profileResult, inboundsResult] = await Promise.all([
    api("GET", `/config-profiles/${profileUuid}`),
    api("GET", `/config-profiles/${profileUuid}/inbounds`),
  ]);
  const profileConfig = parseProfileConfig(profileResult.response.config);
  const profileInbounds = responseList(inboundsResult, "inbounds");
  const legacyInbound = profileInbounds.find((item) => item.tag === target.legacyInboundTag);
  const canaryInbound = profileInbounds.find((item) => item.tag === target.canaryInboundTag);
  const activeNeedle = canaryInbound?.uuid || legacyInbound?.uuid;
  const node = nodes.find((item) =>
    (item.configProfile?.activeInbounds ?? []).some(
      (inbound) => inbound.uuid === activeNeedle || inbound.tag === target.legacyInboundTag,
    ),
  );
  return {
    hosts,
    squads,
    users,
    nodes,
    profileUuid,
    profileConfig,
    legacyInbound,
    canaryInbound,
    node,
    productionHost: hosts.find((item) => item.remark === target.productionHostRemark),
    canaryHost: hosts.find((item) => item.remark === target.canaryHostRemark),
    canarySquad: squads.find((item) => item.name === target.canarySquadName),
    productionSquads: (target.productionSquadNames ?? []).map((name) =>
      squads.find((item) => item.name === name),
    ),
    canaryUser: users.find((item) => item.shortUuid === target.canaryUserShortUuid),
  };
}

function backupKey() {
  if (!fs.existsSync(backupKeyFile)) {
    fs.mkdirSync(path.dirname(backupKeyFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(backupKeyFile, crypto.randomBytes(32), { mode: 0o600 });
  }
  const key = fs.readFileSync(backupKeyFile);
  assert(key.length === 32, "TONEM XHTTP backup key must contain exactly 32 bytes");
  return key;
}

function encryptedBackup(label, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const file = path.join(backupDir, `${stamp}-${label}.json.enc`);
  writeJsonAtomic(file, {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
  return file;
}

function pruneExpiredBackups(retentionDays, now = Date.now()) {
  if (!fs.existsSync(backupDir)) return 0;
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json.enc")) continue;
    const file = path.join(backupDir, entry.name);
    if (fs.statSync(file).mtimeMs < cutoff) {
      fs.rmSync(file);
      removed += 1;
    }
  }
  return removed;
}

function stateBackup(state) {
  return {
    profileUuid: state.profileUuid,
    profileConfig: state.profileConfig,
    node: state.node,
    productionHost: state.productionHost,
    canaryHost: state.canaryHost,
    canarySquad: state.canarySquad,
    productionSquads: state.productionSquads,
    canaryUser: state.canaryUser,
  };
}

function summary(targetName, target, state) {
  return {
    mode: "check",
    target: targetName,
    enabled: target.enabled,
    domain: target.domain,
    publicIpv4Configured: Boolean(target.publicIpv4),
    legacyInboundPresent: Boolean(state.legacyInbound),
    canaryInboundPresent: Boolean(state.canaryInbound),
    nodeFound: Boolean(state.node),
    canaryActiveOnNode: Boolean(
      state.canaryInbound &&
        (state.node?.configProfile?.activeInbounds ?? []).some(
          (item) => item.uuid === state.canaryInbound.uuid,
        ),
    ),
    productionHostPresent: Boolean(state.productionHost),
    canaryHostPresent: Boolean(state.canaryHost),
    canarySquadPresent: Boolean(state.canarySquad),
    canaryUserConfigured: Boolean(target.canaryUserShortUuid),
    canaryUserFound: Boolean(state.canaryUser),
    productionSquadsConfigured: (target.productionSquadNames ?? []).length > 0,
    productionSquadsFound: state.productionSquads.every(Boolean),
    legacySquadNames: state.squads
      .filter((squad) =>
        (squad.inbounds ?? []).some((inbound) => inbound.tag === target.legacyInboundTag),
      )
      .map((squad) => squad.name)
      .sort(),
    canaryApprovedAt: target.canaryApprovedAt ?? null,
    cutoverAt: target.cutoverAt ?? null,
    retiredAt: target.retiredAt ?? null,
    pathConfigured: Boolean(target.path),
  };
}

async function restartNode(node) {
  await api("POST", `/nodes/${node.uuid}/actions/restart`, { forceRestart: true });
}

async function prepareCanary(targetName, target) {
  assert(target.enabled, `${targetName} target is disabled`);
  assert(target.canaryUserShortUuid, `${targetName}.canaryUserShortUuid must be configured`);
  const before = await readState(target);
  assert(before.node, "Target node was not found from active legacy inbound");
  assert(before.canaryUser, "Canary user was not found");
  assert(before.productionHost, "Production Host was not found");
  const backupFile = encryptedBackup(`${targetName}-prepare-canary`, stateBackup(before));
  const nextProfile = profileWithCanary(before.profileConfig, target);
  let createdHost = false;
  let createdSquad = false;
  let userSquadsChanged = false;
  try {
    if (JSON.stringify(nextProfile) !== JSON.stringify(before.profileConfig)) {
      await api("PATCH", "/config-profiles", {
        uuid: before.profileUuid,
        config: nextProfile,
      });
    }
    const prepared = await readState(target);
    assert(prepared.canaryInbound, "Canary inbound was not returned after profile update");
    const activeUuids = uuids(prepared.node.configProfile?.activeInbounds);
    if (!activeUuids.includes(prepared.canaryInbound.uuid)) {
      await api("PATCH", "/nodes", {
        uuid: prepared.node.uuid,
        configProfile: {
          activeConfigProfileUuid: prepared.profileUuid,
          activeInbounds: [...activeUuids, prepared.canaryInbound.uuid],
        },
      });
      await restartNode(prepared.node);
    }

    let canarySquad = prepared.canarySquad;
    if (canarySquad) {
      assert(
        JSON.stringify(uuids(canarySquad.inbounds)) === JSON.stringify([prepared.canaryInbound.uuid]),
        "Existing canary squad has unexpected inbounds; refusing to overwrite it",
      );
    } else {
      const result = await api("POST", "/internal-squads", {
        name: target.canarySquadName,
        inbounds: [prepared.canaryInbound.uuid],
      });
      canarySquad = result.response ?? result;
      createdSquad = true;
    }

    if (prepared.canaryHost) {
      assert(
        prepared.canaryHost.address === target.domain &&
          prepared.canaryHost.path === target.path &&
          prepared.canaryHost.inbound?.configProfileInboundUuid === prepared.canaryInbound.uuid,
        "Existing canary Host does not match private state; refusing to overwrite it",
      );
    } else {
      await api(
        "POST",
        "/hosts",
        xhttpHostPayload(target, prepared.profileUuid, prepared.canaryInbound.uuid, [
          prepared.node.uuid,
        ]),
      );
      userSquadsChanged = true;
      createdHost = true;
    }

    const currentUserSquads = uuids(prepared.canaryUser.activeInternalSquads);
    if (!currentUserSquads.includes(canarySquad.uuid)) {
      await api(
        "PATCH",
        "/users",
        userSquadUpdatePayload(prepared.canaryUser, [...currentUserSquads, canarySquad.uuid]),
      );
    }
    const verified = await readState(target);
    const result = summary(targetName, target, verified);
    assert(result.canaryInboundPresent && result.canaryActiveOnNode, "Canary inbound verification failed");
    assert(result.canaryHostPresent && result.canarySquadPresent, "Canary subscription objects are missing");
    return { ...result, mode: "prepared-canary", encryptedBackupCreated: Boolean(backupFile) };
  } catch (error) {
    if (userSquadsChanged) {
      await api(
        "PATCH",
        "/users",
        userSquadUpdatePayload(before.canaryUser, uuids(before.canaryUser.activeInternalSquads)),
      ).catch(() => undefined);
    }
    if (createdHost) {
      const current = await readState(target).catch(() => null);
      if (current?.canaryHost) {
        await api("DELETE", `/hosts/${current.canaryHost.uuid}`).catch(() => undefined);
      }
    }
    if (createdSquad) {
      const current = await readState(target).catch(() => null);
      if (current?.canarySquad) {
        await api("DELETE", `/internal-squads/${current.canarySquad.uuid}`).catch(
          () => undefined,
        );
      }
    }
    await api("PATCH", "/config-profiles", {
      uuid: before.profileUuid,
      config: before.profileConfig,
    }).catch(() => undefined);
    if (before.node) {
      await api("PATCH", "/nodes", {
        uuid: before.node.uuid,
        configProfile: {
          activeConfigProfileUuid: before.node.configProfile.activeConfigProfileUuid,
          activeInbounds: uuids(before.node.configProfile.activeInbounds),
        },
      }).catch(() => undefined);
      await restartNode(before.node).catch(() => undefined);
    }
    throw new Error(`Canary preparation rolled back: ${error.message}`);
  }
}

async function cutover(targetName, target, config) {
  assert(target.canaryApprovedAt, "Run approve-canary after Shadowrocket and Happ Plus pass");
  assert((target.productionSquadNames ?? []).length > 0, "Production squad names are not configured");
  const before = await readState(target);
  assert(before.canaryInbound && before.node, "Prepared canary inbound/node is missing");
  assert(before.productionHost, "Production Host is missing");
  assert(before.productionSquads.every(Boolean), "One or more production squads are missing");
  encryptedBackup(`${targetName}-cutover`, stateBackup(before));
  try {
    for (const squad of before.productionSquads) {
      const current = uuids(squad.inbounds);
      assert(
        current.includes(before.legacyInbound.uuid),
        `${squad.name} does not contain the legacy inbound`,
      );
      await api("PATCH", "/internal-squads", {
        uuid: squad.uuid,
        name: squad.name,
        inbounds: [...new Set([...current, before.canaryInbound.uuid])],
      });
    }
    const payload = xhttpHostPayload(
      target,
      before.profileUuid,
      before.canaryInbound.uuid,
      uuids(before.productionHost.nodes).length > 0
        ? uuids(before.productionHost.nodes)
        : [before.node.uuid],
    );
    payload.uuid = before.productionHost.uuid;
    payload.remark = before.productionHost.remark;
    payload.excludedInternalSquads = uuids(before.productionHost.excludedInternalSquads);
    payload.excludeFromSubscriptionTypes = before.productionHost.excludeFromSubscriptionTypes ?? [];
    await api("PATCH", "/hosts", payload);

    const verified = await readState(target);
    assert(
      verified.productionHost.inbound?.configProfileInboundUuid === verified.canaryInbound.uuid &&
        verified.productionHost.address === target.domain &&
        verified.productionHost.path === target.path,
      "Production Host verification failed after cutover",
    );
    assert(
      verified.productionSquads.every((squad) => {
        const current = uuids(squad.inbounds);
        return current.includes(verified.legacyInbound.uuid) && current.includes(verified.canaryInbound.uuid);
      }),
      "Production squad overlap verification failed",
    );
    target.cutoverAt = new Date().toISOString();
    writeJsonAtomic(configFile, config);
    return { ...summary(targetName, target, verified), mode: "cutover", overlapDays: config.overlapDays };
  } catch (error) {
    for (const squad of before.productionSquads) {
      await api("PATCH", "/internal-squads", {
        uuid: squad.uuid,
        name: squad.name,
        inbounds: uuids(squad.inbounds),
      }).catch(() => undefined);
    }
    await api("PATCH", "/hosts", hostRestorePayload(before.productionHost)).catch(
      () => undefined,
    );
    throw new Error(`Cutover rolled back: ${error.message}`);
  }
}

async function cleanupCanaryArtifacts(targetName, target) {
  const before = await readState(target);
  assert(before.canaryInbound && before.node, "Active TONEM inbound/node is missing");
  assert(before.productionHost, "Production Host is missing");
  assert(before.productionSquads.every(Boolean), "One or more production squads are missing");
  assert(
    canCleanupCanaryArtifacts({
      cutoverAt: target.cutoverAt,
      canaryInboundUuid: before.canaryInbound.uuid,
      productionHostInboundUuid: before.productionHost.inbound?.configProfileInboundUuid,
      productionSquadInboundUuids: before.productionSquads.map((squad) => uuids(squad.inbounds)),
    }),
    "Canary artifacts cannot be removed before production fully uses the TONEM inbound",
  );
  encryptedBackup(`${targetName}-cleanup-canary`, stateBackup(before));

  let hostDeleted = false;
  let squadDeleted = false;
  try {
    if (before.canaryUser && before.canarySquad) {
      await api(
        "PATCH",
        "/users",
        userSquadUpdatePayload(
          before.canaryUser,
          uuids(before.canaryUser.activeInternalSquads).filter(
            (uuid) => uuid !== before.canarySquad.uuid,
          ),
        ),
      );
    }
    if (before.canaryHost) {
      await api("DELETE", `/hosts/${before.canaryHost.uuid}`);
      hostDeleted = true;
    }
    if (before.canarySquad) {
      await api("DELETE", `/internal-squads/${before.canarySquad.uuid}`);
      squadDeleted = true;
    }

    const verified = await readState(target);
    const result = summary(targetName, target, verified);
    assert(result.canaryInboundPresent && result.canaryActiveOnNode, "Active TONEM inbound was lost");
    assert(result.productionHostPresent, "Production Host was lost");
    assert(result.productionSquadsFound, "Production squads were lost");
    assert(!result.canaryHostPresent && !result.canarySquadPresent, "Canary artifacts remain");
    return {
      mode: "canary-artifacts-removed",
      target: targetName,
      canaryHostRemoved: true,
      canarySquadRemoved: true,
      canaryUserMembershipRemoved: true,
      productionInboundRetained: true,
      legacyOverlapRetained: Boolean(verified.legacyInbound),
      encryptedBackupCreated: true,
    };
  } catch (error) {
    let restoredSquadUuid = before.canarySquad?.uuid;
    if (squadDeleted && before.canarySquad) {
      const restored = await api("POST", "/internal-squads", {
        name: before.canarySquad.name,
        inbounds: uuids(before.canarySquad.inbounds),
      }).catch(() => null);
      restoredSquadUuid = (restored?.response ?? restored)?.uuid;
    }
    if (hostDeleted && before.canaryHost) {
      await api(
        "POST",
        "/hosts",
        xhttpHostPayload(target, before.profileUuid, before.canaryInbound.uuid, uuids(before.canaryHost.nodes)),
      ).catch(() => undefined);
    }
    if (before.canaryUser && before.canarySquad) {
      const original = uuids(before.canaryUser.activeInternalSquads).filter(
        (uuid) => uuid !== before.canarySquad.uuid,
      );
      await api(
        "PATCH",
        "/users",
        userSquadUpdatePayload(
          before.canaryUser,
          restoredSquadUuid ? [...original, restoredSquadUuid] : original,
        ),
      ).catch(() => undefined);
    }
    throw new Error(`Canary artifact cleanup rolled back: ${error.message}`);
  }
}

async function retire(targetName, target, config) {
  assert(canRetire(target.cutoverAt, config.overlapDays), "The 14-day overlap has not elapsed");
  const before = await readState(target);
  assert(before.legacyInbound && before.canaryInbound && before.node, "Overlap state is incomplete");
  assert(before.productionSquads.every(Boolean), "One or more production squads are missing");
  encryptedBackup(`${targetName}-retire`, stateBackup(before));

  let canaryHostDeleted = false;
  try {
    for (const squad of before.productionSquads) {
      const next = uuids(squad.inbounds).filter((uuid) => uuid !== before.legacyInbound.uuid);
      assert(next.includes(before.canaryInbound.uuid), `${squad.name} would lose the active TONEM inbound`);
      await api("PATCH", "/internal-squads", {
        uuid: squad.uuid,
        name: squad.name,
        inbounds: next,
      });
    }

    const activeInbounds = uuids(before.node.configProfile.activeInbounds).filter(
      (uuid) => uuid !== before.legacyInbound.uuid,
    );
    await api("PATCH", "/nodes", {
      uuid: before.node.uuid,
      configProfile: {
        activeConfigProfileUuid: before.profileUuid,
        activeInbounds,
      },
    });
    await api("PATCH", "/config-profiles", {
      uuid: before.profileUuid,
      config: profileWithoutLegacy(before.profileConfig, target),
    });
    await restartNode(before.node);

    if (before.canaryUser && before.canarySquad) {
      await api(
        "PATCH",
        "/users",
        userSquadUpdatePayload(
          before.canaryUser,
          uuids(before.canaryUser.activeInternalSquads).filter(
            (uuid) => uuid !== before.canarySquad.uuid,
          ),
        ),
      );
    }
    if (before.canaryHost) {
      await api("DELETE", `/hosts/${before.canaryHost.uuid}`);
      canaryHostDeleted = true;
    }
    if (before.canarySquad) await api("DELETE", `/internal-squads/${before.canarySquad.uuid}`);
  } catch (error) {
    await api("PATCH", "/config-profiles", {
      uuid: before.profileUuid,
      config: before.profileConfig,
    }).catch(() => undefined);
    await api("PATCH", "/nodes", {
      uuid: before.node.uuid,
      configProfile: {
        activeConfigProfileUuid: before.node.configProfile.activeConfigProfileUuid,
        activeInbounds: uuids(before.node.configProfile.activeInbounds),
      },
    }).catch(() => undefined);
    for (const squad of before.productionSquads) {
      await api("PATCH", "/internal-squads", {
        uuid: squad.uuid,
        name: squad.name,
        inbounds: uuids(squad.inbounds),
      }).catch(() => undefined);
    }
    if (before.canaryUser) {
      await api(
        "PATCH",
        "/users",
        userSquadUpdatePayload(before.canaryUser, uuids(before.canaryUser.activeInternalSquads)),
      ).catch(() => undefined);
    }
    if (canaryHostDeleted) {
      await api(
        "POST",
        "/hosts",
        xhttpHostPayload(
          target,
          before.profileUuid,
          before.canaryInbound.uuid,
          uuids(before.canaryHost.nodes),
        ),
      ).catch(() => undefined);
    }
    await restartNode(before.node).catch(() => undefined);
    throw new Error(`Retirement rolled back: ${error.message}`);
  }

  target.legacyVhosts = (target.legacyVhosts ?? []).map((vhost) => ({
    domain: vhost.domain,
    cert_name: vhost.cert_name ?? vhost.domain,
    locations: [],
  }));
  target.retiredAt = new Date().toISOString();
  writeJsonAtomic(configFile, config);
  return {
    mode: "retired",
    target: targetName,
    domain: target.domain,
    legacyInboundRemoved: true,
    privateLegacyLocationsRemoved: true,
    encryptedBackupRetentionDays: config.encryptedBackupRetentionDays,
  };
}

function approveCanary(targetName, target, config) {
  assert(!target.cutoverAt, "Canary cannot be re-approved after cutover");
  target.canaryApprovedAt = new Date().toISOString();
  writeJsonAtomic(configFile, config);
  return { mode: "canary-approved", target: targetName, approvedAt: target.canaryApprovedAt };
}

function parseArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") options.apply = true;
    else if (value === "--target") options.target = argv[++index];
    else if (value === "--stage") options.stage = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
assert(["moscow", "home", "exit"].includes(options.target), "--target is required");
assert(
  ["check", "prepare-canary", "approve-canary", "cutover", "cleanup-canary", "retire"].includes(options.stage),
  "--stage must be check, prepare-canary, approve-canary, cutover, cleanup-canary, or retire",
);
const config = validateConfig(readJson(configFile));
const target = config.targets[options.target];
if (options.stage !== "check") {
  assert(options.apply, `--stage ${options.stage} requires explicit --apply`);
  pruneExpiredBackups(config.encryptedBackupRetentionDays);
}

let result;
if (options.stage === "approve-canary") {
  result = approveCanary(options.target, target, config);
} else {
  const state = await readState(target);
  if (options.stage === "check") result = summary(options.target, target, state);
  else if (options.stage === "prepare-canary") {
    result = await prepareCanary(options.target, target);
  } else if (options.stage === "cutover") {
    result = await cutover(options.target, target, config);
  } else if (options.stage === "cleanup-canary") {
    result = await cleanupCanaryArtifacts(options.target, target);
  } else {
    result = await retire(options.target, target, config);
  }
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
