# SecondBrain client tools

`migrate-vault.mjs` performs the agreed one-time PARA migration. It refuses to
write while Obsidian is running, fails on destination conflicts, and never
deletes note content. Run without `--apply` for a plan.

```sh
node tools/secondbrain/migrate-vault.mjs --vault /path/to/SecondBrain
node tools/secondbrain/migrate-vault.mjs --vault /path/to/SecondBrain --apply
```

The authoritative pre-migration backup for this rollout is stored outside the
Vault under `.tmp/SecondBrain.pre-migration-20260817T205500Z`.

`configure-livesync.mjs` verifies authenticated HTTPS before touching the Vault,
enables the installed LiveSync plug-in, configures CouchDB + E2EE v2 + path
obfuscation, and schedules the current Mac as the local-authoritative initial
source. It prepares a narrow hidden-file allowlist but deliberately leaves
Hidden File Sync disabled until ordinary note sync is verified on every device.

After the first-run compatibility review has been acknowledged, close Obsidian
and run `finalize-livesync.mjs`. It enables the built-in continuous-sync preset
without rebuilding either the local or remote database.

`acceptance-livesync.mjs` creates one collision-safe fixture in `00 Inbox`,
observes its encrypted CouchDB update, removes only that fixture, and observes
the cleanup update. It never prints credentials or note contents.

`deploy-with-gui-password.sh` deploys the Ansible role over the warmed NanoPi
SSH ControlSocket and obtains the sudo password through a hidden macOS dialog.
The password exists only in a mode-0600 temporary file and is removed on exit.

`enable-hidden-sync.mjs` enables the reviewed Hidden File Sync allowlist only
after ordinary note sync has passed. It self-tests the allowed and denied paths
before writing settings and keeps Customisation Sync disabled. LLM Hub is
limited to `main.js`, `manifest.json`, and `styles.css`; its `data.json`, API
credentials, histories, and `.LLMHub` indexes remain device-local.

`setup-clipboard.mjs` moves either the private Setup URI passphrase into the
macOS clipboard or an encrypted Setup URI from the clipboard into the private
directory. It validates the URI scheme and never prints either secret.

`show-setup-passphrase.applescript` reads only the Setup URI passphrase from the
private env file and displays it in a local macOS dialog for cross-device entry.
The secret is never embedded in the script or printed to terminal output.

`device-roundtrip.mjs` performs a human-verifiable device round trip with one
collision-safe fixture. It records only the initial hash, validates the marker
returned by that device, and removes only its own fixture during cleanup.
