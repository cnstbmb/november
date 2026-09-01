import { lookup as dnsLookup } from "node:dns/promises";
import { Agent, fetch } from "undici";
import ipaddr from "ipaddr.js";
import type { SourcePolicy } from "../config/config";

export class UnsafeUrlError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface FetchedDocument {
  finalUrl: string;
  contentType: string;
  body: string;
  status: number;
}

export function assertSafeUrlShape(value: string, policy: SourcePolicy): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeUrlError("invalid_url");
  }
  if (url.username || url.password)
    throw new UnsafeUrlError("embedded_credentials");
  const scheme = url.protocol.slice(0, -1) as "https" | "http";
  if (!policy.network.schemes.includes(scheme))
    throw new UnsafeUrlError("scheme_not_allowed");
  const port = Number(url.port || (scheme === "https" ? 443 : 80));
  if (!policy.network.ports.includes(port))
    throw new UnsafeUrlError("port_not_allowed");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = policy.hosts.exact.some(
    (base) =>
      host === base ||
      (policy.hosts.includeSubdomains && host.endsWith(`.${base}`)),
  );
  if (!allowed) throw new UnsafeUrlError("host_not_allowed");
  url.hash = "";
  return url;
}

export function assertPublicAddress(address: string): void {
  const parsed = ipaddr.process(address);
  const range = parsed.range();
  if (range !== "unicast") throw new UnsafeUrlError(`ip_${range}`);
}

export class SafeHttpFetcher {
  async fetch(value: string, policy: SourcePolicy): Promise<FetchedDocument> {
    if (
      policy.policyStatus !== "approved" ||
      !policy.live.enabled ||
      !policy.allowedModes.includes("manual_url")
    )
      throw new UnsafeUrlError("policy_not_approved");
    let url = assertSafeUrlShape(value, policy);
    for (let hop = 0; hop <= policy.network.maxRedirects; hop++) {
      const records = await dnsLookup(url.hostname, {
        all: true,
        order: "verbatim",
      });
      if (!records.length) throw new UnsafeUrlError("dns_empty");
      for (const record of records) assertPublicAddress(record.address);
      const selected = records[0]!;
      const dispatcher = new Agent({
        connect: {
          lookup: (_host, _options, callback) =>
            callback(null, selected.address, selected.family),
        },
      });
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        policy.network.timeoutMs,
      );
      try {
        const response = await fetch(url, {
          redirect: "manual",
          dispatcher,
          signal: controller.signal,
          headers: {
            "user-agent": "china-career-radar/0.1 (+private family research)",
          },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location || hop === policy.network.maxRedirects)
            throw new UnsafeUrlError("redirect_rejected");
          const next = new URL(location, url);
          if (
            next.hostname !== url.hostname &&
            !policy.redirectHosts.includes(next.hostname)
          )
            throw new UnsafeUrlError("redirect_host_not_allowed");
          url = assertSafeUrlShape(next.toString(), policy);
          continue;
        }
        if (response.status < 200 || response.status >= 300)
          throw new UnsafeUrlError(`http_status_${response.status}`);
        const contentType =
          response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
        if (!policy.network.contentTypes.includes(contentType))
          throw new UnsafeUrlError("content_type_not_allowed");
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of response.body ?? []) {
          const bytes =
            chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          size += bytes.length;
          if (size > policy.network.maxResponseBytes)
            throw new UnsafeUrlError("response_too_large");
          chunks.push(bytes);
        }
        return {
          finalUrl: url.toString(),
          contentType,
          body: Buffer.concat(chunks).toString("utf8"),
          status: response.status,
        };
      } finally {
        clearTimeout(timeout);
        await dispatcher.close();
      }
    }
    throw new UnsafeUrlError("redirect_limit");
  }
}
