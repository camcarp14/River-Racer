'use strict';
/* Which way does the boat actually go? Desktop keyboard vs phone thumb, forward and astern.
   Frame-locked with RRTest.step (which advances the sim WITHOUT the autopilot that RRTest.warp
   installs — warp overwrites RR.Input every frame and makes every reading meaningless).
   Measured against SCREEN axes, because "left" is a screen word:
     world forward = (sin h, 0, cos h); screen-right = cross(forward, up) = (cos h, 0, -sin h)
     => a heading that DECREASES turns the hull toward SCREEN-RIGHT. */
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join('/home/user/River-Racer', 'index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(browser, dev) {
  const page = await browser.newPage(dev
    ? { viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    if (await page.evaluate(() => !!(window.RRTest && window.RRTest.ready)).catch(() => 0)) break;
    await sleep(300);
  }
  await page.evaluate(() => window.RRTest.startRace(0, 0));
  await sleep(600);
  await page.evaluate(() => window.RRTest.step(4));      // clear the countdown, no autopilot
  await sleep(400);
  return page;
}

const norm = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// Put the hull on a known heading with way on, hold the control, advance the sim, read the turn.
async function trial(page, label, hold, release, opts) {
  opts = opts || {};
  await page.evaluate((sp) => window.RRTest.teleport(-120, 40, 0, sp), opts.speed == null ? 22 : opts.speed);
  await sleep(250);
  await hold();
  await sleep(250);                                       // let the key/touch land before stepping
  const a = await page.evaluate(() => ({ h: RR.Race.state().player.heading }));
  await page.evaluate(() => window.RRTest.step(1.2));
  await sleep(400);
  const b = await page.evaluate(() => ({
    h: RR.Race.state().player.heading, steer: RR.Input.steer,
    thr: RR.Input.throttle, br: RR.Input.brake,
    spd: Math.hypot(RR.Race.state().player.vel.x, RR.Race.state().player.vel.z),
  }));
  await release();
  await sleep(200);
  const dh = norm(b.h - a.h);
  const dir = Math.abs(dh) < 0.03 ? '(no turn)' : (dh < 0 ? 'SCREEN-RIGHT' : 'SCREEN-LEFT ');
  console.log(`  ${label.padEnd(32)} dHeading ${dh >= 0 ? '+' : ''}${dh.toFixed(3)} -> ${dir}  [Input.steer ${b.steer.toFixed(2)}, spd ${b.spd.toFixed(1)}]`);
  return dh;
}

(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
  const out = {};

  console.log('\n=== DESKTOP KEYBOARD (1280x720) ===');
  {
    const page = await boot(browser, null);
    const kd = (c) => page.keyboard.down(c), ku = (c) => page.keyboard.up(c);
    console.log(' driving FORWARD (throttle held):');
    out.kD = await trial(page, 'W + D   (right key)', async () => { await kd('KeyW'); await kd('KeyD'); }, async () => { await ku('KeyW'); await ku('KeyD'); });
    out.kA = await trial(page, 'W + A   (left key)', async () => { await kd('KeyW'); await kd('KeyA'); }, async () => { await ku('KeyW'); await ku('KeyA'); });
    out.kR = await trial(page, 'W + Right arrow', async () => { await kd('KeyW'); await kd('ArrowRight'); }, async () => { await ku('KeyW'); await ku('ArrowRight'); });
    console.log(' driving ASTERN (S held, negative way on):');
    out.kSD = await trial(page, 'S + D   (right key, astern)', async () => { await kd('KeyS'); await kd('KeyD'); }, async () => { await ku('KeyS'); await ku('KeyD'); }, { speed: -9 });
    await page.close();
  }

  console.log('\n=== PHONE THUMB (844x390 @3) ===');
  {
    const page = await boot(browser, { w: 844, h: 390, dpr: 3 });
    const cdp = await page.context().newCDPSession(page);
    const g = await page.evaluate(() => {
      const s = document.getElementById('rt-steer').getBoundingClientRect();
      const t = document.getElementById('rt-thr').getBoundingClientRect();
      return { sx: s.left + s.width * 0.45, sy: s.top + s.height * 0.6,
               gx: t.left + t.width / 2, gy: t.top + t.height * 0.5 };
    });
    // GO with one finger, steer with another — both live, the way it is actually played
    const holdGo = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.gx, y: g.gy, id: 2, force: 1 }] });
    const dragTo = async (dx) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.gx, y: g.gy, id: 2, force: 1 }, { x: g.sx, y: g.sy, id: 1, force: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.gx, y: g.gy, id: 2, force: 1 }, { x: g.sx + dx, y: g.sy, id: 1, force: 1 }] });
    };
    const liftAll = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: g.gx, y: g.gy, id: 2, force: 1 }, { x: g.sx, y: g.sy, id: 1, force: 1 }] });
    console.log(' driving FORWARD (GO held):');
    out.tR = await trial(page, 'thumb dragged RIGHT +140px', () => dragTo(140), liftAll);
    out.tL = await trial(page, 'thumb dragged LEFT  -140px', () => dragTo(-140), liftAll);
    await page.close();
  }

  await browser.close();
  console.log('\n--- VERDICT ---');
  const say = (n, v, want) => console.log(`  ${n.padEnd(34)} ${v < 0 ? 'screen-right' : v > 0 ? 'screen-left ' : 'none'}   ${Math.sign(v) === want ? 'as a car would' : '*** INVERTED ***'}`);
  say('desktop D / right key', out.kD, -1);
  say('desktop A / left key', out.kA, +1);
  say('phone thumb right', out.tR, -1);
  say('phone thumb left', out.tL, +1);
  console.log(`  desktop reversing, right key      ${out.kSD < 0 ? 'screen-right' : 'screen-left'}  (a car reversing swings the nose the OTHER way; this is the "boat logic" question)`);
  console.log();
})().catch((e) => { console.error('fatal', e); process.exit(1); });
