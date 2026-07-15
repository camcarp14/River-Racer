/* River Racer — Chicago's movable bridges. Each entry snaps to its channel and
   spans it perpendicular to the local tangent. Oxide-red steel, tender houses, piers. */
(function () {
  const B = {};
  const U = () => RR.U;
  let rng;

  const RED = 0x7a3428;          // Chicago bascule oxide
  const RED_DK = 0x5e2820;
  const CONC = 0x9a968c;
  const BRICK = 0x8a5138;

  function addPierObstacles(cx, cz, tx, tz, half) {
    // bank piers sit just outside the channel — boats hit the abutments, not phantom walls
    RR.River.addObstacle(cx - tz * (half + 2.2), cz + tx * (half + 2.2), 3.4);
    RR.River.addObstacle(cx + tz * (half + 2.2), cz - tx * (half + 2.2), 3.4);
  }

  function build(bridge, geoms) {
    const path = RR.River.paths[bridge.branch];
    if (!path) return;
    const q = U().pathNearest(path, bridge.x, bridge.z);
    const cx = q.x, cz = q.z, tx = q.tx, tz = q.tz;
    const half = q.w;
    // rotateY(ang) maps the box x-axis (its length) onto (-tz, 0, tx) — straight across the channel
    const ang = Math.atan2(-tx, -tz);
    const span = half * 2 + 14;
    const cl = bridge.clearance;
    const GY = RR.City.GROUND_Y;

    function cross(w, h, len, ox, oy, c) {
      // box laid across the channel; ox = offset along channel direction, oy = height of box center
      const g = new THREE.BoxGeometry(len, h, w);
      g.rotateY(ang);
      g.translate(cx + tx * ox, oy, cz + tz * ox);
      RR.City.tintGeom(g, c, 0.06, rng);
      geoms.push(g);
    }
    function post(r, h, alongOff, acrossOff, c, seg) {
      const g = new THREE.CylinderGeometry(r, r * 1.15, h, seg || 6);
      g.translate(cx + tx * alongOff - tz * acrossOff, h / 2, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(g, c, 0, rng);
      geoms.push(g);
    }
    function house(alongOff, acrossOff) {
      const hx = cx + tx * alongOff - tz * acrossOff;
      const hz = cz + tz * alongOff + tx * acrossOff;
      const g = new THREE.BoxGeometry(5, 6, 5);
      g.rotateY(ang);
      g.translate(hx, cl + 3, hz);
      RR.City.tintGeom(g, BRICK, 0.1, rng);
      geoms.push(g);
      const roof = new THREE.ConeGeometry(4.2, 2.6, 4);
      roof.rotateY(ang + Math.PI / 4);
      roof.translate(hx, cl + 7.3, hz);
      RR.City.tintGeom(roof, 0x4b5320, 0, rng);
      geoms.push(roof);
    }

    if (bridge.kind === 'railraised') {
      // the Kinzie St rail bridge: single leaf permanently pointing at the sky
      const leafLen = half * 2 + 6;
      const leaf = new THREE.BoxGeometry(6, 2.2, leafLen);
      leaf.translate(0, 0, leafLen / 2);            // hinge at origin
      leaf.rotateX(-1.25);                          // ~72° up
      leaf.rotateY(Math.atan2(tz, -tx));            // horizontal component aims back over the channel
      const hx = cx - tz * (half + 2), hz = cz + tx * (half + 2);
      leaf.translate(hx, 3, hz);
      RR.City.tintGeom(leaf, 0x555a5e, 0.08, rng);
      geoms.push(leaf);
      // counterweight tower behind the hinge
      post(2.6, 22, 0, half + 5, 0x555a5e, 4);
      addPierObstacles(cx, cz, tx, tz, half);
      return;
    }

    // deck
    cross(bridge.kind === 'deck' ? 22 : 13, 1.6, span, 0, cl + 0.8, bridge.kind === 'deck' ? CONC : RED);
    // side girders
    for (const s of [-1, 1]) {
      cross(1.1, 2.6, span, s * (bridge.kind === 'deck' ? 10 : 6), cl + 1.6, RED_DK);
    }
    // railings
    for (const s of [-1, 1]) {
      cross(0.4, 1.1, span, s * (bridge.kind === 'deck' ? 11 : 6.6), cl + 3.0, RED);
    }
    // bascule center joint hump
    if (bridge.kind !== 'deck') cross(13.5, 1.2, 6, 0, cl + 2.2, RED_DK);

    // abutment piers on both banks
    for (const s of [-1, 1]) {
      const px = cx - tz * (half + 2.2) * s, pz = cz + tx * (half + 2.2) * s;
      const g = new THREE.BoxGeometry(9, cl + 2.5, 8);
      g.rotateY(ang);
      g.translate(px, (cl + 2.5) / 2 - 0.5, pz);
      RR.City.tintGeom(g, CONC, 0.08, rng);
      geoms.push(g);
    }

    if (bridge.kind === 'l') {
      // double-deck: L tracks overhead with truss sides
      cross(11, 1.4, span, 0, cl + 7.6, 0x4a4e52);
      for (const s of [-1, 1]) {
        cross(0.9, 6.0, span, s * 5.4, cl + 4.6, RED_DK);
        for (let k = -half; k <= half; k += 9) {
          post(0.35, cl + 7.6, s * 5.4, k, RED_DK);
        }
      }
    }

    if (bridge.kind === 'bascule' || bridge.kind === 'bascule2') {
      const houses = bridge.kind === 'bascule2' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[-1, -1], [1, 1]];
      for (const [a, b2] of houses) house(a * 8.5, b2 * (half + 3.5));
    }
    if (bridge.kind === 'deck') {
      // Lake Shore Drive: steel through-truss profile above the deck
      for (const s of [-1, 1]) {
        cross(1.2, 7, span, s * 9.5, cl + 5.4, 0x6a7076);
      }
      cross(20, 1.2, 8, 0, cl + 9.2, 0x6a7076);
    }

    addPierObstacles(cx, cz, tx, tz, half);
  }

  B.init = function () {
    rng = U().mulberry(4242);
    const geoms = [];
    for (const b of window.CHICAGO.bridges) build(b, geoms);
    const mesh = new THREE.Mesh(RR.City.mergeGeoms(geoms), RR.City.flatMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    RR.Engine.scene.add(mesh);
  };

  RR.Bridges = B;
})();
