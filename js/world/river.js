/* River Racer — river channel network: resampled paths, water queries, land collision */
(function () {
  const R = { paths: {} };
  const U = () => RR.U;

  // Surface current, m/s along the channel tangent (physics.js advects every hull by it).
  // NEGATIVE because the Chicago River was reversed on 2 January 1900 — it now drains AWAY from
  // Lake Michigan, so racing west→east toward the lock is running upstream the whole way.
  R.flow = -0.28;

  // obstacles boats collide with (bridge piers, buoys, pier walls): {x, z, r}
  R.obstacles = [];
  // axis-aligned or rotated wall segments: {ax, az, bx, bz, pad}
  R.walls = [];

  // THE THRESHOLD: the downstream (east) sill of the Chicago Harbor Lock, in world x. lake.js
  // builds the chamber from -60 to len-60 along the channel, so the lake-side sill is len-60 m
  // past the lock point. Everything about the sea state hangs off this line — west of it you are
  // in a canyon, east of it you are on Lake Michigan. Overwritten with the surveyed value in init.
  R.sillX = 2015;
  R.sillZ = -62;

  // The lock corridor: navigable half-width and wall half-thickness at station s, metres along
  // the chamber axis from the lock point. Built in init() from the SAME numbers lake.js builds
  // the concrete from, so the water and the walls can never disagree. See R.lockClear.
  R.lock = null;

  R.init = function () {
    const C = window.CHICAGO;
    for (const key in C.paths) {
      R.paths[key] = U().resamplePath(C.paths[key], 8);
      R.paths[key].name = key;
    }
    // lake open-water boundary: east of this x the world is lake (no bank collision)
    R.lakeWestX = C.lake.openWaterX;
    R.lakeShoreZTop = C.lake.shoreZNorth;   // north shoreline of the lake play area
    R.lakeShoreZBot = C.lake.shoreZSouth;
    R.lakeEastX = C.lake.eastX;

    const lk = C.lake.lock;
    const lq = U().pathNearest(R.paths.main, lk.x, lk.z);
    R.sillX = lk.x + lq.tx * (lk.len - 60);
    R.sillZ = lk.z + lq.tz * (lk.len - 60);

    // ---- Chicago Harbor Lock: the one pinch on the course that no other query can see ----
    // lake.js lays the chamber walls 8 m thick on ±(w/2 + 4) and flares a 3.2 m guide wall out to
    // ±(w/2 + 11) sixty metres past each sill. Mirror that here as [station, half-width, wall
    // half-thickness]: half-width is the concrete face, and the half-thickness is how far past it
    // this corridor is allowed to reach. Beyond that a hull is behind the wall rather than through
    // it, and pulling it back into the chamber would be the very teleport this exists to stop —
    // out there the wall capsules lake.js registers eject it the other way.
    const CH0 = -60, CH1 = -60 + lk.len;             // the two gate sills, in chamber stations
    const HW = lk.w / 2;                             // 12.2 m: the real 80 ft clear width
    const ROOT = HW + 4 - 1.6, TIP = HW + 11 - 1.6;  // guide-wall inner face at root and tip
    R.lock = {
      x: lk.x, z: lk.z, tx: lq.tx, tz: lq.tz, px: -lq.tz, pz: lq.tx,
      prof: [
        [CH0 - 110, 40, 0],       // open water — never tighter than the channel already is
        [CH0 - 80, TIP, 1.6],     // west guide-wall tip, flaring in to its root…
        [CH0 - 26, ROOT, 1.6],
        [CH0 - 20, HW, 4],        // …and the last 6 m steps onto the chamber face, which really
        [CH1 + 20, HW, 4],        // does stand 2.4 m proud of the guide wall behind it.
        [CH1 + 26, ROOT, 1.6],
        [CH1 + 80, TIP, 1.6],
        [CH1 + 110, 40, 0],
      ],
    };

    // The baked lakeGuide leaves the lock through the north chamber wall. Its first two control
    // points run 5.9° north of the chamber axis, so by the east sill the centreline — the line the
    // AI steers and the line the route is measured along — is 11.7 m off the axis in a chamber
    // that is 12.2 m to the wall, and 17 m off it (three metres inside concrete) by the far end.
    // chicago.js is generated and frozen, so re-anchor the approach here: down the axis to the
    // east sill, out to the guide-wall tips, then back onto the surveyed lake track.
    const L = R.lock, at = (s, o) => [L.x + L.tx * s + L.px * (o || 0), L.z + L.tz * s + L.pz * (o || 0)];
    const sill = at(CH1), tip = at(CH1 + 80);
    R.paths.lakeGuide = U().resamplePath([
      [lk.x, lk.z, HW], [sill[0], sill[1], HW], [tip[0], tip[1], TIP],
      ...C.paths.lakeGuide.slice(2),
    ], 8);
    R.paths.lakeGuide.name = 'lakeGuide';
  };

  // Signed clearance to the lock corridor at (x,z), or null when the point is nowhere near it.
  // Writes the push normal into `out` (which the caller owns).
  R.lockClear = function (x, z, out) {
    const L = R.lock;
    if (!L) return null;
    const dx = x - L.x, dz = z - L.z;
    const s = dx * L.tx + dz * L.tz;
    const p = L.prof;
    if (s <= p[0][0] || s >= p[p.length - 1][0]) return null;
    let i = 1;
    while (i < p.length - 1 && s > p[i][0]) i++;
    const f = (s - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
    const guard = U().lerp(p[i - 1][2], p[i][2], f);
    if (guard <= 0) return null;
    const o = dx * L.px + dz * L.pz;
    const clear = U().lerp(p[i - 1][1], p[i][1], f) - Math.abs(o);
    if (clear < -guard) return null;                 // behind the wall, not through it
    if (out) {
      const sgn = o >= 0 ? -1 : 1;                   // normal points back down the chamber
      out.nx = L.px * sgn; out.nz = L.pz * sgn;
    }
    return clear;
  };

  // Is (x,z) in the open lake basin?
  R.inLake = function (x, z) {
    return x > R.lakeWestX && x < R.lakeEastX && z > R.lakeShoreZTop && z < R.lakeShoreZBot;
  };

  // Signed clearance to navigable water: positive = inside water, negative = on land.
  // Also returns push normal toward water. Checks all channels + lake basin.
  const tmp = {}, lockN = { nx: 0, nz: 0 };
  R.waterQuery = function (x, z, hintObj) {
    let best = null;
    for (const key in R.paths) {
      const p = R.paths[key];
      const hint = hintObj ? hintObj[key] : null;
      const q = U().pathNearest(p, x, z, hint, hint != null ? 30 : 0);
      if (hintObj) hintObj[key] = q.idx;
      const clear = q.w - q.dist;                    // >0 inside channel
      if (!best || clear > best.clear) {
        best = tmp; tmp.clear = clear; tmp.path = key; tmp.q = q;
        // normal pointing from bank toward channel centerline
        const nx = (q.x - x), nz = (q.z - z);
        const nl = Math.max(1e-6, Math.hypot(nx, nz));
        tmp.nx = nx / nl; tmp.nz = nz / nl;
      }
    }
    if (R.inLake(x, z)) {
      const dW = x - R.lakeWestX, dE = R.lakeEastX - x, dN = z - R.lakeShoreZTop, dS = R.lakeShoreZBot - z;
      const m = Math.min(dW, dE, dN, dS);
      if (!best || m > best.clear) {
        best = tmp; tmp.clear = m; tmp.path = 'lake'; tmp.q = null;
        tmp.nx = (m === dW) ? 1 : (m === dE) ? -1 : 0;
        tmp.nz = (m === dN) ? 1 : (m === dS) ? -1 : 0;
      }
    }
    // Every query above answers "how much room is there" by taking the WIDEST channel under the
    // hull, which is the right answer everywhere except inside a lock: the chamber is 24.4 m of
    // concrete box standing in a basin the lake query calls ninety metres wide, and the lakeGuide
    // tube laid over it is wider still. Here the TIGHTEST constraint has to win, or the walls are
    // scenery — which is exactly what they were.
    const lc = R.lockClear(x, z, lockN);
    if (lc !== null && (!best || lc < best.clear)) {
      best = tmp; tmp.clear = lc; tmp.path = 'lock'; tmp.q = null;   // a chamber has no current
      tmp.nx = lockN.nx; tmp.nz = lockN.nz;
    }
    return best;
  };

  R.addObstacle = function (x, z, r) { R.obstacles.push({ x, z, r }); };
  R.addWall = function (ax, az, bx, bz, pad) { R.walls.push({ ax, az, bx, bz, pad: pad || 1.5 }); };

  // resolve collision against point obstacles / walls; returns {nx,nz,pen} or null
  R.hitObstacle = function (x, z, radius) {
    for (let i = 0; i < R.obstacles.length; i++) {
      const o = R.obstacles[i];
      const dx = x - o.x, dz = z - o.z;
      const rr = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.max(1e-5, Math.sqrt(d2));
        return { nx: dx / d, nz: dz / d, pen: rr - d };
      }
    }
    for (let i = 0; i < R.walls.length; i++) {
      const w = R.walls[i];
      const abx = w.bx - w.ax, abz = w.bz - w.az;
      const ab2 = abx * abx + abz * abz;
      let t = ((x - w.ax) * abx + (z - w.az) * abz) / Math.max(1e-9, ab2);
      t = U().clamp(t, 0, 1);
      const qx = w.ax + abx * t, qz = w.az + abz * t;
      const dx = x - qx, dz = z - qz;
      const d2 = dx * dx + dz * dz;
      const rr = w.pad + radius;
      if (d2 < rr * rr) {
        const d = Math.max(1e-5, Math.sqrt(d2));
        return { nx: dx / d, nz: dz / d, pen: rr - d };
      }
    }
    return null;
  };

  // Sea state as a pure function of x, in TWO ramps, because clearing a lock is two events and
  // not one. The KNEE is the east sill: 95 m — about three seconds at racing speed — takes you
  // from a dead-flat chamber to a metre of harbour chop, and that step is what makes the sill
  // felt rather than merely crossed. The FETCH is the long build behind the breakwater out to
  // open Lake Michigan. Peak stays 3.3 because RR.U.swellFactor normalises against (amp-1)/2.3.
  R.lakeAmpAt = function (x) {
    const s = R.sillX;
    return 1 + 0.9 * U().smoothstep(s - 25, s + 95, x) + 1.4 * U().smoothstep(s + 55, s + 615, x);
  };

  // Wave amplitude by locale: calm in the river canyon, rolling out on the lake. The lock chamber
  // itself now reads as flat as it really is — a lock is a box of still water, which is the point.
  R.waveAmp = function (x, z) {
    if (!R.inLake(x, z)) return 1;
    return R.lakeAmpAt(x);
  };

  RR.River = R;
})();
