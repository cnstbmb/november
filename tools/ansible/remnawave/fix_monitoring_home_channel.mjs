#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../..");
const tokenEnvFile = path.join(rootDir, ".private/ansible/prod/remnashop/.env");
const masterVarsFile = path.join(rootDir, ".private/ansible/prod/group_vars/master.yml");
const backupRoot = path.join(rootDir, ".private/backups/monitoring-home-channel");
const privateConfigFile = path.join(rootDir, ".private/ansible/prod/remnawave-home-xhttp.json");
const apiBase = readApiBase();
const homeHostRemark = "HOME";
const targetSquadName = "HOME Monitoring Squad";
const expectedHomeInboundTag = "VLESS_HOME_REALITY_DIRECT";
const expectedHomeXhttpPath = JSON.parse(fs.readFileSync(privateConfigFile, "utf8")).path;
const expectedHomePort = 443;
const expectedHomeDnsRedirect = "127.0.0.53:53";

function readApiToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;

  const env = fs.readFileSync(tokenEnvFile, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${tokenEnvFile}`);
  return (match[1] || match[2] || match[3]).trim();
}

function readApiBase() {
  if (process.env.REMNAWAVE_API_BASE) return process.env.REMNAWAVE_API_BASE.replace(/\/$/, "");

  const env = fs.readFileSync(tokenEnvFile, "utf8");
  const match = env.match(/^REMNAWAVE_HOST=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) {
    throw new Error(
      `Set REMNAWAVE_API_BASE or REMNAWAVE_HOST in the private environment at ${tokenEnvFile}`,
    );
  }
  const value = (match[1] || match[2] || match[3]).trim().replace(/\/$/, "");
  return /^https?:\/\//.test(value)
    ? `${value}/api`
    : "https://panel.moscow.himenkov.ru/api";
}

function readMonitoringShortUuid() {
  const vars = fs.readFileSync(masterVarsFile, "utf8");
  const match = vars.match(
    /^monitoring_xray_checker_subscription_url:\s*["']?([^"'\n]+)["']?/m,
  );
  if (!match) {
    throw new Error(`monitoring_xray_checker_subscription_url not found in ${masterVarsFile}`);
  }

  const segments = new URL(match[1]).pathname.split("/").filter(Boolean);
  const shortUuid = segments.at(-1);
  if (!shortUuid) throw new Error("Monitoring subscription URL has no short UUID");
  return shortUuid;
}

const apiToken = readApiToken();

async function api(method, endpoint, body) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed with HTTP ${response.status}`);
  }
  return data;
}

async function getState() {
  const shortUuid = readMonitoringShortUuid();
  const [hostsResult, squadsResult, usersResult] = await Promise.all([
    api("GET", "/hosts"),
    api("GET", "/internal-squads"),
    api("GET", "/users?start=1&size=1000"),
  ]);

  const homeHost = (hostsResult.response || []).find(
    (host) => host.remark === homeHostRemark,
  );
  if (!homeHost) throw new Error(`Remnawave host ${homeHostRemark} was not found`);
  if (homeHost.isDisabled) throw new Error(`Remnawave host ${homeHostRemark} is disabled`);

  const targetSquad = (squadsResult.response?.internalSquads || []).find(
    (squad) => squad.name === targetSquadName,
  );
  if (!targetSquad) throw new Error(`Internal squad ${targetSquadName} was not found`);
  if (!(targetSquad.inbounds || []).some((inbound) => inbound.tag === expectedHomeInboundTag)) {
    throw new Error(`${targetSquadName} does not contain ${expectedHomeInboundTag}`);
  }
  const homeInbound = targetSquad.inbounds.find(
    (inbound) => inbound.tag === expectedHomeInboundTag,
  );

  const monitoringUser = (usersResult.response?.users || []).find(
    (user) => user.shortUuid === shortUuid,
  );
  if (!monitoringUser) throw new Error("Monitoring subscription user was not found");
  if (monitoringUser.status !== "ACTIVE") {
    throw new Error(`Monitoring subscription user is ${monitoringUser.status}`);
  }

  const computedConfig = await api(
    "GET",
    `/config-profiles/${homeInbound.profileUuid}/computed-config`,
  );

  return { computedConfig, homeHost, homeInbound, targetSquad, monitoringUser };
}

