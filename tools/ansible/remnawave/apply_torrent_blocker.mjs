#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const TOKEN_ENV = path.join(ROOT, ".private/ansible/prod/remnashop/.env");
const API_BASE = process.env.REMNAWAVE_API_BASE || "https://panel.moscow.himenkov.ru/api";
const PLUGIN_NAME = process.env.REMNAWAVE_TORRENT_BLOCKER_PLUGIN_NAME || "Torrent Blocker";
const BLOCK_DURATION = Number(process.env.REMNAWAVE_TORRENT_BLOCKER_BLOCK_DURATION || "3600");
const RESTART_NODES = process.env.REMNAWAVE_TORRENT_BLOCKER_RESTART !== "false";
const TARGET_NODES = (process.env.REMNAWAVE_TORRENT_BLOCKER_NODES || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function readToken() {
  if (process.env.REMNAWAVE_API_TOKEN) return process.env.REMNAWAVE_API_TOKEN;
  const env = fs.readFileSync(TOKEN_ENV, "utf8");
  const match = env.match(/^REMNAWAVE_TOKEN=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/m);
  if (!match) throw new Error(`REMNAWAVE_TOKEN not found in ${TOKEN_ENV}`);
  return (match[1] || match[2] || match[3]).trim();
}

function backupDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(ROOT, ".private/backups/torrent-blocker", stamp);
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

function pluginConfigWithTorrentBlocker(pluginConfig) {
  const current = pluginConfig && typeof pluginConfig === "object" ? pluginConfig : {};
  const torrentBlocker = current.torrentBlocker || {};
  return {
    ingressFilter: current.ingressFilter || {
      enabled: false,
      blockedIps: [],
    },
    egressFilter: current.egressFilter || {
      enabled: false,
      blockedIps: [],
      blockedPorts: [],
    },
    torrentBlocker: {
      ...torrentBlocker,
      enabled: true,
      ignoreLists: {
        ip: torrentBlocker.ignoreLists?.ip || [],
        userId: torrentBlocker.ignoreLists?.userId || [],
      },
      blockDuration: BLOCK_DURATION,
    },
    connectionDrop: current.connectionDrop || {
      enabled: false,
      whitelistIps: [],
    },
    sharedLists: current.sharedLists || [],
  };
}

function targetNodes(nodes) {
  if (TARGET_NODES.length === 0) {
    return nodes.filter((node) => !node.isDisabled && node.isConnected);
  }

  const selected = nodes.filter((node) => TARGET_NODES.includes(node.uuid) || TARGET_NODES.includes(node.name));
  const found = new Set(selected.flatMap((node) => [node.uuid, node.name]));
  const missing = TARGET_NODES.filter((target) => !found.has(target));
  if (missing.length > 0) {
    throw new Error(`Target nodes not found: ${missing.join(", ")}`);
  }
  return selected;
}

function assertInboundSniffing(nodes) {
  const missing = [];
  for (const node of nodes) {
    for (const inbound of node.configProfile?.activeInbounds || []) {
      const sniffing = inbound.rawInbound?.sniffing;
      const destOverride = sniffing?.destOverride || [];
      const hasRequiredSniffing =
        sniffing?.enabled === true &&
        ["http", "tls", "quic"].every((item) => destOverride.includes(item));
      if (!hasRequiredSniffing) {
        missing.push(`${node.name}:${inbound.tag}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Torrent Blocker requires sniffing on active inbounds: ${missing.join(", ")}`);
  }
}

const TOKEN = readToken();
const dir = backupDir();

const nodesBefore = await api("GET", "/nodes");
const pluginsBefore = await api("GET", "/node-plugins");
writeJson(dir, "nodes.before.json", nodesBefore);
writeJson(dir, "node-plugins.before.json", pluginsBefore);

const nodes = targetNodes(nodesBefore.response || []);
if (nodes.length === 0) throw new Error("No target Remnawave nodes found");
assertInboundSniffing(nodes);

const existingPlugin = (pluginsBefore.response?.nodePlugins || []).find((plugin) => plugin.name === PLUGIN_NAME);
const plugin = existingPlugin || (await api("POST", "/node-plugins", { name: PLUGIN_NAME })).response;
if (!existingPlugin) writeJson(dir, "node-plugin.create.response.json", { response: plugin });

const pluginConfig = pluginConfigWithTorrentBlocker(plugin.pluginConfig);
writeJson(dir, "node-plugin.patch.json", {
  uuid: plugin.uuid,
  name: PLUGIN_NAME,
  pluginConfig,
});

const pluginAfter = await api("PATCH", "/node-plugins", {
  uuid: plugin.uuid,
  name: PLUGIN_NAME,
  pluginConfig,
});
writeJson(dir, "node-plugin.patch.response.json", pluginAfter);

const nodeUpdates = [];
for (const node of nodes) {
  if (node.activePluginUuid !== plugin.uuid) {
    const updated = await api("PATCH", "/nodes", {
      uuid: node.uuid,
      activePluginUuid: plugin.uuid,
    });
    writeJson(dir, `node.${node.name}.patch.response.json`, updated);
    nodeUpdates.push({ name: node.name, uuid: node.uuid, activePluginUuid: plugin.uuid });
  }
}

const restarts = [];
if (RESTART_NODES) {
  for (const node of nodes) {
    const restarted = await api("POST", `/nodes/${node.uuid}/actions/restart`);
    writeJson(dir, `node.${node.name}.restart.response.json`, restarted);
    restarts.push({ name: node.name, uuid: node.uuid, response: restarted.response || restarted });
  }
}

const nodesAfter = await api("GET", "/nodes");
const pluginsAfter = await api("GET", "/node-plugins");
writeJson(dir, "nodes.after.json", nodesAfter);
writeJson(dir, "node-plugins.after.json", pluginsAfter);

console.log(JSON.stringify({
  backupDir: dir,
  plugin: {
    name: PLUGIN_NAME,
    uuid: plugin.uuid,
    torrentBlocker: pluginConfig.torrentBlocker,
  },
  nodes: nodes.map((node) => ({
    name: node.name,
    uuid: node.uuid,
  })),
  nodeUpdates,
  restarts,
}, null, 2));
