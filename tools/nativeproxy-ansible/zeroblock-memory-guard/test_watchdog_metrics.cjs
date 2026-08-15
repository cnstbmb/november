const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeroblock-metrics-'));
const watchdog = path.join(__dirname, 'zeroblock-memory-watchdog.sh');

try {
  execFileSync(
    '/bin/sh',
    [
      '-c',
      '. "$1"; write_metrics healthy 184320 32768 131072 2 1',
      'test-watchdog',
      watchdog,
    ],
    {
      env: {
        ...process.env,
        ZEROBLOCK_WATCHDOG_TEST_MODE: 'functions',
        ZEROBLOCK_METRICS_DIR: workDir,
      },
      timeout: 2000,
      stdio: 'pipe',
    },
  );

  const metrics = fs.readFileSync(path.join(workDir, 'zeroblock.prom'), 'utf8');
  assert.match(metrics, /^zeroblock_up 1$/m);
  assert.match(metrics, /^zeroblock_rss_bytes 188743680$/m);
  assert.match(metrics, /^zeroblock_swap_bytes 33554432$/m);
  assert.match(metrics, /^zeroblock_router_mem_available_bytes 134217728$/m);
  assert.match(metrics, /^zeroblock_watchdog_pressure_samples 2$/m);
  assert.match(metrics, /^zeroblock_watchdog_restart_count 1$/m);
  assert.match(metrics, /^zeroblock_watchdog_state\{state="healthy"\} 1$/m);
  assert.doesNotMatch(metrics, /\.tmp|undefined|NaN/);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}

console.log('Zeroblock watchdog Prometheus metrics are valid.');
