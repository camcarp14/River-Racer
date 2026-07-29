/* River Racer — jump ramps: floating orange wedges moored in the open reaches of the river.
   Hit one at speed (boost helps) and you launch clear, with nothing over you but sky.
   Built like real river plant: a pontoon hull with a rubber fender, a painted steel deck with
   chevrons, kerbs, and a guard rail set outboard of the running surface so it never narrows it. */
(function () {
  const RAMPS = { list: [] };
  const U = () => RR.U;

  // Every ramp used to be moored 16 m off a bascule approach, and that was never about the jump —
  // it was the Salute. You asked for the span, the tender lifted it, you threaded the raised slot,
  // and if you mistimed it you wrecked on the shut deck. The Salute is retired and the bridge-strike
  // collision went with it, so the question is gone and only the geometry is left: measured over six
  // ramps and three speeds with every leaf pinned down, the hull peaked at 7.9-10.6 m against a
  // soffit of 5.8-6.4 and a deck top of 11.1-11.7. That is 23-31 frames — half a second — spent
  // inside solid steel, on every single launch. So the ramps move to water with sky over it.
  //
  // How much water is set by the fastest thing that can hit one, measured rather than assumed: every
  // hull, full throttle and boost off a full tank, planted 80 m out on the ramp's own axis.
  // ANAKIN'S PODRACER leaves the lip at 71.1 m/s — top speed 61 is only the cruise, boost is 1.18
  // with a 1.15 full-tank bonus on top — peaks at 24.3 m and comes down 234 m downstream. Nothing
  // else is close: 136 m for the F1H2O, 115 for the Formula, 92 for the jetski, 17 for the BELLE.
  // CLEAR_M is that worst case with 16 m over it, and no site below lets a deck footprint inside
  // 15 m of the corridor.
  //
  // Leaves DOWN is the worst case and the only one worth checking, because a bascule leaf pivots
  // about a trunnion running parallel to the channel: it swings up and back over its own bank and
  // never reaches outside the shut deck's along-channel footprint. Stay out of that footprint and
  // every position in the cycle is clear — including the half-raised one, where a leaf tip stands
  // over the middle of the channel at 17 m and would otherwise swat anything flying the parapet.
  RAMPS.CLEAR_M = 250;                               // flight corridor that must be free of deck
  RAMPS.LEN = 16; RAMPS.H = 3.4;

  // Foot of the wedge, as a distance along a named channel. Each site sits in a bridge-free reach
  // long enough for CLEAR_M, in water the whole corridor stays inside, on a stretch where the
  // channel runs straight for the 110 m before it (centreline drift off the ramp axis under 3 m) so
  // the ramp is on the line a racer is already taking rather than something to swerve at.
  // A site therefore needs 15 + 16 + CLEAR_M + 15 = 296 m of straight water between deck edges, and
  // that is what decides which reaches can hold a ramp at all. The Loop canyon holds none: from
  // Franklin to DuSable the bascules are 124-168 m apart. The North Branch holds none either — its
  // longest bridge-free reach (Chicago Ave to Ohio St) is 487 m but swings through 25 degrees in the
  // middle, and the longest straight one (Grand Ave to Kinzie St) leaves 269 m. So the ramps live
  // where the river opens out, which is also where the boats are quickest.
  const SITES = [
    { path: 'main',  d: 1215, reach: 'DuSable Bridge to Columbus Dr — the Riverwalk reach' },
    { path: 'main',  d: 1760, reach: 'Columbus Dr to Lake Shore Dr — off the Centennial Fountain' },
    { path: 'main',  d: 2160, reach: 'Lake Shore Dr to the lock — the outer harbour, widest water on the river' },
    { path: 'south', d:  855, reach: '18th St to Roosevelt Rd — the long South Branch straight' },
    { path: 'south', d: 1240, reach: '18th St to Roosevelt Rd — the Roosevelt approach' },
    { path: 'south', d: 1985, reach: 'Roosevelt Rd to Harrison St' },
  ];

  const LEN = RAMPS.LEN, W = 7, H = RAMPS.H;
  const ORANGE = 0xf07820, ORANGE_DK = 0xc45a14, ORANGE_MD = 0xd8681a;
  const WHITE = 0xf2f2ee, HULL = 0x54585e, RUBBER = 0x2b2e33;

  RAMPS.init = function () {
    const rng = U().mulberry(777);
    const geoms = [];
    for (const s of SITES) {
      const p = RR.River.paths[s.path];
      if (!p || s.d < 40 || s.d > p.len - 40) continue;
      const a = U().pathAt(p, s.d, {});
      RAMPS.list.push({
        x: a.x, z: a.z, dirx: a.tx, dirz: a.tz, len: LEN, w: W, h: H, slope: H / LEN,
        reach: s.reach, deckClear: deckClearance(a.x, a.z, a.tx, a.tz),
      });
      buildMesh(geoms, a.x, a.z, a.tx, a.tz, rng);
    }
    if (geoms.length) {
      const mesh = new THREE.Mesh(RR.City.mergeGeoms(geoms), RR.City.flatMaterial());
      mesh.castShadow = true;
      RR.Engine.scene.add(mesh);
    }
  };

  // Smallest horizontal gap between the launch corridor — the wedge, then CLEAR_M of flight past
  // the lip — and any bridge deck footprint. This is the invariant the whole siting exists to hold,
  // so it is measured off the live span table rather than trusted to the comment above: re-bake
  // chicago.js and move a bridge and the number moves with it.
  function deckClearance(x, z, dx, dz) {
    const spans = (RR.Bridges && RR.Bridges.list) ? RR.Bridges.list() : [];
    let best = Infinity;
    for (let s = 0; s <= LEN + RAMPS.CLEAR_M; s += 2) {
      const px = x + dx * s, pz = z + dz * s;
      for (let i = 0; i < spans.length; i++) {
        const b = spans[i];
        const ex = px - b.x, ez = pz - b.z;
        const along = Math.abs(ex * b.tx + ez * b.tz) - b.halfAlong;
        const across = Math.abs(ex * -b.tz + ez * b.tx) - b.halfSpan;
        const g = (along > 0 && across > 0) ? Math.hypot(along, across) : Math.max(along, across);
        if (g < best) best = g;
      }
    }
    return Math.round(best * 10) / 10;
  }

  function buildMesh(geoms, x, z, dx, dz, rng) {
    const ang = Math.atan2(dx, dz);
    const pitch = Math.atan2(H, LEN);
    const slopeLen = Math.hypot(LEN, H);
    // W2 ships tintGeomAO concurrently; tintGeom ignores the trailing args, so this degrades
    // to a flat tint instead of throwing. The ramp floats, so the "ground" is the waterline.
    function part(g, c, ao) {
      g.rotateY(ang);
      g.translate(x, 0, z);
      if (ao) (RR.City.tintGeomAO || RR.City.tintGeom)(g, c, 0, rng, 0.15, 2.4, 0.70);
      else RR.City.tintGeom(g, c, 0, rng);
      geoms.push(g);
    }
    function onSlope(w2, th, sLen, sCenter, yLift, c, ao) {
      // a slab lying on the slope: sCenter = distance up the slope from the low lip
      const g = new THREE.BoxGeometry(w2, th, sLen);
      g.rotateX(-pitch);
      const f = sCenter / slopeLen;
      g.translate(0, 0.2 + f * H + yLift, f * LEN);
      part(g, c, ao);
    }
    // upright box at a fraction along the slope
    function atSlope(w2, h2, d2, sCenter, across, yLift, c, ao) {
      const g = new THREE.BoxGeometry(w2, h2, d2);
      const f = sCenter / slopeLen;
      g.translate(across, 0.2 + f * H + yLift, f * LEN);
      part(g, c, ao);
    }

    onSlope(W, 0.5, slopeLen, slopeLen / 2, 0, ORANGE);                   // deck
    for (const s of [-1, 1]) {                                            // white kerbs
      const g = new THREE.BoxGeometry(0.35, 0.55, slopeLen);
      g.rotateX(-pitch);
      g.translate(s * (W / 2 - 0.2), 0.2 + H / 2 + 0.34, LEN / 2);
      part(g, WHITE);
      // painted steel side skirt, so the flank is not one flat orange plane
      const sk = new THREE.BoxGeometry(0.22, 0.9, slopeLen);
      sk.rotateX(-pitch);
      sk.translate(s * (W / 2 + 0.02), 0.2 + H / 2 - 0.5, LEN / 2);
      part(sk, ORANGE_MD, true);
    }
    for (let i = 1; i <= 3; i++) onSlope(W - 1.6, 0.06, 1.0, slopeLen * i / 4, 0.29, WHITE);  // cross stripes
    onSlope(W - 1.2, 0.07, 1.6, slopeLen - 0.9, 0.30, WHITE);             // chevron bar at the lip

    // ART rule 7: a long horizontal edge over water gets a railing — set outboard of the
    // running surface (RAMPS.query only accepts |across| < W/2) so it can never narrow the run
    const rail = new THREE.BoxGeometry(0.10, 0.10, slopeLen);
    for (const s of [-1, 1]) {
      const g = rail.clone();
      g.rotateX(-pitch);
      g.translate(s * (W / 2 + 0.32), 0.2 + H / 2 + 1.34, LEN / 2);
      part(g, 0xb9bcbe);
      for (let sC = 0.6; sC < slopeLen; sC += 2.4) atSlope(0.09, 1.05, 0.09, sC, s * (W / 2 + 0.32), 0.78, 0x7d8286);
    }

    const post = new THREE.BoxGeometry(W - 0.6, H, 1.4);                  // support under the lip
    post.translate(0, H / 2 - 0.4, LEN - 0.7);
    part(post, ORANGE_DK, true);
    const cap = new THREE.BoxGeometry(W - 0.2, 0.28, 1.8);                // no bare box tops
    cap.translate(0, H - 0.5, LEN - 0.7);
    part(cap, ORANGE_MD);

    const pont = new THREE.BoxGeometry(W + 0.8, 0.7, 2.6);                // pontoon at the low edge
    pont.translate(0, 0.15, 0.8);
    part(pont, HULL, true);
    const fend = new THREE.BoxGeometry(W + 1.0, 0.32, 0.34);              // rubber fender on the nose
    fend.translate(0, 0.34, -0.36);
    part(fend, RUBBER);
    for (const s of [-1, 1]) {                                            // mooring cleats
      const cl = new THREE.BoxGeometry(0.5, 0.22, 0.22);
      cl.translate(s * (W / 2 + 0.2), 0.58, 1.6);
      part(cl, 0x9aa0a4);
    }
  }

  // surface height if (x,z) is on a ramp, else null
  RAMPS.query = function (x, z) {
    for (let i = 0; i < RAMPS.list.length; i++) {
      const r = RAMPS.list[i];
      const dx = x - r.x, dz = z - r.z;
      const along = dx * r.dirx + dz * r.dirz;
      if (along < -0.4 || along > r.len) continue;
      const across = dx * -r.dirz + dz * r.dirx;
      if (Math.abs(across) > r.w / 2) continue;
      const prog = Math.max(0, along) / r.len;
      return { y: 0.25 + prog * r.h, slope: r.slope, dirx: r.dirx, dirz: r.dirz, prog };
    }
    return null;
  };

  RR.Ramps = RAMPS;
})();
