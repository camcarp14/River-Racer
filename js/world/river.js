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

  // Wave amplitude by locale: calm in the river canyon, rolling out on the lake. This is also the
  // SWELL ramp — RR.U.swellFactor reads (amp-1)/2.3 off this number to decide how much of the long
  // Lake Michigan swell exists here, so the 420 m past the lock is the boat clearing the harbour
  // breakwater and meeting open-lake fetch. Move these numbers and you move the sea state.
  R.waveAmp = function (x, z) {
    if (!R.inLake(x, z)) return 1;
    const t = U().smoothstep(R.lakeWestX, R.lakeWestX + 420, x);
    return 1 + t * 2.3;
  };

  RR.River = R;
})();
