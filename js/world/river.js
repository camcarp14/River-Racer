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
  };

  // Is (x,z) in the open lake basin?
  R.inLake = function (x, z) {
    return x > R.lakeWestX && x < R.lakeEastX && z > R.lakeShoreZTop && z < R.lakeShoreZBot;
  };

  // Signed clearance to navigable water: positive = inside water, negative = on land.
  // Also returns push normal toward water. Checks all channels + lake basin.
  const tmp = {};
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
