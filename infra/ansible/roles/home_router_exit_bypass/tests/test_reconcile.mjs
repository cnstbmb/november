import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "home-exit-bypass-"));
const roleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reconcile = path.join(roleDir, "files/reconcile.sh");
const persistent = path.join(testDir, "31-home-exit-bypass.nft");
const desired = path.join(testDir, "desired.nft");
const nftState = path.join(testDir, "live.nft");
const nft = path.join(testDir, "nft");
const firewall = path.join(testDir, "firewall");

fs.writeFileSync(
  nft,
  `#!/bin/sh
set -eu
case "$1 $2 $3 $4 \${5:-}" in
  "list chain inet home_exit_bypass prerouting")
    [ -f "$NFT_STATE_FILE" ] || exit 1
    cat "$NFT_STATE_FILE"
    ;;
  "list table inet home_exit_bypass ")
    [ -f "$NFT_STATE_FILE" ]
    ;;
  "delete table inet home_exit_bypass ")
    rm -f "$NFT_STATE_FILE"
    ;;
  *)
    echo "unexpected nft invocation: $*" >&2
    exit 2
    ;;
esac
`,
  { mode: 0o755 },
);

fs.writeFileSync(
  firewall,
  `#!/bin/sh
set -eu
[ "$1" = reload ]
if [ -f "$HOME_EXIT_BYPASS_PERSISTENT_FILE" ]; then
  cat "$HOME_EXIT_BYPASS_PERSISTENT_FILE" >> "$NFT_STATE_FILE"
fi
`,
  { mode: 0o755 },
);

const env = {
  ...process.env,
  NFT_BIN: nft,
  NFT_STATE_FILE: nftState,
  FIREWALL_INIT: firewall,
  HOME_EXIT_BYPASS_PERSISTENT_FILE: persistent,
  HOME_EXIT_BYPASS_DESIRED_FILE: desired,
  HOME_EXIT_BYPASS_BACKUP_DIR: testDir,
};

function run(...args) {
  const result = spawnSync("sh", [reconcile, ...args], { env, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  run("--apply", "present", "192.168.1.164", "0x00020000");
  assert.equal((fs.readFileSync(nftState, "utf8").match(/meta mark set/g) ?? []).length, 1);

  fs.appendFileSync(persistent, "\n");
  run("--apply", "present", "192.168.1.164", "0x00020000");
  assert.equal(
    (fs.readFileSync(nftState, "utf8").match(/meta mark set/g) ?? []).length,
    1,
    "reconciliation must replace the custom table instead of appending a duplicate rule",
  );

  run("--apply", "absent", "192.168.1.164", "0x00020000");
  assert.equal(fs.existsSync(nftState), false, "absent state must remove the live custom table");
  assert.equal(fs.existsSync(persistent), false, "absent state must remove persistence");
  assert.match(run("--check", "absent", "192.168.1.164", "0x00020000"), /changed=false/);
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
}

console.log("HOME router exit bypass reconciliation is idempotent and removable.");
