#!/usr/bin/env python3

import json
import subprocess
import sys
from urllib.parse import urlsplit


container_name = sys.argv[1] if len(sys.argv) > 1 else "remnashop"
inspection = json.loads(
    subprocess.check_output(
        ["docker", "inspect", container_name],
        text=True,
    )
)[0]

for environment_entry in inspection["Config"]["Env"]:
    key, separator, value = environment_entry.partition("=")
    if not separator or "PROXY" not in key.upper():
        continue
    parsed = urlsplit(value)
    print(
        f"{key}: "
        f"scheme={parsed.scheme or 'unset'} "
        f"host={parsed.hostname or 'unset'} "
        f"port={parsed.port or 'default'} "
        f"credentials={bool(parsed.username or parsed.password)}"
    )

