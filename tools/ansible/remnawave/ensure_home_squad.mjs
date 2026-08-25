#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../..");
const tokenEnvFile = path.join(rootDir, ".private/ansible/prod/remnashop/.env");
const backupRoot = path.join(rootDir, ".private/backups/home-squad");
const privateConfigFile = path.join(rootDir, ".private/ansible/prod/remnawave-home-xhttp.json");
const apiBase = (
  process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api"
).replace(/\/$/, "");

const homeSquadName = "HOME";
const bridgeSquadName = "Bridge Exit Squad";
const homeHostRemark = "HOME";
const homeInboundTag = "VLESS_HOME_REALITY_DIRECT";
const bridgeInboundTag = "BRIDGE_HOME_RU_IN";
const homePort = 443;
const homePath = fs.existsSync(privateConfigFile)
  ? JSON.parse(fs.readFileSync(privateConfigFile, "utf8")).path
  : null;

function readApiToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(tokenEnvFile, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${tokenEnvFile}`);
  return (match[1] || match[2] || match[3]).trim();
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

function usersFrom(result) {
  return result.response?.users || [];
}

function squadsFrom(result) {
  return result.response?.internalSquads || [];
}

function memberNames(users, squadUuid) {
  return users
    .filter((user) =>
      (user.activeInternalSquads || []).some((squad) => squad.uuid === squadUuid),
    )
    .map((user) => user.username)
    .sort();
}

function inboundUuids(squad) {
  return (squad?.inbounds || []).map((inbound) => inbound.uuid).sort();
}

async function readState() {
  const [hostsResult, squadsResult, usersResult] = await Promise.all([
    api("GET", "/hosts"),
    api("GET", "/internal-squads"),
    api("GET", "/users?start=1&size=1000"),
  ]);
  const hosts = hostsResult.response || [];
  const squads = squadsFrom(squadsResult);
  const users = usersFrom(usersResult);
  const homeHost = hosts.find((host) => host.remark === homeHostRemark);
  const bridgeSquad = squads.find((squad) => squad.name === bridgeSquadName);
  const homeInbound = squads
    .flatMap((squad) => squad.inbounds || [])
    .find((inbound) => inbound.tag === homeInboundTag);
  const homeSquad = squads.find((squad) => squad.name === homeSquadName);

  if (!homeHost) throw new Error(`Host ${homeHostRemark} was not found`);
  if (homeHost.isDisabled) throw new Error(`Host ${homeHostRemark} is disabled`);
  if (!bridgeSquad) throw new Error(`Squad ${bridgeSquadName} was not found`);
  if (!homeInbound) throw new Error(`${homeInboundTag} was not found in any Squad`);
  if (!(bridgeSquad.inbounds || []).some((inbound) => inbound.tag === bridgeInboundTag)) {
    throw new Error(`${bridgeSquadName} does not preserve ${bridgeInboundTag}`);
  }
  if (Number(homeHost.port) !== homePort) {
    throw new Error(`Host ${homeHostRemark} uses port ${homeHost.port}, expected ${homePort}`);
  }
  if (
    homeHost.inbound?.configProfileUuid !== homeInbound.profileUuid ||
    homeHost.inbound?.configProfileInboundUuid !== homeInbound.uuid
  ) {
    throw new Error(`Host ${homeHostRemark} is not bound to ${homeInboundTag}`);
  }
  if (!homePath || homeHost.path !== homePath) {
    throw new Error(`Host ${homeHostRemark} does not use the private XHTTP path`);
  }

  return { homeHost, bridgeSquad, homeInbound, homeSquad, users };
}

function validateExistingHomeSquad(state) {
  if (!state.homeSquad) return;
  const actualInboundUuids = inboundUuids(state.homeSquad);
  if (
    actualInboundUuids.length !== 1 ||
    actualInboundUuids[0] !== state.homeInbound.uuid
  ) {
    throw new Error(`Existing ${homeSquadName} Squad does not contain exactly ${homeInboundTag}`);
  }
}

function summarize(state, mode) {
  return {
    mode,
    squad: homeSquadName,
    exists: Boolean(state.homeSquad),
    inbound: homeInboundTag,
    host: homeHostRemark,
    port: homePort,
    transport: "VLESS over XHTTP packet-up with TLS",
    bridgeSquadPreserved: (state.bridgeSquad.inbounds || []).some(
      (inbound) => inbound.uuid === state.homeInbound.uuid,
    ),
    memberCount: state.homeSquad
      ? memberNames(state.users, state.homeSquad.uuid).length
      : 0,
  };
}

function writeBackup(state) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  const backupDir = path.join(backupRoot, stamp);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupFile = path.join(backupDir, "before.json");
  fs.writeFileSync(
    backupFile,
    `${JSON.stringify(
      {
        squadExisted: Boolean(state.homeSquad),
        homeSquad: state.homeSquad || null,
        homeHost: state.homeHost,
        bridgeSquad: state.bridgeSquad,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(backupFile, 0o600);
  return backupFile;
}

const apply = process.argv.slice(2).includes("--apply");
const before = await readState();
validateExistingHomeSquad(before);

if (!apply) {
  console.log(JSON.stringify(summarize(before, "check"), null, 2));
  process.exit(0);
}

if (before.homeSquad) {
  console.log(JSON.stringify(summarize(before, "already-correct"), null, 2));
  process.exit(0);
}

const backupFile = writeBackup(before);
await api("POST", "/internal-squads", {
  name: homeSquadName,
  inbounds: [before.homeInbound.uuid],
});

const after = await readState();
validateExistingHomeSquad(after);
if (!after.homeSquad) throw new Error(`${homeSquadName} Squad was not created`);
if (memberNames(after.users, after.homeSquad.uuid).length > 0) {
  throw new Error(`${homeSquadName} unexpectedly gained users during creation`);
}

console.log(
  JSON.stringify(
    {
      ...summarize(after, "applied"),
      backupDirectory: path.dirname(backupFile),
    },
    null,
    2,
  ),
);