function parseComputedProfileConfig(state) {
  const rawConfig = state.computedConfig?.response?.config;
  if (typeof rawConfig !== "string") return rawConfig;
  try {
    return JSON.parse(rawConfig);
  } catch {
    return null;
  }
}

function summarize(state, mode) {
  const currentSquads = (state.monitoringUser.activeInternalSquads || []).map(
    (squad) => squad.name,
  );
  const profileConfig = parseComputedProfileConfig(state);
  const dnsOutbound = (profileConfig?.outbounds || []).find(
    (outbound) => outbound.tag === "DNS_OUT",
  );
  return {
    mode,
    homeHost: state.homeHost.remark,
    homeHostEnabled: !state.homeHost.isDisabled,
    targetSquad: state.targetSquad.name,
    alreadyMember: currentSquads.includes(state.targetSquad.name),
    hostInboundCorrect:
      state.homeHost.inbound?.configProfileUuid === state.homeInbound.profileUuid &&
      state.homeHost.inbound?.configProfileInboundUuid === state.homeInbound.uuid,
    hostTransportCorrect: state.homeHost.path === expectedHomeXhttpPath,
    hostPortCorrect: Number(state.homeHost.port) === expectedHomePort,
    homeDnsCorrect: dnsOutbound?.settings?.redirect === expectedHomeDnsRedirect,
    currentSquads: currentSquads.sort(),
    plannedSquads: [...new Set([...currentSquads, state.targetSquad.name])].sort(),
  };
}

function writeBackup(state) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const backupDir = path.join(backupRoot, stamp);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backup = {
    monitoringUserUuid: state.monitoringUser.uuid,
    activeInternalSquads: (state.monitoringUser.activeInternalSquads || []).map(
      (squad) => ({ uuid: squad.uuid, name: squad.name }),
    ),
    targetSquad: { uuid: state.targetSquad.uuid, name: state.targetSquad.name },
    homeHost: state.homeHost,
    homeProfile: state.computedConfig.response,
    desiredHomeInbound: {
      configProfileUuid: state.homeInbound.profileUuid,
      configProfileInboundUuid: state.homeInbound.uuid,
      tag: state.homeInbound.tag,
    },
  };
  const backupFile = path.join(backupDir, "before.json");
  fs.writeFileSync(backupFile, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(backupFile, 0o600);
  return backupFile;
}

async function applyMembership(state) {
  const currentSquadUuids = (state.monitoringUser.activeInternalSquads || []).map(
    (squad) => squad.uuid,
  );
  return api("PATCH", "/users", {
    uuid: state.monitoringUser.uuid,
    activeInternalSquads: [...new Set([...currentSquadUuids, state.targetSquad.uuid])],
  });
}

async function applyHomeHostInbound(state) {
  return api("PATCH", "/hosts", {
    uuid: state.homeHost.uuid,
    inbound: {
      configProfileUuid: state.homeInbound.profileUuid,
      configProfileInboundUuid: state.homeInbound.uuid,
    },
    path: expectedHomeXhttpPath,
    port: expectedHomePort,
  });
}

async function applyHomeDns(state) {
  const config = structuredClone(parseComputedProfileConfig(state));
  const dnsServer = config?.dns?.servers?.find(
    (server) => server.address === "127.0.0.1" || server.address === "127.0.0.53",
  );
  const dnsOutbound = (config?.outbounds || []).find((outbound) => outbound.tag === "DNS_OUT");
  if (!dnsServer || !dnsOutbound) {
    throw new Error("HOME profile does not contain the expected DNS server and DNS_OUT outbound");
  }
  dnsServer.address = "127.0.0.53";
  dnsServer.port = 53;
  dnsOutbound.settings = {
    ...dnsOutbound.settings,
    redirect: expectedHomeDnsRedirect,
  };
  return api("PATCH", "/config-profiles", {
    uuid: state.homeInbound.profileUuid,
    config,
  });
}

