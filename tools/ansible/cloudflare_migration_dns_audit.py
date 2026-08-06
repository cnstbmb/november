#!/usr/bin/env python3

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path


CREDENTIALS_PATH = Path("/etc/letsencrypt/cloudflare.ini")
RECORDS = {
    "himenkov.ru": (
        "moscow.himenkov.ru",
        "panel.moscow.himenkov.ru",
        "sub.moscow.himenkov.ru",
        "bot.moscow.himenkov.ru",
    ),
    "tonem.ru": (
        "tonem.ru",
        "www.tonem.ru",
        "api.tonem.ru",
    ),
}


def read_token() -> str:
    for raw_line in CREDENTIALS_PATH.read_text(encoding="utf-8").splitlines():
        key, separator, value = raw_line.partition("=")
        if separator and key.strip() == "dns_cloudflare_api_token":
            token = value.strip()
            if token:
                return token
    raise RuntimeError(f"Cloudflare API token not found in {CREDENTIALS_PATH}")


def api(token: str, path: str, params: dict[str, str] | None = None) -> dict:
    query = ""
    if params:
        query = "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        "https://api.cloudflare.com/client/v4" + path + query,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
    if not payload.get("success"):
        raise RuntimeError(json.dumps(payload.get("errors", []), ensure_ascii=False))
    return payload


def main() -> int:
    token = read_token()
    problems = 0

    for zone_name, record_names in RECORDS.items():
        zones = api(token, "/zones", {"name": zone_name, "status": "active"})["result"]
        if len(zones) != 1:
            print(f"{zone_name}: expected one active zone, found {len(zones)}")
            problems += 1
            continue

        zone_id = zones[0]["id"]
        for record_name in record_names:
            records = api(
                token,
                f"/zones/{zone_id}/dns_records",
                {"type": "A", "name": record_name},
            )["result"]
            if not records:
                print(f"{record_name}: MISSING A record")
                problems += 1
                continue
            if len(records) != 1:
                print(f"{record_name}: expected one A record, found {len(records)}")
                problems += 1
                continue

            record = records[0]
            proxy_state = "proxied" if record.get("proxied") else "dns-only"
            print(
                f"{record_name}: {record['content']} "
                f"({proxy_state}, ttl={record['ttl']})"
            )

    return 1 if problems else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"DNS audit failed: {error}", file=sys.stderr)
        raise SystemExit(1)

