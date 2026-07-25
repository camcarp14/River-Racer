/* River Racer — minimap.
   Heading-up, land-filled, bridge-ticked. The old map was a near-empty navy rectangle because the
   LAND was never filled: channel polygons were painted onto transparency, so there was no
   figure/ground at all. Fill land first and the whole thing becomes legible.
   Redraw is throttled to 30 Hz, which makes this version cheaper than the one it replaces. */
(function () {
  const M = {};
  let cv, ctx, W, Hh;
  let riverShape = null;       // channel polygons in world coords, built once
  let bridges = [];            // {x, z, nx, nz, name} — nx/nz is the across-channel normal

  const SCALE_TRACK = 0.055;
  const SCALE_LAKE = 0.030;    // the lake legs are 4x the size of the canyon and ran off the map
  let scale = SCALE_TRACK;

  const LAND = '#111A21', LAKE = '#0A2C3B', CHAN = '#0E3A4A';

  M.init = function () {
    cv = document.getElementById('minimap');
    if (!cv) return;
    ctx = cv.getContext('2d');
    W = cv.width; Hh = cv.height;
    buildShape();
    if (RR.Bridges && RR.Bridges.tags) M.setBridges(RR.Bridges.tags);
  };

  function buildShape() {
    riverShape = [];
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      const poly = [];
      for (let i = 0; i < p.n; i += 3) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(p.n - 1, i + 1);
        let tx = p.x[i1] - p.x[i0], tz = p.z[i1] - p.z[i0];
        const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
        poly.push([p.x[i] - tz * p.w[i], p.z[i] + tx * p.w[i]]);
      }
      for (let i = p.n - 1; i >= 0; i -= 3) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(p.n - 1, i + 1);
        let tx = p.x[i1] - p.x[i0], tz = p.z[i1] - p.z[i0];
        const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
        poly.push([p.x[i] + tz * p.w[i], p.z[i] - tx * p.w[i]]);
      }
      riverShape.push(poly);
    }
  }

  // Chicago is its bridges — 38 movable spans, more than any city on earth. They are the only
  // landmark a river pilot actually navigates by, so they get their own glyph.
  M.setBridges = function (list) {
    bridges = [];
    if (!list) return;
    for (const b of list) {
      if (b.x == null || b.z == null) continue;
      let nx = 0, nz = 1;
      let best = Infinity;
      for (const key in RR.River.paths) {
        if (key.startsWith('lake')) continue;
        const p = RR.River.paths[key];
        const r = RR.U.pathNearest(p, b.x, b.z);
        if (r.dist < best) { best = r.dist; nx = -r.tz; nz = r.tx; }
      }
      if (best > 140) continue;                    // not on a raced channel
      bridges.push({ x: b.x, z: b.z, nx, nz, name: String(b.name || '').toUpperCase() });
    }
  };

  M.draw = function (race, player, boats) {
    if (!ctx) return;
    if ((M._f = (M._f | 0) + 1) & 1) return;      // 30 Hz: the map does not need 60
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    if (!race || !player) return;

    const cx = player.pos.x, cz = player.pos.z;
    const want = RR.River.inLake(cx, cz) ? SCALE_LAKE : SCALE_TRACK;
    scale = RR.U.damp(scale, want, 1 / 0.8, 1 / 30);   // 0.8 s so the zoom never snaps mid-corner

    // land is the ground, and it must be painted first or nothing else reads
    ctx.fillStyle = LAND;
    ctx.fillRect(0, 0, W, Hh);

    const px = W / 2, py = Hh * 0.62;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, Hh); ctx.clip();
    ctx.translate(px, py);
    ctx.rotate(player.heading - Math.PI);          // heading-up: correct for driving, not strategy
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cz);

    // the lake, as one big slab east of the shore line
    ctx.fillStyle = LAKE;
    ctx.fillRect(RR.River.lakeWestX, cz - 12000, 40000, 24000);

    const inv = 1 / scale;
    ctx.fillStyle = CHAN;
    ctx.strokeStyle = 'rgba(126,200,227,.30)';   // land/water edge — the fills alone are too close in value
    ctx.lineWidth = 1 * inv;
    for (const poly of riverShape) {
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        if (i) ctx.lineTo(poly[i][0], poly[i][1]); else ctx.moveTo(poly[i][0], poly[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const route = race.route;
    const inLapD = route.loop ? player.routeD % route.len : player.routeD;

    // route behind, dim
    strokeRoute(route, inLapD - 700, 700, 2 * inv, 'rgba(255,200,87,.22)');
    // route ahead: dark casing then gold core, so it reads over open lake water too
    const ahead = route.loop ? 2400 : Math.min(2400, route.len - inLapD);
    strokeRoute(route, inLapD, ahead, 4 * inv, '#04121B');
    strokeRoute(route, inLapD, ahead, 2.5 * inv, '#FFC857');

    // bridge ticks
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#E8F2F8';
    ctx.lineWidth = 2 * inv;
    const view = (Hh * 0.62) * inv;
    let nextB = null, nextD = Infinity;
    for (const b of bridges) {
      const dx = b.x - cx, dz = b.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > view * view) continue;
      const h = 4.5 * inv;
      ctx.beginPath();
      ctx.moveTo(b.x - b.nx * h, b.z - b.nz * h);
      ctx.lineTo(b.x + b.nx * h, b.z + b.nz * h);
      ctx.stroke();
      // "ahead" in the boat's frame, not in world space
      const fwd = dx * Math.sin(player.heading) + dz * Math.cos(player.heading);
      if (fwd > 12 && d2 < nextD) { nextD = d2; nextB = b; }
    }

    // checkpoints: the next one pulses
    if (race.checkpoints) {
      const t = (RR.Engine && RR.Engine.time) ? RR.Engine.time() : 0;
      for (let i = player.nextCp; i < Math.min(player.nextCp + 3, race.checkpoints.length); i++) {
        const cp = race.checkpoints[i];
        ctx.strokeStyle = i === player.nextCp ? '#FFC857' : 'rgba(255,200,87,.45)';
        ctx.lineWidth = (i === player.nextCp ? 2 : 1.4) * inv;
        const r = (i === player.nextCp ? 4 + Math.sin(t * 6) : 3) * inv;
        ctx.beginPath(); ctx.arc(cp.x, cp.z, r, 0, 7); ctx.stroke();
      }
    }

    // rivals; the one immediately ahead on route order gets a white ring so map and ticker agree
    let lead = null, leadD = Infinity;
    for (const b of boats) {
      if (b === player) continue;
      const dd = b.routeD - player.routeD;
      if (dd > 0 && dd < leadD) { leadD = dd; lead = b; }
    }
    for (const b of boats) {
      if (b === player) continue;
      ctx.fillStyle = '#EF3340';
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.z, 2 * inv, 0, 7); ctx.fill();
      if (b === lead) {
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1 * inv;
        ctx.beginPath(); ctx.arc(b.pos.x, b.pos.z, 3.4 * inv, 0, 7); ctx.stroke();
      }
    }
    ctx.restore();

    // ---- unrotated overlay: the player star, the bridge label, the compass ----
    // player is the flag star, always upright at the anchor
    ctx.save();
    ctx.translate(px, py);
    if (RR.UIKit && RR.UIKit.star6) RR.UIKit.star6(ctx, 0, 0, 6.5, 0);
    else { ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); }
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    if (nextB && nextB.name) {
      ctx.font = '9px "Arial Narrow", Arial, sans-serif';
      ctx.fillStyle = '#7EC8E3';
      ctx.textAlign = 'center';
      ctx.fillText(nextB.name, W / 2, 16);
      ctx.textAlign = 'left';
    }

    // north needle: orientation is never lost even though the map turns with you
    const nx = -Math.sin(player.heading), nz = Math.cos(player.heading);
    const ox = W - 18, oy = 26;
    ctx.strokeStyle = '#7EC8E3'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox - nx * 5, oy - nz * 5);
    ctx.lineTo(ox + nx * 11, oy + nz * 11);
    ctx.stroke();
    ctx.fillStyle = '#7EC8E3';
    ctx.font = 'bold 10px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', ox + nx * 17, oy + nz * 17 + 3.5);
    ctx.textAlign = 'left';
  };

  const _p = {};
  function strokeRoute(route, from, span, width, colour) {
    if (span <= 0) return;
    ctx.beginPath();
    let started = false;
    for (let d = from; d <= from + span; d += 40) {
      const dd = route.loop ? ((d % route.len) + route.len) % route.len : RR.U.clamp(d, 0, route.len);
      const a = RR.U.pathAt(route, dd, _p);
      if (started) ctx.lineTo(a.x, a.z); else { ctx.moveTo(a.x, a.z); started = true; }
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = colour; ctx.lineWidth = width;
    ctx.stroke();
  }

  RR.Minimap = M;
})();
