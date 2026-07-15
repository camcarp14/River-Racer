#!/usr/bin/env node
/**
 * River Racer automated smoke-test harness.
 *
 * Usage:
 *   node tools/screenshot.js [--course=N] [--vehicle=N] ["?query=string"]
 *
 * Exit codes:
 *   0  everything OK (WebGL works, RRTest reached ready, no console/page errors)
 *   1  test failure (console errors, page errors, RRTest never ready, timeout, ...)
 *   2  WebGL could not be initialised with any GL backend
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(REPO_ROOT, 'shots');
const REPORT_PATH = path.join(SHOTS_DIR, 'report.json');
const INDEX_URL_BASE = 'file://' + path.join(REPO_ROOT, 'index.html');

const VIEWPORT = { width: 1280, height: 720 };
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 250;
const GLOBAL_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Argv parsing
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
let queryString = '';
let courseIdx = 0;
let vehicleIdx = 0;
for (const arg of argv) {
  let m;
  if (arg.startsWith('?')) {
    queryString = arg;
  } else if ((m = arg.match(/^--course=(\d+)$/))) {
    courseIdx = parseInt(m[1], 10);
  } else if ((m = arg.match(/^--vehicle=(\d+)$/))) {
    vehicleIdx = parseInt(m[1], 10);
  } else {
    console.warn(`[harness] ignoring unrecognised argument: ${arg}`);
  }
}
const GAME_URL = INDEX_URL_BASE + queryString;

// ---------------------------------------------------------------------------
// Shared report object (kept up to date so the watchdog can dump it any time)
// ---------------------------------------------------------------------------
const report = {
  ok: false,
  webgl: { ok: false, backend: null, renderer: null, attempts: [] },
  fps: null,
  ready: false,
  failReason: null,
  url: GAME_URL,
  course: courseIdx,
  vehicle: vehicleIdx,
  consoleErrors: [],
  pageErrors: [],
  consoleMessages: [],
  states: [],
  screenshots: [],
  startedAt: new Date().toISOString(),
  finishedAt: null,
};

function writeReport() {
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  } catch (err) {
    console.error('[harness] failed to write report.json:', err.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref();
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Watchdog: hard-kill the whole run after GLOBAL_TIMEOUT_MS no matter what.
// ---------------------------------------------------------------------------
let activeBrowser = null;
const watchdog = setTimeout(() => {
  console.error(`\n[harness] WATCHDOG: global ${GLOBAL_TIMEOUT_MS / 1000}s timeout hit - aborting.`);
  report.failReason = report.failReason || `watchdog: global ${GLOBAL_TIMEOUT_MS / 1000}s timeout`;
  writeReport();
  if (activeBrowser) {
    // Fire and forget; give it a moment then die regardless.
    try { activeBrowser.close().catch(() => {}); } catch (_) {}
  }
  setTimeout(() => process.exit(1), 2000).unref();
}, GLOBAL_TIMEOUT_MS);
watchdog.unref();

// ---------------------------------------------------------------------------
// WebGL probe: launch chromium, create a webgl2 context on a blank page.
// ---------------------------------------------------------------------------
const WEBGL_PROBE = `(() => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { ok: false, error: 'getContext returned null' };
    let renderer = null, vendor = null;
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
      }
    } catch (_) {}
    return {
      ok: true,
      webgl2: !!canvas.getContext('webgl2'),
      renderer: renderer || gl.getParameter(gl.RENDERER),
      vendor: vendor || gl.getParameter(gl.VENDOR),
      version: gl.getParameter(gl.VERSION),
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
})()`;

const LAUNCH_ATTEMPTS = [
  { backend: 'default', args: [] },
  { backend: 'swiftshader-webgl', args: ['--use-gl=swiftshader-webgl', '--enable-unsafe-swiftshader'] },
  { backend: 'angle-swiftshader', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
];

async function launchWithWebGL() {
  for (const attempt of LAUNCH_ATTEMPTS) {
    let browser = null;
    try {
      console.log(`[harness] launching chromium (backend: ${attempt.backend})...`);
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: false,
        args: attempt.args,
        timeout: 20_000,
      });
      activeBrowser = browser;
      const page = await browser.newPage({ viewport: VIEWPORT });
      const probe = await withTimeout(page.evaluate(WEBGL_PROBE), 10_000, 'WebGL probe');
      await page.close().catch(() => {});
      report.webgl.attempts.push({ backend: attempt.backend, ...probe });
      if (probe.ok) {
        report.webgl.ok = true;
        report.webgl.backend = attempt.backend;
        report.webgl.renderer = probe.renderer || null;
        console.log(`[harness] WebGL OK via '${attempt.backend}' (renderer: ${probe.renderer})`);
        return browser;
      }
      console.warn(`[harness] no WebGL with backend '${attempt.backend}': ${probe.error}`);
      activeBrowser = null;
      await browser.close().catch(() => {});
    } catch (err) {
      report.webgl.attempts.push({ backend: attempt.backend, ok: false, error: err.message });
      console.warn(`[harness] launch/probe failed for backend '${attempt.backend}': ${err.message}`);
      if (browser) {
        activeBrowser = null;
        await browser.close().catch(() => {});
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Screenshot helper
// ---------------------------------------------------------------------------
async function shoot(page, name) {
  const file = path.join(SHOTS_DIR, name);
  try {
    await withTimeout(page.screenshot({ path: file }), 15_000, `screenshot ${name}`);
    report.screenshots.push(path.relative(REPO_ROOT, file));
    console.log(`[harness] screenshot -> ${path.relative(REPO_ROOT, file)}`);
  } catch (err) {
    console.warn(`[harness] screenshot ${name} failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  // 1. Launch with WebGL fallback chain.
  const browser = await launchWithWebGL();
  if (!browser) {
    report.failReason = 'WebGL could not be initialised with any GL backend (tried: '
      + LAUNCH_ATTEMPTS.map((a) => a.backend).join(', ') + ')';
    console.error(`[harness] FATAL: ${report.failReason}`);
    writeReport();
    printSummary();
    process.exitCode = 2;
    return;
  }

  try {
    const page = await browser.newPage({ viewport: VIEWPORT });

    // 3. Capture ALL console messages and page errors.
    page.on('console', (msg) => {
      const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
      report.consoleMessages.push(entry);
      if (msg.type() === 'error') report.consoleErrors.push(entry);
    });
    page.on('pageerror', (err) => {
      report.pageErrors.push({ message: err.message, stack: err.stack || null });
    });

    // 2. Open the game.
    console.log(`[harness] opening ${GAME_URL}`);
    try {
      await page.goto(GAME_URL, { waitUntil: 'load', timeout: 20_000 });
    } catch (err) {
      report.failReason = `page.goto failed: ${err.message}`;
      console.error(`[harness] ${report.failReason}`);
      await shoot(page, '01-title.png'); // diagnostic shot of whatever rendered
      return; // finally-block writes report; exit code decided at the end
    }

    // 4. Wait for RRTest.ready (poll 250ms, 30s timeout).
    console.log('[harness] waiting for window.RRTest.ready (30s timeout)...');
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      let ready = false;
      try {
        ready = await withTimeout(
          page.evaluate(() => !!(window.RRTest && window.RRTest.ready)),
          5_000,
          'RRTest.ready poll',
        );
      } catch (err) {
        console.warn(`[harness] ready poll error: ${err.message}`);
      }
      if (ready) { report.ready = true; break; }
      await sleep(READY_POLL_MS);
    }

    if (!report.ready) {
      report.failReason =
        'window.RRTest.ready never became true within 30s - the game test API '
        + 'is missing or the game failed to reach the title screen.';
      console.error(`[harness] ${report.failReason}`);
      await shoot(page, '01-title.png'); // diagnostic shot anyway
      await measureFps(page); // still useful for diagnosing a stuck page
      return;
    }

    console.log('[harness] RRTest.ready = true');
    await shoot(page, '01-title.png');

    // 5. Start the race.
    console.log(`[harness] RRTest.startRace(course=${courseIdx}, vehicle=${vehicleIdx})`);
    try {
      await withTimeout(
        page.evaluate(([c, v]) => window.RRTest.startRace(c, v), [courseIdx, vehicleIdx]),
        10_000,
        'startRace',
      );
    } catch (err) {
      report.failReason = `RRTest.startRace failed: ${err.message}`;
      console.error(`[harness] ${report.failReason}`);
      return;
    }
    await sleep(1000);
    await shoot(page, '02-start.png');

    // 6. Warp loop.
    for (let i = 1; i <= 6; i++) {
      try {
        await withTimeout(page.evaluate(() => window.RRTest.warp(8)), 10_000, `warp #${i}`);
      } catch (err) {
        console.warn(`[harness] warp #${i} failed: ${err.message}`);
      }
      await sleep(400);
      await shoot(page, `03-race-${i}.png`);
      try {
        const state = await withTimeout(page.evaluate(() => window.RRTest.getState()), 5_000, `getState #${i}`);
        report.states.push(state);
        console.log(`[harness] state #${i}: ${JSON.stringify(state)}`);
      } catch (err) {
        report.states.push({ error: err.message });
        console.warn(`[harness] getState #${i} failed: ${err.message}`);
      }
    }

    // 7. Real FPS over 3 seconds.
    await measureFps(page);
  } catch (err) {
    report.failReason = report.failReason || `harness error: ${err.message}`;
    console.error(`[harness] unexpected error: ${err.stack || err.message}`);
  } finally {
    activeBrowser = null;
    await browser.close().catch(() => {});
  }
}

async function measureFps(page) {
  console.log('[harness] measuring FPS over 3s of requestAnimationFrame...');
  try {
    report.fps = await withTimeout(
      page.evaluate(
        () =>
          new Promise((resolve) => {
            let frames = 0;
            const start = performance.now();
            const DURATION = 3000;
            function tick() {
              frames++;
              const elapsed = performance.now() - start;
              if (elapsed < DURATION) requestAnimationFrame(tick);
              else resolve(Math.round((frames / (elapsed / 1000)) * 10) / 10);
            }
            requestAnimationFrame(tick);
          }),
      ),
      10_000,
      'FPS measurement',
    );
    console.log(`[harness] measured FPS: ${report.fps}`);
  } catch (err) {
    console.warn(`[harness] FPS measurement failed: ${err.message}`);
    report.fps = null;
  }
}

// ---------------------------------------------------------------------------
// Summary + exit code
// ---------------------------------------------------------------------------
function printSummary() {
  const line = '-'.repeat(60);
  console.log(`\n${line}\nRIVER RACER SMOKE TEST SUMMARY\n${line}`);
  console.log(`URL:             ${report.url}`);
  console.log(`WebGL:           ${report.webgl.ok ? `OK (backend: ${report.webgl.backend}, renderer: ${report.webgl.renderer})` : 'FAILED - no backend produced a WebGL context'}`);
  console.log(`RRTest.ready:    ${report.ready ? 'yes' : 'NO'}`);
  console.log(`FPS:             ${report.fps == null ? 'n/a' : report.fps}`);
  console.log(`Console errors:  ${report.consoleErrors.length}`);
  for (const e of report.consoleErrors.slice(0, 5)) console.log(`  - ${e.text}`);
  console.log(`Page errors:     ${report.pageErrors.length}`);
  for (const e of report.pageErrors.slice(0, 5)) console.log(`  - ${e.message}`);
  console.log(`Screenshots:     ${report.screenshots.length} (${report.screenshots.join(', ') || 'none'})`);
  console.log(`States recorded: ${report.states.length}`);
  if (report.failReason) console.log(`Fail reason:     ${report.failReason}`);
  console.log(`Result:          ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Report:          ${path.relative(REPO_ROOT, REPORT_PATH)}\n${line}`);
}

(async () => {
  try {
    await main();
  } catch (err) {
    report.failReason = report.failReason || `fatal: ${err.message}`;
    console.error(`[harness] fatal: ${err.stack || err.message}`);
  } finally {
    clearTimeout(watchdog);
    // ok = WebGL worked, game reached ready, and zero console/page errors.
    report.ok =
      report.webgl.ok &&
      report.ready &&
      report.consoleErrors.length === 0 &&
      report.pageErrors.length === 0;
    writeReport();
    printSummary();
    if (process.exitCode === undefined) process.exitCode = report.ok ? 0 : 1;
  }
})();
