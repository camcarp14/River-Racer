/* Deep-warp probe: drives far into a course and screenshots specific waypoints.
   Usage: node tools/deepwarp.js --course=0 --vehicle=1 --warps=24 [--label=lock] */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, true];
}));
const COURSE = +(args.course || 0), VEHICLE = +(args.vehicle || 0);
const WARPS = +(args.warps || 20), LABEL = args.label || `deep-c${COURSE}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.RRTest && window.RRTest.ready, null, { timeout: 30000 });
  await page.evaluate(([c, v]) => window.RRTest.startRace(c, v), [COURSE, VEHICLE]);
  await page.waitForTimeout(800);
  let lastShotAt = 0;
  for (let i = 1; i <= WARPS; i++) {
    await page.evaluate(() => window.RRTest.warp(8));
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => window.RRTest.getState());
    console.log(`warp ${i}: scene=${s.scene} pos=[${s.pos.map((n) => n.toFixed(0))}] cp=${s.checkpoint} place=${s.racePos} speed=${s.speed.toFixed(1)}`);
    if (i - lastShotAt >= Math.max(2, Math.floor(WARPS / 6)) || i === WARPS || s.scene === 'results') {
      lastShotAt = i;
      const f = `shots/${LABEL}-${String(i).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.resolve(__dirname, '..', f) });
      console.log('  shot ->', f);
    }
    if (s.scene === 'results') { console.log('RESULTS REACHED'); break; }
  }
  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
