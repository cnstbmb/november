#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import {
  YOUTUBE_INBOUND_TAG,
  YOUTUBE_OUTBOUND_TAG,
  YOUTUBE_PROFILE_NAME,
  buildYoutubeExitProfile,
  patchMasterForYoutube,
  youtubeContract,
} from "./moscow_youtube_exit.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../..");
const tokenEnvFile = path.join(rootDir, ".private/ansible/prod/remnashop/.env");
const apiBase = (
  process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api"
).replace(/\/$/, "");

const nodeName = "YOUTUBE MOSCOW";
const nodeAddress = "5.42.111.142";
const inventoryHost = "youtube.himenkov.ru";
const certDomain = "youtube.himenkov.ru";
const bridgePort = 8443;
const nodePort = 2222;
const bridgeSquadName = "Bridge Exit Squad";
const masterProfileName = "MASTER_NODE";
const protectedProfileNames = ["EXIT_NODE", "HOME_EXIT_NODE"];
const localMasterFiles = [
  path.join(rootDir, ".private/configs/MASTER_NODE.json"),
  path.join(
    rootDir,
    ".private/ansible/prod/remnawave-topology/profiles/02-master-moscow.himenkov.ru.profile.json",
  ),
];
const localYoutubeFiles = [
  path.join(rootDir, ".private/configs/YOUTUBE_EXIT_NODE.json"),
  path.join(
    rootDir,
    `.private/ansible/prod/remnawave-topology/profiles/05-youtube-exit-${inventoryHost}.profile.json`,
  ),
];
const nodeEnvFile = path.join(
  rootDir,
  `.private/ansible/prod/remnawave-node/${inventoryHost}.env`,
);
const privateStateFile = path.join(
  rootDir,
  ".private/ansible/prod/remnawave-youtube-exit.json",
);
const backupRoot = path.join(rootDir, ".private/backups/moscow-youtube-exit");

const args = new Set(process.argv.slice(2));
const knownArgs = new Set(["--prepare", "--cutover", "--check"]);
const unknownArgs = [...args].filter((arg) => !knownArgs.has(arg));
if (unknownArgs.length > 0) throw new Error(`Unknown arguments: ${unknownArgs.join(", ")}`);
if (["--prepare", "--cutover"].filter((arg) => args.has(arg)).length > 1) {
  throw new Error("Choose only one of --prepare or --cutover");
}

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(tokenEnvFile, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${tokenEnvFile}`);
  return (match[1] || match[2] || match[3]).trim();
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${method} ${endpoint} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) {
    const detail = data?.message || data?.response?.message || "no API message";
    throw new Error(`${method} ${endpoint} failed with HTTP ${response.status}: ${detail}`);
  }
  return data?.response ?? data;
}

function listFrom(result, key) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.[key])) return result[key];
  return [];
}

function parseConfig(value) {
  return typeof value === "string" ? JSON.parse(value) : structuredClone(value);
}

function same(left, right) {
  return isDeepStrictEqual(left, right);
}

function diffPaths(left, right, prefix = "") {
  if (same(left, right)) return [];
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) return [prefix || "$"];
  const keys = new Set([
    ...Object.keys(left ?? {}),
    ...Object.keys(right ?? {}),
  ]);
  return [...keys].flatMap((key) =>
    diffPaths(left?.[key], right?.[key], `${prefix}${Array.isArray(left) ? `[${key}]` : `${prefix ? "." : ""}${key}`}`),
  );
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.youtube-exit-${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
}

function writeNodeEnv(secret) {
  fs.mkdirSync(path.dirname(nodeEnvFile), { recursive: true, mode: 0o700 });
  const temporary = `${nodeEnvFile}.youtube-exit-${process.pid}.tmp`;
  const content = [
    `NODE_PORT=${nodePort}`,
    `APP_PORT=${nodePort}`,
    `SECRET_KEY=${secret}`,
    `SSL_CERT=${secret}`,
    "",
  ].join("\n");
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, nodeEnvFile);
}

function createBackup(label, value) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const directory = path.join(backupRoot, `${stamp}-${label}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  writeJsonAtomic(path.join(directory, "before.json"), value);
  return directory;
}

