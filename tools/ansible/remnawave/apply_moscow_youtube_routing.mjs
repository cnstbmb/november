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
const EXPECTED_YOUTUBE_RULES = 0;
const REMOVABLE_YOUTUBE_RULES = 3;
const APPLY = process.argv.includes("--apply");
const UNKNOWN_ARGS = process.argv.slice(2).filter((arg) => arg !== "--apply");

if (UNKNOWN_ARGS.length > 0) throw new Error(`Unknown arguments: ${UNKNOWN_ARGS.join(", ")}`);

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(TOKEN_ENV, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error("REMNAWAVE_TOKEN was not found");
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

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function youtubeRules(config) {
  return (config.routing?.rules || []).filter(
    (rule) =>
      Array.isArray(rule.domain) &&
      rule.domain.includes("geosite:youtube") &&
      rule.outboundTag === "IPv4",
  );
}

function withoutYoutubeRules(config) {
  const copy = structuredClone(config);
  copy.routing.rules = copy.routing.rules.filter(
    (rule) => !Array.isArray(rule.domain) || !rule.domain.includes("geosite:youtube"),
  );
  return copy;
}

function assertRoutingContract(config) {
  if (youtubeRules(config).length !== EXPECTED_YOUTUBE_RULES) {
    throw new Error("Local profile still contains YouTube-to-Moscow rules");
  }
  const balancer = (config.routing?.balancers || []).find((item) => item.tag === "HOME_OR_MOSCOW");
  if (!balancer || !same(balancer.selector, ["GRPC_TO_HOME_RU"]) || balancer.fallbackTag !== "IPv4") {
    throw new Error("HOME_OR_MOSCOW balancer contract is invalid");
  }
  if (
    !same(config.observatory?.subjectSelector, ["GRPC_TO_HOME_RU"]) ||
    config.observatory?.probeInterval !== "15s" ||
    config.observatory?.probeUrl !== "https://ya.ru/"
  ) {
    throw new Error("Home observatory contract is invalid");
  }
}

function backupDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(ROOT, ".private/backups/moscow-youtube-routing", stamp);
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
if (!same(localProfile, topologyProfile)) throw new Error("Local master profile copies differ");
assertRoutingContract(localProfile);

const liveProfileResponse = await api("GET", `/config-profiles/${PROFILE_UUID}`);
const liveProfile = liveProfileResponse.config;
const alreadyApplied = same(liveProfile, localProfile);
const liveYoutubeRuleCount = youtubeRules(liveProfile).length;
if (![EXPECTED_YOUTUBE_RULES, REMOVABLE_YOUTUBE_RULES].includes(liveYoutubeRuleCount)) {
  throw new Error("Live profile contains an unexpected number of YouTube routing rules");
}
if (!alreadyApplied && !same(withoutYoutubeRules(liveProfile), localProfile)) {
  throw new Error("Live profile differs from local beyond the expected YouTube routing rules");
}

console.log(JSON.stringify({
  mode: APPLY ? "apply" : "check",
  alreadyApplied,
  liveYoutubeRules: liveYoutubeRuleCount,
  targetYoutubeRules: EXPECTED_YOUTUBE_RULES,
  homeBalancer: "Home with Moscow fallback",
  observatoryInterval: localProfile.observatory.probeInterval,
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
    config: localProfile,
  });
  writeSecureJson(dir, "profile.patch.response.json", patchedResponse);
  await new Promise((resolve) => setTimeout(resolve, 2500));
}

const finalProfileResponse = await api("GET", `/config-profiles/${PROFILE_UUID}`);
if (!same(finalProfileResponse.config, localProfile)) throw new Error("Final live profile does not match local");

const nodesResponse = await api("GET", "/nodes");
const nodes = Array.isArray(nodesResponse) ? nodesResponse : nodesResponse?.nodes || [];
const node = nodes.find((item) => item.name === NODE_NAME);
if (!node?.uuid || node.isDisabled) throw new Error("Active Moscow node was not found");
const finalNode = await api("GET", `/nodes/${node.uuid}`);
if (finalNode.isDisabled || finalNode.lastStatusMessage) {
  throw new Error("Moscow node reported an unhealthy status after profile reload");
}

console.log(JSON.stringify({
  result: alreadyApplied ? "Default YouTube routing already applied" : "Default YouTube routing applied",
  backupDir: dir ? path.relative(ROOT, dir) : null,
  liveYoutubeRules: EXPECTED_YOUTUBE_RULES,
  profileMatchesLocal: true,
  nodeHealthy: true,
}, null, 2));
