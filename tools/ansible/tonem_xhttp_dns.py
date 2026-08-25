#!/usr/bin/env python3

import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = ROOT / ".private/ansible/prod/remnawave-tonem-xhttp.json"
API_BASE = "https://api.cloudflare.com/client/v4"


def plan_dns_actions(records, targets):
    actions = []
    for target_name, target in targets.items():
        if not target.get("enabled"):
            continue
        hostname = target["domain"]
        ipv4 = target.get("publicIpv4", "")
        if not ipv4:
            raise ValueError(f"{target_name}.publicIpv4 is required")
        matching = [record for record in records if record.get("name") == hostname]
        a_records = [record for record in matching if record.get("type") == "A"]
        aaaa_records = [record for record in matching if record.get("type") == "AAAA"]
        if not a_records:
            actions.append(
                {
                    "action": "create",
                    "name": hostname,
                    "payload": {
                        "type": "A",
                        "name": hostname,
                        "content": ipv4,
                        "ttl": 1,
                        "proxied": False,
                    },
                }
            )
        else:
            primary = a_records[0]
            if primary.get("content") != ipv4 or primary.get("proxied") is not False:
                actions.append(
                    {
                        "action": "update",
                        "id": primary["id"],
                        "name": hostname,
                        "payload": {
                            "type": "A",
                            "name": hostname,
                            "content": ipv4,
                            "ttl": 1,
                            "proxied": False,
                        },
                    }
                )
            for duplicate in a_records[1:]:
                actions.append(
                    {"action": "delete-duplicate-a", "id": duplicate["id"], "name": hostname}
                )
        for record in aaaa_records:
            actions.append(
                {"action": "delete-aaaa", "id": record["id"], "name": hostname}
            )
    return actions


class Cloudflare:
    def __init__(self, token):
        self.token = token

    def request(self, method, endpoint, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(
            f"{API_BASE}{endpoint}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            raise RuntimeError(f"Cloudflare API returned HTTP {error.code}: {detail}") from error
        if not result.get("success"):
            raise RuntimeError(f"Cloudflare API failed: {result.get('errors')}")
        return result


def find_zone(client, zone_name):
    query = urllib.parse.urlencode({"name": zone_name})
    result = client.request("GET", f"/zones?{query}").get("result", [])
    if len(result) != 1:
        raise RuntimeError(f"Expected exactly one Cloudflare zone named {zone_name}")
    return result[0]["id"]


def list_records(client, zone_id):
    result = client.request("GET", f"/zones/{zone_id}/dns_records?per_page=500")
    return result.get("result", [])


def apply_actions(client, zone_id, actions):
    for action in actions:
        kind = action["action"]
        if kind == "create":
            client.request("POST", f"/zones/{zone_id}/dns_records", action["payload"])
        elif kind == "update":
            client.request(
                "PUT",
                f"/zones/{zone_id}/dns_records/{action['id']}",
                action["payload"],
            )
        else:
            client.request("DELETE", f"/zones/{zone_id}/dns_records/{action['id']}")


def main():
    parser = argparse.ArgumentParser(
        description="Audit or reconcile direct A-only DNS for TONEM XHTTP facades."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--config", type=Path, default=CONFIG_FILE)
    args = parser.parse_args()

    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        raise RuntimeError("CLOUDFLARE_API_TOKEN is required on the controller")
    config = json.loads(args.config.read_text())
    client = Cloudflare(token)
    zone_id = find_zone(client, "tonem.ru")
    actions = plan_dns_actions(list_records(client, zone_id), config["targets"])
    if args.apply and actions:
        apply_actions(client, zone_id, actions)
    print(
        json.dumps(
            {
                "mode": "apply" if args.apply else "check",
                "drift": bool(actions),
                "actions": [
                    {"action": action["action"], "name": action["name"]}
                    for action in actions
                ],
            },
            indent=2,
        )
    )
    if args.check and actions:
        return 2
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        print(f"TONEM XHTTP DNS reconciliation failed: {error}", file=sys.stderr)
        raise SystemExit(1)