function activeInboundUuids(node) {
  return (node?.configProfile?.activeInbounds ?? []).map((item) =>
    typeof item === "string" ? item : item.uuid,
  );
}

function activeInboundTags(node) {
  return (node?.configProfile?.activeInbounds ?? []).map((item) => item.tag).filter(Boolean);
}

async function readState() {
  const [profilesResult, squadsResult, nodesResult] = await Promise.all([
    api("GET", "/config-profiles"),
    api("GET", "/internal-squads"),
    api("GET", "/nodes"),
  ]);
  const profiles = listFrom(profilesResult, "configProfiles");
  const squads = listFrom(squadsResult, "internalSquads");
  const nodes = listFrom(nodesResult, "nodes");
  const masterProfile = profiles.find((item) => item.name === masterProfileName);
  if (!masterProfile?.uuid) throw new Error(`${masterProfileName} was not found`);
  const youtubeProfile = profiles.find((item) => item.name === YOUTUBE_PROFILE_NAME);
  const bridgeSquad = squads.find((item) => item.name === bridgeSquadName);
  if (!bridgeSquad?.uuid) throw new Error(`${bridgeSquadName} was not found`);
  const youtubeNode = nodes.find((item) => item.name === nodeName);
  const addressCollision = nodes.find(
    (item) => item.address === nodeAddress && item.name !== nodeName,
  );
  if (addressCollision) {
    throw new Error(`Node address ${nodeAddress} is already used by ${addressCollision.name}`);
  }
  const protectedProfiles = Object.fromEntries(
    protectedProfileNames.map((name) => {
      const profile = profiles.find((item) => item.name === name);
      return [name, profile ? parseConfig(profile.config) : null];
    }),
  );
  return {
    profiles,
    masterProfile,
    masterConfig: parseConfig(masterProfile.config),
    youtubeProfile,
    youtubeConfig: youtubeProfile ? parseConfig(youtubeProfile.config) : null,
    bridgeSquad,
    youtubeNode,
    protectedProfiles,
  };
}

function desiredYoutubeProfile() {
  return buildYoutubeExitProfile({ bridgePort, certDomain });
}

function desiredMasterProfile(masterConfig) {
  return patchMasterForYoutube(masterConfig, {
    address: nodeAddress,
    bridgePort,
    certDomain,
  });
}

function localMasterConfig() {
  const configs = localMasterFiles.map((file) => readJson(file));
  if (!same(configs[0], configs[1])) throw new Error("Local MASTER_NODE profile copies differ");
  return configs[0];
}

function assertProtectedProfilesUnchanged(before, after) {
  for (const name of protectedProfileNames) {
    if (!same(before[name], after[name])) throw new Error(`${name} changed unexpectedly`);
  }
}

async function check() {
  const state = await readState();
  const desiredYoutube = desiredYoutubeProfile();
  const desiredMaster = desiredMasterProfile(state.masterConfig);
  const localMaster = localMasterConfig();
  const inbound = state.youtubeProfile?.inbounds?.find((item) => item.tag === YOUTUBE_INBOUND_TAG);
  const squadTags = (state.bridgeSquad.inbounds ?? []).map((item) => item.tag);
  const contract = youtubeContract(desiredMaster, desiredYoutube);
  return {
    mode: "check",
    nodeAddress,
    inventoryHost,
    profilePresent: Boolean(state.youtubeProfile),
    profileMatchesDesired: Boolean(state.youtubeConfig && same(state.youtubeConfig, desiredYoutube)),
    profileDiffPaths: state.youtubeConfig ? diffPaths(state.youtubeConfig, desiredYoutube) : [],
    bridgeInboundPresent: Boolean(inbound),
    bridgeSquadContainsInbound: squadTags.includes(YOUTUBE_INBOUND_TAG),
    nodePresent: Boolean(state.youtubeNode),
    nodeConnected: Boolean(state.youtubeNode?.isConnected),
    nodeDisabled: state.youtubeNode?.isDisabled ?? null,
    nodeStatusMessage: state.youtubeNode?.lastStatusMessage ?? null,
    masterLiveMatchesLocal: same(state.masterConfig, localMaster),
    masterCutoverApplied: same(state.masterConfig, desiredMaster),
    contract,
    nodeEnvPresent: fs.existsSync(nodeEnvFile),
  };
}

