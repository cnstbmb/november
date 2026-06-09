import http from "node:http";

const bindHost = process.env.EXPORTER_HOST || "0.0.0.0";
const port = Number(process.env.EXPORTER_PORT || "9808");
const baseUrl = (process.env.REMNAWAVE_API_BASE || "").replace(/\/+$/, "");
const token = process.env.REMNAWAVE_API_TOKEN || "";
const cacheTtlMs = Number(process.env.EXPORTER_CACHE_TTL_MS || "15000");

let cache = {
  expiresAt: 0,
  body: "",
  ok: false,
  error: "not scraped yet",
};

function esc(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function metricLine(name, labels, value) {
  const labelText = Object.entries(labels)
    .filter(([, labelValue]) => labelValue !== undefined && labelValue !== null)
    .map(([labelName, labelValue]) => `${labelName}="${esc(labelValue)}"`)
    .join(",");
  return `${name}{${labelText}} ${value}`;
}

async function fetchNodes() {
  if (!baseUrl || !token) {
    throw new Error("REMNAWAVE_API_BASE and REMNAWAVE_API_TOKEN are required");
  }

  const res = await fetch(`${baseUrl}/nodes`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET /nodes failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function renderMetrics(payload) {
  const nodes = Array.isArray(payload.response) ? payload.response : [];
  const lines = [
    "# HELP remnawave_node_connected Remnawave node connection status reported by panel.",
    "# TYPE remnawave_node_connected gauge",
    "# HELP remnawave_node_disabled Remnawave node disabled flag reported by panel.",
    "# TYPE remnawave_node_disabled gauge",
    "# HELP remnawave_node_connecting Remnawave node connecting flag reported by panel.",
    "# TYPE remnawave_node_connecting gauge",
    "# HELP remnawave_node_users_online Users online on node reported by panel.",
    "# TYPE remnawave_node_users_online gauge",
    "# HELP remnawave_node_xray_uptime_seconds Xray uptime on node reported by panel.",
    "# TYPE remnawave_node_xray_uptime_seconds gauge",
    "# HELP remnawave_node_info Static Remnawave node information.",
    "# TYPE remnawave_node_info gauge",
  ];

  for (const node of nodes) {
    const labels = {
      uuid: node.uuid,
      node: node.name,
      address: node.address,
      country: node.countryCode,
    };
    lines.push(metricLine("remnawave_node_connected", labels, node.isConnected ? 1 : 0));
    lines.push(metricLine("remnawave_node_disabled", labels, node.isDisabled ? 1 : 0));
    lines.push(metricLine("remnawave_node_connecting", labels, node.isConnecting ? 1 : 0));
    lines.push(metricLine("remnawave_node_users_online", labels, Number(node.usersOnline || 0)));
    lines.push(metricLine("remnawave_node_xray_uptime_seconds", labels, Number(node.xrayUptime || 0)));
    lines.push(metricLine("remnawave_node_info", {
      ...labels,
      node_version: node.versions?.node || "",
      xray_version: node.versions?.xray || "",
      active_plugin_uuid: node.activePluginUuid || "",
      last_status_message: node.lastStatusMessage || "",
    }, 1));
  }

  return `${lines.join("\n")}\n`;
}

async function metrics() {
  const now = Date.now();
  if (cache.expiresAt > now) return cache;

  try {
    const payload = await fetchNodes();
    cache = {
      expiresAt: now + cacheTtlMs,
      body: renderMetrics(payload),
      ok: true,
      error: "",
    };
  } catch (err) {
    cache = {
      expiresAt: now + cacheTtlMs,
      body: [
        "# HELP remnawave_status_exporter_up Remnawave status exporter scrape status.",
        "# TYPE remnawave_status_exporter_up gauge",
        "remnawave_status_exporter_up 0",
        `remnawave_status_exporter_error{message="${esc(err.message)}"} 1`,
        "",
      ].join("\n"),
      ok: false,
      error: err.message,
    };
  }
  return cache;
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: cache.ok, error: cache.error }));
    return;
  }

  if (req.url !== "/metrics") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found\n");
    return;
  }

  const result = await metrics();
  res.writeHead(result.ok ? 200 : 500, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
  res.end(result.body);
});

server.listen(port, bindHost, () => {
  console.log(`remnawave-status-exporter listening on ${bindHost}:${port}`);
});
