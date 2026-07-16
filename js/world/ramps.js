/* River Racer — jump ramps: floating orange wedges moored on the straight approach to a few
   bridges. Hit one at speed (boost helps) and you launch clear over the span. */
(function () {
  const RAMPS = { list: [] };
  const U = () => RR.U;

  // bridge name → how far upstream of the span the ramp lip sits (course travel = increasing d)
  const PICKS = { 'LaSalle St': 40, 'State St': 44, 'Adams St': 42, 'Randolph St': 44, 'Grand Ave': 40, 'Columbus Dr': 48 };
  const LEN = 16, W = 7, H = 4.6;

  RAMPS.init = function () {
    const rng = U().mulberry(777);
    const geoms = [];
    for (const b of window.CHICAGO.bridges) {
      const dist = PICKS[b.name];
      if (!dist) continue;
      const p = RR.River.paths[b.branch];
      if (!p) continue;
      const q = U().pathNearest(p, b.x, b.z);
      const d0 = q.d - dist - LEN;                    // leading (low) edge of the wedge
      if (d0 < 40) continue;
      const a = U().pathAt(p, d0, {});
      RAMPS.list.push({ x: a.x, z: a.z, dirx: a.tx, dirz: a.tz, len: LEN, w: W, h: H, slope: H / LEN });
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
    function part(g, c) {
      g.rotateY(ang);
      g.translate(x, 0, z);
      RR.City.tintGeom(g, c, 0, rng);
      geoms.push(g);
    }
    function onSlope(w2, th, sLen, sCenter, yLift, c) {
      // a slab lying on the slope: sCenter = distance up the slope from the low lip
      const g = new THREE.BoxGeometry(w2, th, sLen);
      g.rotateX(-pitch);
      const f = sCenter / slopeLen;
      g.translate(0, 0.2 + f * H + yLift, f * LEN);
      part(g, c);
    }
    onSlope(W, 0.5, slopeLen, slopeLen / 2, 0, 0xf07820);                 // deck
    for (const s of [-1, 1]) {                                            // white edge rails
      const g = new THREE.BoxGeometry(0.35, 0.55, slopeLen);
      g.rotateX(-pitch);
      g.translate(s * (W / 2 - 0.2), 0.2 + H / 2 + 0.34, LEN / 2);
      part(g, 0xf2f2ee);
    }
    for (let i = 1; i <= 3; i++) onSlope(W - 1.6, 0.06, 1.0, slopeLen * i / 4, 0.29, 0xf2f2ee);  // cross stripes
    const post = new THREE.BoxGeometry(W - 0.6, H, 1.4);                  // support under the lip
    post.translate(0, H / 2 - 0.4, LEN - 0.7);
    part(post, 0xc45a14);
    const pont = new THREE.BoxGeometry(W + 0.8, 0.7, 2.6);                // pontoon at the low edge
    pont.translate(0, 0.15, 0.8);
    part(pont, 0x54585e);
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