async function prepare() {
  const before = await readState();
  const desiredProfile = desiredYoutubeProfile();
  const backupDir = createBackup("prepare", {
    youtubeProfile: before.youtubeProfile,
    bridgeSquad: before.bridgeSquad,
    youtubeNode: before.youtubeNode,
  });

  let profile = before.youtubeProfile;
  if (!profile) {
    profile = await api("POST", "/config-profiles", {
      name: YOUTUBE_PROFILE_NAME,
      config: desiredProfile,
    });
  } else if (!same(parseConfig(profile.config), desiredProfile)) {
    profile = await api("PATCH", "/config-profiles", {
      uuid: profile.uuid,
      name: YOUTUBE_PROFILE_NAME,
      config: desiredProfile,
    });
  }
  const inboundsResult = await api("GET", `/config-profiles/${profile.uuid}/inbounds`);
  const inbound = listFrom(inboundsResult, "inbounds").find(
    (item) => item.tag === YOUTUBE_INBOUND_TAG,
  );
  if (!inbound?.uuid) throw new Error(`${YOUTUBE_INBOUND_TAG} was not returned by Remnawave`);

  const existingSquadInboundUuids = (before.bridgeSquad.inbounds ?? []).map((item) => item.uuid);
  if (!existingSquadInboundUuids.includes(inbound.uuid)) {
    await api("PATCH", "/internal-squads", {
      uuid: before.bridgeSquad.uuid,
      name: before.bridgeSquad.name,
      inbounds: [...existingSquadInboundUuids, inbound.uuid],
    });
  }

  const nodeBody = {
    name: nodeName,
    address: nodeAddress,
    port: nodePort,
    configProfile: {
      activeConfigProfileUuid: profile.uuid,
      activeInbounds: [inbound.uuid],
    },
    isTrafficTrackingActive: false,
    trafficLimitBytes: 0,
    notifyPercent: 0,
    trafficResetDay: 1,
    excludedInbounds: [],
    countryCode: "RU",
    consumptionMultiplier: 1,
    nodeConsumptionMultiplier: 1,
    note: "Dedicated YouTube egress for Moscow transit traffic only",
    tags: ["YOUTUBE_EXIT"],
  };
  let node = before.youtubeNode;
  if (!node) node = await api("POST", "/nodes", nodeBody);
  else {
    const needsNodePatch =
      node.address !== nodeAddress ||
      Number(node.port) !== nodePort ||
      node.configProfile?.activeConfigProfileUuid !== profile.uuid ||
      !activeInboundUuids(node).includes(inbound.uuid);
    if (needsNodePatch) node = await api("PATCH", "/nodes", { uuid: node.uuid, ...nodeBody });
  }

  let generatedNodeSecret = false;
  if (!fs.existsSync(nodeEnvFile)) {
    const keyResult = await api("GET", "/keygen");
    const secret = keyResult?.pubKey;
    if (!secret) throw new Error("Remnawave keygen did not return pubKey");
    writeNodeEnv(secret);
    generatedNodeSecret = true;
  }
  for (const file of localYoutubeFiles) writeJsonAtomic(file, desiredProfile);
  writeJsonAtomic(privateStateFile, {
    inventoryHost,
    nodeName,
    nodeAddress,
    nodePort,
    bridgePort,
    certDomain,
    profileUuid: profile.uuid,
    inboundUuid: inbound.uuid,
    nodeUuid: node.uuid,
  });

  const after = await readState();
  assertProtectedProfilesUnchanged(before.protectedProfiles, after.protectedProfiles);
  return {
    mode: "prepared",
    backupDir: path.relative(rootDir, backupDir),
    profileUuid: profile.uuid,
    inboundUuid: inbound.uuid,
    nodeUuid: node.uuid,
    generatedNodeSecret,
    masterUntouched: same(before.masterConfig, after.masterConfig),
    directAndHomeUntouched: true,
  };
}

