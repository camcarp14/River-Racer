/* River Racer — minimap: the real river outline, rotated north-up, player-centered course strip */
(function () {
  const M = {};
  let cv, ctx, W, Hh;
  let riverShape = null;       // cached Path2D of all channels in world coords

  M.init = function () {
    cv = document.getElementById('minimap');
    ctx = cv.getContext('2d');
    W = cv.width; Hh = cv.height;
    buildShape();
  };

  function buildShape() {
    riverShape = [];
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      // left edge forward, right edge back → closed channel polygon
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

  // world→map: north-up (world -z is up on the map)
  const SCALE_TRACK = 0.055;
  function tf(wx, wz, cx, cz, scale) {
    return [W / 2 + (wx - cx) * scale, Hh * 0.58 + (wz - cz) * scale];
  }

  M.draw = function (race, player, boats) {
    ctx.clearRect(0, 0, W, Hh);
    if (!race) return;
    const cx = player.pos.x, cz = player.pos.z;
    const scale = SCALE_TRACK;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, Hh);
    ctx.clip();

    // lake wash (everything east of the shore)
    const [shoreX] = tf(RR.River.lakeWestX, 0, cx, cz, scale);
    if (shoreX < W) {
      ctx.fillStyle = 'rgba(46,110,140,0.55)';
      ctx.fillRect(shoreX, 0, W - shoreX, Hh);
    }

    // channels
    ctx.fillStyle = 'rgba(84,160,150,0.85)';
    for (const poly of riverShape) {
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        const [x, y] = tf(poly[i][0], poly[i][1], cx, cz, scale);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // route ahead: bright line with a dark casing so it reads over open lake water too
    const route = race.route;
    ctx.beginPath();
    let started = false;
    const inLapD = route.loop ? player.routeD % route.len : player.routeD;
    const ahead = route.loop ? 2200 : Math.min(2200, route.len - inLapD);
    for (let d = inLapD; d < inLapD + ahead; d += 40) {
      const a = RR.U.pathAt(route, route.loop ? d % route.len : d, M._p || (M._p = {}));
      const [x, y] = tf(a.x, a.z, cx, cz, scale);
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(10,20,30,0.75)'; ctx.lineWidth = 6; ctx.stroke();     // casing
    ctx.strokeStyle = 'rgba(255,205,90,0.95)'; ctx.lineWidth = 3; ctx.stroke();   // bright core

    // checkpoints
    for (let i = player.nextCp; i < Math.min(player.nextCp + 3, race.checkpoints.length); i++) {
      const cp = race.checkpoints[i];
      const [x, y] = tf(cp.x, cp.z, cx, cz, scale);
      ctx.fillStyle = i === player.nextCp ? '#ffc857' : 'rgba(255,200,87,0.45)';
      ctx.beginPath(); ctx.arc(x, y, i === player.nextCp ? 4 : 3, 0, 7); ctx.fill();
    }

    // rivals
    for (const b of boats) {
      if (b === player) continue;
      const [x, y] = tf(b.pos.x, b.pos.z, cx, cz, scale);
      ctx.fillStyle = '#e8604c';
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
    }

    // player arrow
    const px = W / 2, py = Hh * 0.58;
    ctx.save();
    ctx.translate(px, py);
    // north-up: world +z is down, boat forward = (sin h, cos h); the up-pointing glyph needs θ = π − heading
    ctx.rotate(Math.PI - player.heading);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.6); ctx.lineTo(-4.4, 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    // compass N
    ctx.fillStyle = 'rgba(207,234,247,0.8)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', W - 16, 16);
    ctx.strokeStyle = 'rgba(207,234,247,0.5)';
    ctx.beginPath(); ctx.moveTo(W - 12, 20); ctx.lineTo(W - 12, 28); ctx.stroke();

    ctx.restore();
  };

  RR.Minimap = M;
})();
