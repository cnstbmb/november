#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const TOKEN_ENV = path.join(ROOT, ".private/ansible/prod/remnashop/.env");
const LOCAL_PROFILE = path.join(ROOT, ".private/configs/MASTER_NODE.json");
const TOPOLOGY_PROFILE = path.join(
  ROOT,
  ".private/ansible/prod/remnawave-topology/profiles/02-master-moscow.himenkov.ru.profile.json",
);
const API_BASE = process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api";
const PROFILE_UUID = "ba4464ac-3ca1-4599-8047-53300afe0d43";
const NODE_NAME = "MOSCOW VDSINA CANARY";
const OLD_IP = "5.42.111.142";
const NEW_IP = "193.124.64.187";
const EXPECTED_REPLACEMENTS = 3;
const EXPECTED_YOUTUBE_DIRECT_RULES = 0;
const APPLY = process.argv.includes("--apply");
const UNKNOWN_ARGS = process.argv.slice(2).filter((arg) => arg !== "--apply");

if (UNKNOWN_ARGS.length > 0) {
  throw new Error(`Unknown arguments: ${UNKNOWN_ARGS.join(", ")}`);
}

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(TOKEN_ENV, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${TOKEN_ENV}`);
  return (match[1] || match[2] || match[3]).trim();
}

async function api(method, endpoint, body) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${endpoint}: HTTP ${response.status}`);
  return data?.response ?? data;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function occurrences(value, needle) {
  return JSON.stringify(value).split(needle).length - 1;
}

function replaceOldIp(value) {
  return JSON.parse(JSON.stringify(value).replaceAll(OLD_IP, NEW_IP));
}

function youtubeDirectRuleCount(config) {
  return (config.routing?.rules || []).filter(
    (rule) =>
      Array.isArray(rule.domain) &&
      rule.domain.includes("geosite:youtube") &&
      rule.outboundTag === "IPv4",
  ).length;
}

function assertSame(left, right, message) {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(message);
}

function backupDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(ROOT, ".private/backups/moscow-cutover-routing", stamp);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}

function writeSecureJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

const TOKEN = readToken();
const localProfile = readJson(LOCAL_PROFILE);
const topologyProfile = readJson(TOPOLOGY_PROFILE);
assertSame(localProfile, topologyProfile, "Local master profile copies differ");

const liveProfileResponse = await api("GET", `/config-profiles/${PROFILE_UUID}`);
const liveProfile = liveProfileResponse.config;
if (!liveProfile?.routing?.rules) throw new Error("Live profile has no routing rules");

const oldIpReferences = occurrences(liveProfile, OLD_IP);
if (![0, EXPECTED_REPLACEMENTS].includes(oldIpReferences)) {
  throw new Error(`Expected zero or ${EXPECTED_REPLACEMENTS} old-IP references, found ${oldIpReferences}`);
}
if (occurrences(localProfile, OLD_IP) !== 0) throw new Error("Local profile still contains old Moscow IP");
if (occurrences(localProfile, NEW_IP) !== EXPECTED_REPLACEMENTS) {
  throw new Error("Local profile does not contain the expected new-IP references");
}
if (
  youtubeDirectRuleCount(liveProfile) !== EXPECTED_YOUTUBE_DIRECT_RULES ||
  youtubeDirectRuleCount(localProfile) !== EXPECTED_YOUTUBE_DIRECT_RULES
) {
  throw new Error(`Expected ${EXPECTED_YOUTUBE_DIRECT_RULES} YouTube direct-to-Moscow rules`);
}

const patchedProfile = replaceOldIp(liveProfile);
assertSame(patchedProfile, localProfile, "Live profile differs from local beyond the Moscow IP cutover");
const alreadyApplied = oldIpReferences === 0;

console.log(JSON.stringify({
  mode: APPLY ? "apply" : "check",
  alreadyApplied,
  oldIpReferences,
  newIpReferences: occurrences(patchedProfile, NEW_IP),
  youtubeDirectRules: youtubeDirectRuleCount(patchedProfile),
  fullProfileMatchesLocal: true,
}, null, 2));

if (!APPLY) {
  console.log("CHECK ONLY: run with --apply to patch the profile; Remnawave reloads Xray automatically.");
  process.exit(0);
}

let dir = null;
if (!alreadyApplied) {
  dir = backupDir();
  writeSecureJson(dir, "profile.before.json", liveProfileResponse);
  const patchedResponse = await api("PATCH", "/config-profiles", {
    uuid: PROFILE_UUID,
    config: patchedProfile,
  });
  writeSecureJson(dir, "profile.patch.response.json", patchedResponse);
  await new Promise((resolve) => setTimeout(resolve, 2500));
}

const nodesResponse = await api("GET", "/nodes");
const nodes = Array.isArray(nodesResponse) ? nodesResponse : nodesResponse?.nodes || [];
const node = nodes.find((item) => item.name === NODE_NAME);
if (!node?.uuid || node.isDisabled) throw new Error("Active Moscow node was not found");

const finalProfileResponse = await api("GET", `/config-profiles/${PROFILE_UUID}`);
assertSame(finalProfileResponse.config, localProfile, "Final live profile does not match local profile");
if (occurrences(finalProfileResponse.config, OLD_IP) !== 0) {
  throw new Error("Final live profile still contains old Moscow IP");
}

const finalNode = await api("GET", `/nodes/${node.uuid}`);
if (finalNode.isDisabled || finalNode.lastStatusMessage) {
  throw new Error("Moscow node reported an unhealthy status after restart");
}

console.log(JSON.stringify({
  result: alreadyApplied ? "Moscow routing cutover already applied" : "Moscow routing cutover applied",
  backupDir: dir ? path.relative(ROOT, dir) : null,
  profileMatchesLocal: true,
  oldIpReferences: 0,
  youtubeDirectRules: EXPECTED_YOUTUBE_DIRECT_RULES,
  nodeDisabled: finalNode.isDisabled,
  nodeStatusMessage: finalNode.lastStatusMessage,
}, null, 2));