async function cutover() {
  const before = await readState();
  if (!before.youtubeProfile || !before.youtubeNode) {
    throw new Error("Run --prepare and deploy the node before --cutover");
  }
  const inbound = before.youtubeProfile.inbounds?.find((item) => item.tag === YOUTUBE_INBOUND_TAG);
  if (!inbound?.uuid) throw new Error(`${YOUTUBE_INBOUND_TAG} is missing`);
  if (before.youtubeNode.isDisabled) throw new Error("YouTube node is disabled");
  if (!before.youtubeNode.isConnected) throw new Error("YouTube node is not connected");
  if (before.youtubeNode.lastStatusMessage) {
    throw new Error(`YouTube node is unhealthy: ${before.youtubeNode.lastStatusMessage}`);
  }
  if (!activeInboundUuids(before.youtubeNode).includes(inbound.uuid)) {
    throw new Error("YouTube node does not have BRIDGE_YOUTUBE_IN active");
  }

  const localBefore = localMasterConfig();
  if (!same(localBefore, before.masterConfig)) {
    throw new Error("Live MASTER_NODE differs from local copies before cutover");
  }
  const desiredMaster = desiredMasterProfile(before.masterConfig);
  const contract = youtubeContract(desiredMaster, desiredYoutubeProfile());
  if (
    contract.youtubeRuleCount !== 1 ||
    contract.youtubeOutboundCount !== 1 ||
    contract.youtubeInboundCount !== 1 ||
    contract.directInboundRouted
  ) {
    throw new Error(`Invalid YouTube routing contract: ${JSON.stringify(contract)}`);
  }
  const backupDir = createBackup("cutover", {
    masterProfileUuid: before.masterProfile.uuid,
    masterConfig: before.masterConfig,
    protectedProfiles: before.protectedProfiles,
  });

  try {
    if (!same(before.masterConfig, desiredMaster)) {
      await api("PATCH", "/config-profiles", {
        uuid: before.masterProfile.uuid,
        name: masterProfileName,
        config: desiredMaster,
      });
    }
    for (const file of localMasterFiles) writeJsonAtomic(file, desiredMaster);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const after = await readState();
    if (!same(after.masterConfig, desiredMaster)) throw new Error("Final MASTER_NODE mismatch");
    assertProtectedProfilesUnchanged(before.protectedProfiles, after.protectedProfiles);
    const node = after.youtubeNode;
    if (!node?.isConnected || node.isDisabled || node.lastStatusMessage) {
      throw new Error(`YouTube node unhealthy after cutover: ${node?.lastStatusMessage || "offline"}`);
    }
    return {
      mode: same(before.masterConfig, desiredMaster) ? "already-cutover" : "cutover",
      backupDir: path.relative(rootDir, backupDir),
      contract,
      directAndHomeUntouched: true,
      nodeConnected: true,
    };
  } catch (error) {
    await api("PATCH", "/config-profiles", {
      uuid: before.masterProfile.uuid,
      name: masterProfileName,
      config: before.masterConfig,
    });
    for (const file of localMasterFiles) writeJsonAtomic(file, localBefore);
    throw new Error(`Cutover rolled back: ${error.message}`);
  }
}

const result = args.has("--prepare")
  ? await prepare()
  : args.has("--cutover")
    ? await cutover()
    : await check();

console.log(JSON.stringify(result, null, 2));
