#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRolloutReady,
  createDefaultConfig,
  sanitizedSummary,
  validateConfig,
} from "./tonem_xhttp_config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../..");
const privateDir = path.join(rootDir, ".private/ansible/prod");
const configFile = path.join(privateDir, "remnawave-tonem-xhttp.json");
const homeLegacyFile = path.join(privateDir, "remnawave-home-xhttp.json");

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function prepare() {
  if (fs.existsSync(configFile)) return validateConfig(readJson(configFile));
  const homeLegacy = fs.existsSync(homeLegacyFile) ? readJson(homeLegacyFile) : undefined;
  const config = createDefaultConfig({ homeLegacy });
  validateConfig(config);
  writeAtomic(configFile, config);
  return config;
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (!args.has("--prepare") && !args.has("--check") && !args.has("--ready")) {
    throw new Error("Use --prepare, --check, or --ready");
  }

  const config = args.has("--prepare")
    ? prepare()
    : validateConfig(readJson(configFile));
  if (args.has("--ready")) assertRolloutReady(config);
  process.stdout.write(`${JSON.stringify(sanitizedSummary(config), null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
