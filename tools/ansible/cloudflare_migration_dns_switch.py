#!/usr/bin/env python3

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path


CREDENTIALS_PATH = Path("/etc/letsencrypt/cloudflare.ini")
OLD_IP = "5.42.111.142"
NEW_IP = "193.124.64.187"
RECORDS = {
    "himenkov.ru": (
        "moscow.himenkov.ru",
        "panel.moscow.himenkov.ru",
        "sub.moscow.himenkov.ru",
        "bot.moscow.himenkov.ru",
    ),
    "tonem.ru": (
        "tonem.ru",
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


def api(
    token: str,
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    payload: dict[str, str] | None = None,
) -> dict:
    query = ""
    if params:
        query = "?" + urllib.parse.urlencode(params)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        "https://api.cloudflare.com/client/v4" + path + query,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    if not result.get("success"):
        raise RuntimeError(json.dumps(result.get("errors", []), ensure_ascii=False))
    return result


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"cutover", "rollback"}:
        print(f"Usage: {sys.argv[0]} cutover|rollback", file=sys.stderr)
        return 2

    action = sys.argv[1]
    expected_ip, desired_ip = (
        (OLD_IP, NEW_IP) if action == "cutover" else (NEW_IP, OLD_IP)
    )
    token = read_token()
    pending: list[dict] = []

    for zone_name, record_names in RECORDS.items():
        zones = api(
            token,
            "GET",
            "/zones",
            params={"name": zone_name, "status": "active"},
        )["result"]
        if len(zones) != 1:
            raise RuntimeError(
                f"{zone_name}: expected one active zone, found {len(zones)}"
            )
        zone_id = zones[0]["id"]

        for record_name in record_names:
            records = api(
                token,
                "GET",
                f"/zones/{zone_id}/dns_records",
                params={"type": "A", "name": record_name},
            )["result"]
            if len(records) != 1:
                raise RuntimeError(
                    f"{record_name}: expected one A record, found {len(records)}"
                )
            record = records[0]
            current_ip = record["content"]
            if current_ip == desired_ip:
                print(f"{record_name}: already {desired_ip}")
                continue
            if current_ip != expected_ip:
                raise RuntimeError(
                    f"{record_name}: refusing {action}; expected {expected_ip}, "
                    f"found {current_ip}"
                )
            pending.append(
                {
                    "zone_id": zone_id,
                    "record_id": record["id"],
                    "name": record_name,
                }
            )

    changed: list[dict] = []
    try:
        for record in pending:
            api(
                token,
                "PATCH",
                f"/zones/{record['zone_id']}/dns_records/{record['record_id']}",
                payload={"content": desired_ip},
            )
            changed.append(record)
            print(f"{record['name']}: {expected_ip} -> {desired_ip}")
    except Exception:
        print("DNS update failed; reverting records changed by this run", file=sys.stderr)
        for record in reversed(changed):
            api(
                token,
                "PATCH",
                f"/zones/{record['zone_id']}/dns_records/{record['record_id']}",
                payload={"content": expected_ip},
            )
            print(f"{record['name']}: reverted to {expected_ip}", file=sys.stderr)
        raise

    print(f"Cloudflare DNS {action} completed: {len(changed)} record(s) changed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Cloudflare DNS switch failed: {error}", file=sys.stderr)
        raise SystemExit(1)

