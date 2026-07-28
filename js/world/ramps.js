/* River Racer — jump ramps: floating orange wedges moored on the straight approach to a few
   bridges. Hit one at speed (boost helps) and you launch clear over the span.
   Built like real river plant: a pontoon hull with a rubber fender, a painted steel deck with
   chevrons, kerbs, and a guard rail set outboard of the running surface so it never narrows it. */
(function () {
  const RAMPS = { list: [] };
  const U = () => RR.U;

  // Every ramp is moored on a bascule approach, and with a live ceiling overhead that makes each
  // one the same question: is it up? For that question to have an honest answer the arc has to
  // land in the same place whatever the boat is doing, and it does not do that for free.
  //
  // Height at the span is y0 + 1.25*(H/LEN)*D + 1.6*D/v - 4.9*D²/v². The middle term is
  // speed-free — the launch is proportional to speed, so the two v terms very nearly cancel — but
  // the tail term is not, and at the old 40-48 m lip it swamped everything: 2.8 m at 20 m/s (you
  // pass harmlessly under a shut span), 9.2 m at 25 (you hit it), 15.9 m at 40 (you sail clean
  // over the parapet and nothing happens). Three different games on one ramp.
  //
  // At a 16 m lip the tail is worth half a metre across the whole speed range, so the hull crosses
  // the span line at 6.9-7.9 m at every speed a boat can reach: dead level with a shut deck, and
  // well inside a raised slot. H drops 4.6 → 3.4 to keep the flight (110 m at 40 m/s) shorter than
  // the 124 m between Main Stem bascules, so a jump lands on water rather than on the next bridge.
  // Apex is still 11.3 m over the water. Published, because these three numbers are the ramp.
  RAMPS.LIP_M = 16;                                  // lip → span line
  RAMPS.LEN = 16; RAMPS.H = 3.4;
  const PICKS = { 'LaSalle St': 1, 'State St': 1, 'Adams St': 1, 'Randolph St': 1, 'Grand Ave': 1, 'Columbus Dr': 1 };
  const LEN = RAMPS.LEN, W = 7, H = RAMPS.H;
  const ORANGE = 0xf07820, ORANGE_DK = 0xc45a14, ORANGE_MD = 0xd8681a;
  const WHITE = 0xf2f2ee, HULL = 0x54585e, RUBBER = 0x2b2e33;

  RAMPS.init = function () {
    const rng = U().mulberry(777);
    const geoms = [];
    for (const b of window.CHICAGO.bridges) {
      if (!PICKS[b.name]) continue;
      const p = RR.River.paths[b.branch];
      if (!p) continue;
      const q = U().pathNearest(p, b.x, b.z);
      const d0 = q.d - RAMPS.LIP_M - LEN;             // leading (low) edge of the wedge
      if (d0 < 40) continue;
      const a = U().pathAt(p, d0, {});
      RAMPS.list.push({
        x: a.x, z: a.z, dirx: a.tx, dirz: a.tz, len: LEN, w: W, h: H, slope: H / LEN,
        bridge: b.name, bx: q.x, bz: q.z, lipD: RAMPS.LIP_M,
      });
      buildMesh(geoms, a.x, a.z, a.tx, a.tz, rng);
    }
    if (geoms.length) {
      const mesh = new THREE.Mesh(RR.City.mergeGeoms(geoms), RR.City.flatMaterial());
      mesh.castShadow = true;
      RR.Engine.scene.add(mesh);
    }
  };

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