async function rollback(backupDirArgument) {
  const resolvedBackupDir = path.resolve(backupDirArgument);
  const expectedPrefix = `${path.resolve(backupRoot)}${path.sep}`;
  if (!resolvedBackupDir.startsWith(expectedPrefix)) {
    throw new Error(`Rollback directory must be inside ${backupRoot}`);
  }

  const backup = JSON.parse(fs.readFileSync(path.join(resolvedBackupDir, "before.json"), "utf8"));
  await api("PATCH", "/users", {
    uuid: backup.monitoringUserUuid,
    activeInternalSquads: backup.activeInternalSquads.map((squad) => squad.uuid),
  });
  const previousInbound = backup.homeHost?.inbound;
  const canRestoreHostInbound = Boolean(previousInbound?.configProfileInboundUuid);
  if (canRestoreHostInbound) {
    await api("PATCH", "/hosts", {
      uuid: backup.homeHost.uuid,
      inbound: previousInbound,
      path: backup.homeHost.path,
      port: backup.homeHost.port,
    });
  }
  if (backup.homeProfile?.uuid && backup.homeProfile?.config) {
    await api("PATCH", "/config-profiles", {
      uuid: backup.homeProfile.uuid,
      config: backup.homeProfile.config,
    });
  }
  console.log(
    JSON.stringify(
      {
        mode: "rollback",
        membershipRestored: true,
        homeHostInboundRestored: canRestoreHostInbound,
        homeProfileRestored: Boolean(backup.homeProfile?.uuid && backup.homeProfile?.config),
        note: canRestoreHostInbound
          ? undefined
          : "The previous null host inbound cannot be restored through the validated PATCH /hosts contract.",
        restoredSquads: backup.activeInternalSquads.map((squad) => squad.name).sort(),
      },
      null,
      2,
    ),
  );
}

const args = process.argv.slice(2);
const rollbackIndex = args.indexOf("--rollback");
if (rollbackIndex !== -1) {
  const backupDirArgument = args[rollbackIndex + 1];
  if (!backupDirArgument) throw new Error("--rollback requires a backup directory");
  await rollback(backupDirArgument);
  process.exit(0);
}

const state = await getState();
if (!args.includes("--apply")) {
  console.log(JSON.stringify(summarize(state, "check"), null, 2));
  process.exit(0);
}

const currentSummary = summarize(state, "apply");
if (
  currentSummary.alreadyMember &&
  currentSummary.hostInboundCorrect &&
  currentSummary.hostTransportCorrect &&
  currentSummary.hostPortCorrect &&
  currentSummary.homeDnsCorrect
) {
  console.log(JSON.stringify(summarize(state, "already-correct"), null, 2));
  process.exit(0);
}

const backupFile = writeBackup(state);
if (
  !currentSummary.hostInboundCorrect ||
  !currentSummary.hostTransportCorrect ||
  !currentSummary.hostPortCorrect
) {
  await applyHomeHostInbound(state);
}
if (!currentSummary.homeDnsCorrect) {
  await applyHomeDns(state);
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
if (!currentSummary.alreadyMember) await applyMembership(state);
const verifiedState = await getState();
const verifiedSummary = summarize(verifiedState, "verify");
if (
  !verifiedSummary.alreadyMember ||
  !verifiedSummary.hostInboundCorrect ||
  !verifiedSummary.hostTransportCorrect ||
  !verifiedSummary.hostPortCorrect ||
  !verifiedSummary.homeDnsCorrect
) {
  throw new Error(
    "HOME XHTTP binding, path, port, DNS, or monitoring membership was not correct after PATCH",
  );
}

console.log(
  JSON.stringify(
    {
      ...summarize(verifiedState, "applied"),
      backupDirectory: path.dirname(backupFile),
    },
    null,
    2,
  ),
);
