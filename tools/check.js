#!/usr/bin/env node
/**
 * River Racer fast dev check + free-camera screenshot tool.
 *
 * Loads index.html headless, waits for RRTest.ready, and fails on any console
 * or page error. Optionally parks a free camera anywhere in the world and
 * shoots a frame, so you can eyeball one building / bridge / easter egg
 * without racing to it.
 *
 * Usage:
 *   node tools/check.js
 *   node tools/check.js --shot=marina --cam=-120,40,60 --look=-60,60,-40
 *   node tools/check.js --shot=night --time=night --cam=0,30,200 --look=0,20,-200
 *   node tools/check.js --shot=race --race=0,0 --warp=20
 *   node tools/check.js --shot=menu --menu            (title screen, UI visible)
 *
 * Exit codes: 0 = clean, 1 = error (console/page error, never ready, timeout).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'dev');
const URL = 'file://' + path.join(ROOT, 'index.html');
const VIEWPORT = { width: 1280, height: 720 };

const opt = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
  if (m) opt[m[1]] = m[2] === undefined ? true : m[2];
}
const nums = (s, n) => {
  if (!s || s === true) return null;
  const v = String(s).split(',').map(Number);
  return v.length === n && v.every((x) => Number.isFinite(x)) ? v : null;
};

// --device=NAME emulates a phone: real CSS size, real DPR, and a touch-only context, so touch
// controls actually receive events and the HUD lays out against the size a phone really gives it.
// Landscape is the racing orientation; the portrait entries exist to test the rotate prompt.
const DEVICES = {
  'iphone-se': { width: 667, height: 375, dpr: 2 },        // the small landscape case
  'iphone-14': { width: 844, height: 390, dpr: 3 },
  'iphone-14-portrait': { width: 390, height: 844, dpr: 3 },
  'pixel-7': { width: 915, height: 412, dpr: 2.6 },
  'ipad': { width: 1080, height: 810, dpr: 2 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const errors = [];
  let browser = null;
  const hardStop = setTimeout(() => {
    console.error('[check] WATCHDOG 150s — aborting');
    if (browser) browser.close().catch(() => {});
    process.exit(1);
  }, 150_000);
  hardStop.unref();

  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: false, timeout: 20_000 });
    const dev = opt.device && DEVICES[opt.device];
    if (opt.device && !dev) {
      throw new Error(`unknown --device=${opt.device}. Known: ${Object.keys(DEVICES).join(', ')}`);
    }
    const page = await browser.newPage(dev
      ? { viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr,
          isMobile: true, hasTouch: true }
      : { viewport: VIEWPORT });
    if (dev) console.log(`[check] device ${opt.device} — ${dev.width}x${dev.height} @${dev.dpr}x, touch`);
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('page: ' + (e && e.message ? e.message : String(e))));

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // wait for the world to finish building
    const t0 = Date.now();
    let ready = false;
    while (Date.now() - t0 < 90_000) {
      ready = await page.evaluate(() => !!(window.RRTest && window.RRTest.ready)).catch(() => false);
      if (ready) break;
      await sleep(300);
    }
    if (!ready) throw new Error('RRTest.ready never became true (world build failed or stalled)');
    console.log(`[check] ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    await page.evaluate(() => window.RRTest.pinQuality && window.RRTest.pinQuality());

    if (opt.time) await page.evaluate((m) => window.RRTest.night(m), String(opt.time));

    // main.js overrides the camera with the attract flythrough while mode === 'menu', so a
    // free-cam shot from the title screen silently returns the menu view. Any --cam request
    // therefore starts a race first unless you explicitly asked to stay on the menu.
    const wantsFreeCam = !!(opt.cam && opt.look) && !opt.menu;
    if ((opt.race !== undefined && opt.race !== true) || wantsFreeCam) {
      const rv = nums(opt.race, 2) || [0, 0];
      await page.evaluate(([c, v]) => window.RRTest.startRace(c, v), rv);
      await sleep(500);
    }
    if (opt.warp) await page.evaluate((s) => window.RRTest.warp(Number(s)), opt.warp);

    const cam = nums(opt.cam, 3);
    const look = nums(opt.look, 3);
    if (cam && look) {
      await page.evaluate(([c, l]) => window.RRTest.setCamera(c[0], c[1], c[2], l[0], l[1], l[2]), [cam, look]);
      // hide HUD/menu chrome so the shot is pure world
      if (!opt.menu) {
        await page.evaluate(() => {
          for (const id of ['hud', 'menu', 'loading']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
        });
      }
    }

    // let a few frames land (adaptive quality is pinned, so this is stable)
    await sleep(Number(opt.settle) || 2500);

    if (opt.shot) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const file = path.join(SHOTS, `${opt.shot}.png`);
      await page.screenshot({ path: file, timeout: 20_000 });
      console.log('[check] shot -> ' + path.relative(ROOT, file));
    }

    const fps = await page.evaluate(() => RR.Engine.fps()).catch(() => null);
    const info = await page.evaluate(() => ({
      calls: RR.Engine.renderer.info.render.calls,
      tris: RR.Engine.renderer.info.render.triangles,
      geometries: RR.Engine.renderer.info.memory.geometries,
      textures: RR.Engine.renderer.info.memory.textures,
      programs: RR.Engine.renderer.info.programs ? RR.Engine.renderer.info.programs.length : null,
    })).catch(() => null);
    if (info) console.log(`[check] draw calls ${info.calls} · tris ${info.tris.toLocaleString()} · geo ${info.geometries} · tex ${info.textures} · programs ${info.programs}`);
    if (fps != null) console.log(`[check] fps (software renderer, not indicative) ${fps.toFixed(1)}`);

    await browser.close();
    clearTimeout(hardStop);
  } catch (err) {
    errors.unshift('fatal: ' + err.message);
    if (browser) await browser.close().catch(() => {});
  }

  if (errors.length) {
    console.error(`\n[check] FAIL — ${errors.length} error(s):`);
    for (const e of errors.slice(0, 25)) console.error('  ' + e);
    process.exit(1);
  }
  console.log('[check] PASS — no console or page errors');
  process.exit(0);
})();
