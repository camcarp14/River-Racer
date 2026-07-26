/* River Racer — procedural vehicle meshes + stat sheets */
(function () {
  const B = {};

  // stats: top (m/s), accel (m/s^2), turn (rad/s @ speed), grip (lateral damping), agility feel
  //
  // Hull-feel block (physics.js reads these):
  //   plane     m/s at which the hull is fully up on plane. 20 kt = 10.29 m/s is the real planing
  //             threshold for a mid-size V-hull; 0 means "always planing" (the hovering podracer).
  //   hump      strength of the drag hump — resistance peaks as the boat climbs its own bow wave.
  //   lift      metres the hull rises out of the water when fully planing.
  //   slap      hull-slap amplitude multiplier.
  //   torque    radians of static roll at full throttle from single-prop torque reaction.
  //   dive      radians of bow dive on a hard throttle chop.
  //   drift     stern step-out gain in hard turns.
  //   boostKick m/s^2 of extra thrust for the first 0.45 s of a boost.
  B.CATALOG = [
    {
      id: 'jetski', name: 'RX BLACKHAWK', kind: 'jetski',
      desc: 'Sport jet ski. Whips around bridge piers like a startled duck. Fragile top end, absurd agility.',
      top: 33, accel: 15.5, turn: 2.5, grip: 3.6, lean: 0.55, boost: 1.22, mass: 0.7,
      plane: 7.5, hump: 0.22, lift: 0.20, slap: 0.55, torque: 0.010, dive: 0.06, drift: 0.85, boostKick: 11.0,
      hull: 0x1b1e26, deck: 0xff3b30, accent: 0xffc857, seat: 0x22262e,
    },
    {
      id: 'speedboat', name: 'FORMULA 350 GT', kind: 'speedboat',
      desc: 'Offshore V-hull muscle. Monster straight-line pace — but it needs the whole channel to turn.',
      top: 41, accel: 11.5, turn: 1.3, grip: 1.9, lean: 0.34, boost: 1.16, mass: 1.45,
      plane: 11.5, hump: 0.55, lift: 0.34, slap: 1.00, torque: 0.038, dive: 0.11, drift: 0.55, boostKick: 8.0,
      hull: 0x10315e, deck: 0xf2f4f6, accent: 0xff3b30, seat: 0x1a1d22,
    },
    {
      id: 'f1', name: 'F1H2O PROTOTYPE', kind: 'f1',
      desc: 'Tunnel-hull race cat. The fastest thing on the river — if you can keep it pointed straight.',
      top: 46, accel: 14.0, turn: 1.6, grip: 2.2, lean: 0.22, boost: 1.14, mass: 0.9,
      plane: 9.0, hump: 0.30, lift: 0.30, slap: 0.80, torque: 0.022, dive: 0.08, drift: 0.70, boostKick: 9.5,
      hull: 0xffc857, deck: 0x14161c, accent: 0x0f8bd0, seat: 0x14161c,
    },
    {
      id: 'runabout', name: 'LAKESIDE QUEEN ’47', kind: 'runabout',
      desc: 'Varnished mahogany classic. Slowest in class — but glued to the water, with the strongest boost aboard.',
      top: 30, accel: 10.0, turn: 2.1, grip: 3.7, lean: 0.30, boost: 1.3, mass: 1.2,
      plane: 10.5, hump: 0.62, lift: 0.26, slap: 0.85, torque: 0.042, dive: 0.13, drift: 0.35, boostKick: 12.0,
      hull: 0x6e3b1c, deck: 0x8a5224, accent: 0xe8e2d0, seat: 0x7a1f16,
    },
    {
      id: 'rescue', name: 'CFD MARINE 7-1', kind: 'speedboat',
      desc: 'Fire department rigid inflatable. Punchy, planted, and it bounces off seawalls with dignity.',
      top: 36, accel: 13.0, turn: 1.85, grip: 3.0, lean: 0.28, boost: 1.2, mass: 1.35,
      plane: 9.5, hump: 0.45, lift: 0.24, slap: 0.90, torque: 0.030, dive: 0.10, drift: 0.45, boostKick: 9.0,
      hull: 0xd42a1e, deck: 0x1f242b, accent: 0xf5f6f7, seat: 0x14161c,
    },
    {
      // The Architecture Tour boat. Not a racer: 30 m and a couple of hundred tonnes of open-deck
      // river cruiser, so `plane` sits above her top end (a displacement hull never climbs onto a
      // plane), accel is a seventh of the FORMULA's, and `turn` buys a ~34 m circle at full chat in
      // a channel 60 m wide. hidden: she is crewed for the tour, not offered in the ride picker.
      id: 'tourboat', name: 'WACKER BELLE', kind: 'tourboat', hidden: true,
      desc: 'Open-deck architecture cruiser. Thirty metres, no brakes, and a turning circle that eats most of the Main Stem. Somehow this is fun.',
      top: 13.5, accel: 2.6, turn: 0.60, grip: 4.4, lean: 0.10, boost: 1.12, mass: 4.6,
      plane: 30, hump: 0.0, lift: 0.0, slap: 0.15, torque: 0.020, dive: 0.03, drift: 0.06, boostKick: 3.5,
      engine: 'runabout',                                   // slow-turning diesel, not a V8
      hull: 0xeef1f4, deck: 0x8a6a44, accent: 0xc0392b, seat: 0x1f5f8b,
    },
    {
      id: 'podracer', name: 'ANAKIN’S PODRACER', kind: 'podracer',
      desc: 'Twin radial turbines on a plasma tether, skimming the river on a cushion of thrust. Untouchable top end — if you can steer the thing.',
      top: 61, accel: 21.0, turn: 1.55, grip: 1.7, lean: 0.42, boost: 1.18, mass: 0.85,
      hover: 1.15,                                    // rides ~1.15m above the wave crests
      plane: 0.0, hump: 0.00, lift: 0.00, slap: 0.00, torque: 0.000, dive: 0.04, drift: 1.00, boostKick: 10.0,
      hull: 0xd8a13a, deck: 0xc9ced2, accent: 0xff3ea6, seat: 0x161a1f,   // golden scoops · silver · magenta plasma
    },
  ];

  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0.18 }, opts || {}));
  }
  function glassMat() {
    return new THREE.MeshStandardMaterial({ color: 0x0d1a24, roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.72 });
  }
  const chrome = () => new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.18, metalness: 0.85 });

  // sculpt a box into a planing hull: pointed bow (+z), V-bottom, rising sheer, tucked stern
  function shapeHull(geo, len, beam, depth, sheer) {
    const p = geo.attributes.position, hl = len / 2;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const fz = Math.max(-1, Math.min(1, z / hl));
      let t = 1;
      if (fz > 0.12) t = 1 - Math.pow((fz - 0.12) / 0.88, 1.7) * 0.95;   // sharp bow
      if (fz < -0.78) t *= 1 - (Math.abs(fz) - 0.78) / 0.22 * 0.22;       // slight stern tuck
      x *= t;
      if (y < 0) { const vb = 1 - Math.min(1, Math.abs(x) / (beam * 0.5 + 1e-3)); y -= vb * depth * 0.4; } // V-bottom
      if (fz > 0.1) y += Math.pow((fz - 0.1) / 0.9, 1.4) * depth * (sheer || 0.7);                          // sheer
      p.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
  }

  // red port / green starboard / white stern nav lights (glow at night via bloom).
  // shapeHull tapers the sheer to a point, so bowZ/halfBeam must be picked where the hull is
  // still wide — set at max beam right up at the stem they float free of the boat entirely.
  function navLights(g, halfBeam, bowZ, sternZ, y) {
    const add = (col, x, z) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.4 }));
      m.position.set(x, y, z); m.userData.nav = 1; g.add(m);
    };
    add(0xff2222, -halfBeam, bowZ);
    add(0x22ff44, halfBeam, bowZ);
    add(0xffffff, 0, sternZ);
  }

  // capsule limb stretched between two points (init-time only — no hot-loop use)
  function limb(g, m, r, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.04, len - r), 2, 6), m);
    seg.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    g.add(seg);
    return seg;
  }

  // reusable low-poly human: origin = seat surface ('sit'/'recline') or stance floor ('stand').
  // opts: pose, lean (rad, + = forward), suit/vest/helmet/cap colors, visor, fire (helmet brim),
  // handL/handR [x,y,z] grip targets (null = hand rests on the lap), legs/arms flags,
  // footDrop (how far below the seat the footwell floor is), scale. ~10-14 prims.
  function driverFigure(o) {
    const g = new THREE.Group();
    const suit = mat(o.suit, { roughness: 0.75, metalness: 0.05 });
    const skin = mat(0xc9946a, { roughness: 0.85, metalness: 0 });
    const pose = o.pose || 'sit';
    let hip, tl; // hip anchor + torso length
    if (pose === 'stand') { hip = [0, 0.62, -0.08]; tl = 0.55; }
    else if (pose === 'recline') { hip = [0, 0.02, -0.1]; tl = 0.42; }
    else { hip = [0, 0.1, 0]; tl = 0.52; }
    const lean = o.lean != null ? o.lean : (pose === 'stand' ? 0.6 : 0.15);
    const ny = hip[1] + Math.cos(lean) * tl, nz = hip[2] + Math.sin(lean) * tl;   // neck
    limb(g, suit, 0.2, hip[0], hip[1], hip[2], 0, ny, nz);                        // torso
    if (o.vest) {
      const v = limb(g, mat(o.vest, { roughness: 0.8, metalness: 0 }), 0.23,
        hip[0], hip[1] + 0.08, hip[2] + 0.02, 0, ny - 0.06, nz);
      v.scale.z = 0.85;
    }
    // head + headgear
    const hy = ny + Math.cos(lean) * 0.24, hz = nz + Math.sin(lean) * 0.24 + 0.04;
    if (o.helmet != null) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8), mat(o.helmet, { roughness: 0.3, metalness: 0.25 }));
      h.position.set(0, hy, hz); g.add(h);
      if (o.visor) {
        const vis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, -0.6, 1.2, 1.0, 1.1), glassMat());
        vis.position.set(0, hy, hz + 0.03); g.add(vis);
      }
      if (o.fire) {                                     // wide fire-helmet brim, dipped at the rear
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 10), mat(o.helmet, { roughness: 0.4 }));
        brim.position.set(0, hy - 0.05, hz - 0.03); brim.rotation.x = -0.12; g.add(brim);
      }
    } else {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
      h.position.set(0, hy, hz); g.add(h);
      if (o.cap != null) {                              // flat cap: squashed crown + short brim
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(o.cap, { roughness: 0.9 }));
        crown.scale.y = 0.55; crown.position.set(0, hy + 0.06, hz - 0.01); g.add(crown);
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.16), mat(o.cap, { roughness: 0.9 }));
        brim.position.set(0, hy + 0.05, hz + 0.15); g.add(brim);
      }
    }
    // legs: thigh + shin per side, bent into the footwell (or crouched when standing)
    if (o.legs !== false) {
      const st = pose === 'stand';
      const hx = st ? 0.2 : 0.12, kx = st ? 0.3 : 0.14;
      const ky = st ? 0.35 : hip[1] + 0.05, kz = st ? 0.14 : 0.4;
      const fy = st ? 0.02 : -(o.footDrop != null ? o.footDrop : 0.18), fz = st ? -0.02 : 0.55;
      for (const s of [-1, 1]) {
        limb(g, suit, 0.085, s * hx, hip[1], hip[2] + 0.02, s * kx, ky, kz);
        limb(g, suit, 0.07, s * kx, ky, kz, s * kx, fy, fz);
      }
    }
    // arms: shoulder -> grip target (or resting near the thigh)
    if (o.arms !== false) {
      const grips = [o.handL, o.handR];
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        const t = grips[i] || [s * 0.26, hip[1] + 0.05, hip[2] + 0.3];
        limb(g, suit, 0.065, s * 0.24, ny - 0.05, nz, t[0], t[1], t[2]);
      }
    }
    if (o.scale) g.scale.setScalar(o.scale);
    return g;
  }

  // small helper: a windshield (angled tinted plane frame)
  function windshield(g, w, h, y, z, tilt, frameCol) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat());
    glass.position.set(0, y, z); glass.rotation.x = tilt; g.add(glass);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, 0.08), mat(frameCol || 0x2a2d33, { metalness: 0.6 }));
    frame.position.set(0, y + h / 2 * Math.cos(tilt), z - h / 2 * Math.sin(tilt)); frame.rotation.x = tilt; g.add(frame);
    return glass;
  }
  function cleat(g, x, z, y) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.4), chrome());
    c.position.set(x, y, z); g.add(c);
  }

  // driverFigure is for the one person you look AT. This is for the forty you look past: three
  // prims a head, colour written into the vertex buffer, so a whole boatload merges into one mesh.
  // o: { stand, lean, rotY, coat, skin }
  function personGeoms(out, x, y, z, o) {
    const lean = o.lean || 0, rotY = o.rotY || 0;
    const push = (geo, hex) => {
      if (rotY) geo.rotateY(rotY);
      geo.translate(x, y, z);
      RR.City.tintGeom(geo, hex);
      out.push(geo);
    };
    if (o.stand) {
      const torso = new THREE.CapsuleGeometry(0.19, 0.52, 2, 6);
      torso.rotateX(lean); torso.translate(0, 1.12, 0);
      push(torso, o.coat);
      for (const s of [-1, 1]) {
        const leg = new THREE.CapsuleGeometry(0.095, 0.62, 2, 5);
        leg.translate(s * 0.15, 0.42, 0);
        push(leg, o.legs == null ? o.coat : o.legs);
      }
      const head = new THREE.SphereGeometry(0.135, 8, 6);
      head.translate(0, 1.62, lean * 0.5);
      push(head, o.skin);
      return;
    }
    const torso = new THREE.CapsuleGeometry(0.17, 0.40, 2, 6);
    torso.rotateX(lean); torso.translate(0, 0.44, 0);
    push(torso, o.coat);
    const head = new THREE.SphereGeometry(0.125, 8, 6);
    head.translate(0, 0.86, lean * 0.45);
    push(head, o.skin);
    const lap = new THREE.BoxGeometry(0.36, 0.17, 0.52);
    lap.translate(0, 0.09, 0.26);
    push(lap, o.coat);
  }

  const builders = {
    jetski(spec) {
      const g = new THREE.Group();
      const hullGeo = new THREE.BoxGeometry(1.15, 0.62, 3.2, 3, 2, 8);
      shapeHull(hullGeo, 3.2, 1.15, 0.62, 0.5);
      const hull = new THREE.Mesh(hullGeo, mat(spec.hull, { roughness: 0.35, metalness: 0.3 }));
      hull.position.y = 0.34; g.add(hull);
      // colored deck cowling
      const deckGeo = new THREE.BoxGeometry(0.8, 0.34, 2.1, 2, 1, 4);
      shapeHull(deckGeo, 2.1, 0.8, 0.34, 0.9);
      const deck = new THREE.Mesh(deckGeo, mat(spec.deck, { roughness: 0.3, metalness: 0.2 }));
      deck.position.set(0, 0.66, 0.2); g.add(deck);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.6), mat(spec.accent, { roughness: 0.3 }));
      stripe.position.set(0, 0.84, 0.2); g.add(stripe);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 1.4, 1, 1, 3), mat(spec.seat, { roughness: 0.85, metalness: 0 }));
      seat.position.set(0, 0.86, -0.5); g.add(seat);
      // handlebars + stem
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6), mat(0x333a42, { metalness: 0.6 }));
      stem.rotation.x = 0.5; stem.position.set(0, 0.92, 0.5); g.add(stem);
      const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 6), chrome());
      bars.rotation.z = Math.PI / 2; bars.position.set(0, 1.08, 0.62); g.add(bars);
      for (const s of [-1, 1]) { const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6), mat(0x111318)); grip.rotation.z = Math.PI / 2; grip.position.set(s * 0.3, 1.08, 0.62); g.add(grip); }
      // jet nozzle at the stern
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.4, 8), mat(0x2a2d33, { metalness: 0.5 }));
      nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.28, -1.55); g.add(nozzle);
      // crouched rider, hands on the grips
      const rider = driverFigure({ pose: 'stand', lean: 0.8, suit: 0x22262e, vest: spec.deck, helmet: spec.accent, visor: true,
        handL: [-0.3, 0.42, 0.92], handR: [0.3, 0.42, 0.92], scale: 0.95 });
      rider.position.set(0, 0.66, -0.3); g.add(rider);
      navLights(g, 0.34, 0.95, -1.5, 0.70);
      g.userData.size = { r: 1.4, len: 3.2 };
      return g;
    },

    speedboat(spec) {
      const g = new THREE.Group();
      const hullGeo = new THREE.BoxGeometry(2.35, 1.05, 7.8, 3, 2, 10);
      shapeHull(hullGeo, 7.8, 2.35, 1.05, 0.7);
      const hull = new THREE.Mesh(hullGeo, mat(spec.hull, { roughness: 0.22, metalness: 0.35 }));
      hull.position.y = 0.5; g.add(hull);
      // Topside racing stripe wrapping the sheer. It has to take the hull's own bow taper:
      // as a plain box it hung a metre of flat wing off either side of the stem.
      const stripeGeo = new THREE.BoxGeometry(2.42, 0.22, 7.0, 2, 1, 12);
      stripeGeo.translate(0, 0, 0.2);
      shapeHull(stripeGeo, 7.8, 2.42, 0, 0);
      const stripe = new THREE.Mesh(stripeGeo, mat(spec.accent, { roughness: 0.3 }));
      stripe.position.set(0, 0.86, 0); g.add(stripe);
      // foredeck + cockpit tub
      const deckGeo = new THREE.BoxGeometry(2.0, 0.22, 6.8, 2, 1, 6); shapeHull(deckGeo, 6.8, 2.0, 0.22, 0.9);
      const deck = new THREE.Mesh(deckGeo, mat(spec.deck, { roughness: 0.35, metalness: 0.15 }));
      deck.position.set(0, 1.06, 0.2); g.add(deck);
      const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.4), mat(spec.seat, { roughness: 0.9, metalness: 0 }));
      cockpit.position.set(0, 1.1, -0.6); g.add(cockpit);
      // seats
      for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.6), mat(0x2a2d33, { roughness: 0.9 })); st.position.set(s * 0.4, 1.35, -1.0); g.add(st); }
      // dash + wraparound windshield
      const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.4), mat(0x1a1d22)); dash.position.set(0, 1.35, 0.5); g.add(dash);
      windshield(g, 1.7, 0.6, 1.65, 0.85, -0.5, 0x20242a);
      // radar arch
      for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), chrome()); a.position.set(s * 0.75, 1.9, -1.6); a.rotation.x = 0.15; g.add(a); }
      const archTop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), chrome()); archTop.rotation.z = Math.PI / 2; archTop.position.set(0, 2.42, -1.75); g.add(archTop);
      // twin outboards
      for (const s of [-0.55, 0.55]) {
        const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.7, 0.6), mat(0x14161a, { metalness: 0.5 })); cowl.position.set(s, 0.8, -3.95); g.add(cowl);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.24), mat(0x1a1d22)); leg.position.set(s, 0.25, -4.0); g.add(leg);
      }
      cleat(g, 0.55, 2.2, 1.12); cleat(g, -0.55, 2.2, 1.12);   // on the foredeck, not out past the taper
      // helm wheel + seated pilot at the starboard seat; rescue hull ships a firefighter
      const fire = spec.id === 'rescue';
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 14), mat(0x14161c, { metalness: 0.5 }));
      wheel.position.set(0.4, 1.62, -0.38); wheel.rotation.x = -0.3; g.add(wheel);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), mat(0x1a1d22, { metalness: 0.5 }));
      col.position.set(0.4, 1.42, -0.28); col.rotation.x = 0.5; g.add(col);
      const drv = driverFigure({
        pose: 'sit', lean: 0.18, footDrop: 0.3,
        suit: fire ? 0x1f242b : 0xe8eaee, vest: fire ? 0xd7e02a : spec.accent,
        helmet: fire ? 0x14161c : spec.accent, visor: !fire, fire,
        handL: [-0.15, 0.12, 0.58], handR: [0.15, 0.12, 0.58],
      });
      drv.position.set(0.4, 1.52, -1.0); g.add(drv);
      navLights(g, 0.70, 2.4, -4.0, 1.1);
      g.userData.size = { r: 2.4, len: 7.8 };
      return g;
    },

    f1(spec) {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {                                       // twin sponsons, tapered
        const spGeo = new THREE.BoxGeometry(0.66, 0.52, 4.8, 2, 1, 8); shapeHull(spGeo, 4.8, 0.66, 0.52, 0.6);
        const sp = new THREE.Mesh(spGeo, mat(spec.hull, { roughness: 0.28, metalness: 0.3 }));
        sp.position.set(s * 1.05, 0.34, 0.3); g.add(sp);
      }
      const tunnel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 4.2), mat(0x0c0e12)); tunnel.position.set(0, 0.62, 0.3); g.add(tunnel);
      const podGeo = new THREE.BoxGeometry(0.82, 0.6, 5.4, 2, 1, 8); shapeHull(podGeo, 5.4, 0.82, 0.6, 1.0);
      const pod = new THREE.Mesh(podGeo, mat(spec.deck, { roughness: 0.3, metalness: 0.2 })); pod.position.set(0, 0.6, 0.1); g.add(pod);
      // sponsor stripe
      const strGeo = new THREE.BoxGeometry(0.5, 0.06, 5.0, 1, 1, 12);
      strGeo.translate(0, 0, 0.1);
      shapeHull(strGeo, 5.4, 0.5, 0, 0);                      // follows the pod's nose, not past it
      const str = new THREE.Mesh(strGeo, mat(spec.hull, { roughness: 0.3 })); str.position.set(0, 0.9, 0); g.add(str);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glassMat()); canopy.scale.set(0.85, 0.75, 1.5); canopy.position.set(0, 1.0, -0.5); g.add(canopy);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 12, Math.PI), chrome()); halo.rotation.x = Math.PI / 2; halo.position.set(0, 1.05, -0.5); g.add(halo);
      // rear wing
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.55), mat(spec.accent, { roughness: 0.3 })); wing.position.set(0, 1.2, -2.3); g.add(wing);
      for (const s of [-1.05, 1.05]) { const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.3), mat(0x14161a)); strut.position.set(s, 0.9, -2.3); g.add(strut); }
      const num = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), mat(0xffffff)); num.rotation.x = Math.PI / 2; num.position.set(0, 0.78, 2.0); g.add(num);
      // reclined pilot: only helmet + shoulders show under the glass, legs run into the hull
      const pilot = driverFigure({ pose: 'recline', lean: 0.35, suit: spec.hull, helmet: spec.accent, visor: true, legs: false, arms: false });
      pilot.position.set(0, 0.48, -0.78); g.add(pilot);
      navLights(g, 1.16, 1.9, -2.0, 0.7);
      g.userData.size = { r: 2.2, len: 5.4 };
      return g;
    },

    runabout(spec) {
      const g = new THREE.Group();
      const woodTex = RR.U.canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#7a4520'; ctx.fillRect(0, 0, w, h);
        const rng = RR.U.mulberry(4141);
        for (let i = 0; i < 22; i++) {
          ctx.strokeStyle = 'rgba(60,30,10,' + (0.25 + rng() * 0.3) + ')'; ctx.lineWidth = 1 + rng() * 2;
          ctx.beginPath(); ctx.moveTo(0, i * 6 + rng() * 3);
          ctx.bezierCurveTo(w * 0.3, i * 6 + rng() * 5, w * 0.7, i * 6 - rng() * 5, w, i * 6 + rng() * 3); ctx.stroke();
        }
      });
      const wood = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xa86a30, roughness: 0.22, metalness: 0.12 });
      const hullGeo = new THREE.BoxGeometry(2.15, 1.0, 6.6, 3, 2, 9); shapeHull(hullGeo, 6.6, 2.15, 1.0, 0.55);
      const hull = new THREE.Mesh(hullGeo, wood); hull.position.y = 0.5; g.add(hull);
      const deckGeo = new THREE.BoxGeometry(1.9, 0.16, 6.2, 2, 1, 6); shapeHull(deckGeo, 6.2, 1.9, 0.16, 0.8);
      const deck = new THREE.Mesh(deckGeo, wood); deck.position.set(0, 1.0, 0.1); g.add(deck);
      // chrome waterline + trim
      const trimGeo = new THREE.BoxGeometry(2.2, 0.05, 6.0, 2, 1, 12);
      trimGeo.translate(0, 0, 0.1);
      shapeHull(trimGeo, 6.6, 2.2, 0, 0);                     // sheer strake, tapered with the hull
      const trimT = new THREE.Mesh(trimGeo, chrome()); trimT.position.set(0, 0.98, 0); g.add(trimT);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.32, 1.0), mat(spec.seat, { roughness: 0.9, metalness: 0 })); bench.position.set(0, 1.06, -0.4); g.add(bench);
      windshield(g, 1.5, 0.42, 1.32, 0.7, -0.3, 0xcfcabc);
      // wheel
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 14), chrome()); wheel.position.set(-0.35, 1.2, 0.2); wheel.rotation.y = 0.4; g.add(wheel);
      // flag mast
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), chrome()); mast.position.set(0, 1.3, -3.05); g.add(mast);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshStandardMaterial({ color: spec.seat, side: THREE.DoubleSide })); flag.position.set(0.2, 1.48, -3.05); g.add(flag);
      cleat(g, 0.45, 2.0, 1.02); cleat(g, -0.45, 2.0, 1.02);
      // relaxed captain on the bench, flat cap, right hand on the wheel
      const capt = driverFigure({ pose: 'sit', lean: 0.08, footDrop: 0.06, suit: 0xe8e2d0, cap: 0x5b3a1e,
        handR: [0.02, 0.1, 0.55] });
      capt.position.set(-0.35, 1.16, -0.42); g.add(capt);
      navLights(g, 0.64, 2.0, -3.1, 1.02);
      g.userData.size = { r: 2.1, len: 6.6 };
      return g;
    },

    // The Chicago architecture cruise boat: long, low, open on top, canopy on posts, rows of
    // benches, a wheelhouse forward and a docent at the mic amidships. Real ones run the Main Stem
    // all day at about 8 knots. Everything repeated — seats, posts, passengers — is merged, so all
    // thirty metres of her cost about what the speedboat costs.
    tourboat(spec) {
      const g = new THREE.Group();
      const LOA = 30, BEAM = 7.0, DEP = 2.1, SHEER = 0.30;
      const HY = 0.30;              // hull mesh offset: geometry-local y + HY = metres above the waterline
      const DECK = 1.42;            // open deck surface
      const rng = RR.U.mulberry(30301);
      // shape() follows the hull: taper to the stem, V-bottom, sheer rise. flat() only tapers, for
      // the bands that live at the waterline — a boot top is level, it does not sweep up at the bow.
      const shape = (geo) => { shapeHull(geo, LOA, BEAM, DEP, SHEER); return geo; };
      const flat = (geo) => { shapeHull(geo, LOA, BEAM, 0, 0); return geo; };
      const white = mat(spec.hull, { roughness: 0.5, metalness: 0.08 });
      const navy = mat(0x152c46, { roughness: 0.5, metalness: 0.1 });

      // ---- hull: white topsides, red boot top ON the waterline, navy sheer stripe under the deck
      const hull = new THREE.Mesh(shape(new THREE.BoxGeometry(BEAM, DEP, LOA, 4, 2, 18)), white);
      hull.position.y = HY; g.add(hull);
      const boot = new THREE.Mesh(flat(new THREE.BoxGeometry(BEAM + 0.08, 0.30, LOA - 0.6, 4, 1, 16)),
        mat(spec.accent, { roughness: 0.55 }));
      boot.position.y = 0.02; g.add(boot);                       // y = 0 is the water surface
      const sheerStripe = new THREE.BoxGeometry(BEAM + 0.08, 0.22, LOA - 0.5, 4, 1, 16);
      sheerStripe.translate(0, 0.82, 0); shape(sheerStripe);
      const sheerM = new THREE.Mesh(sheerStripe, navy); sheerM.position.y = HY; g.add(sheerM);
      // the enclosed lower saloon, read as one long strip of tinted glass down each side
      const winBand = new THREE.BoxGeometry(BEAM + 0.06, 0.46, LOA - 8, 4, 1, 14);
      winBand.translate(0, 0.30, -0.6); shape(winBand);
      const winM = new THREE.Mesh(winBand, glassMat()); winM.position.y = HY; g.add(winM);

      // ---- deck, bulwark boards and cap rail (all merged into two meshes) ----
      const teak = RR.U.canvasTexture(64, 256, (c, w, h) => {
        c.fillStyle = '#8a6a44'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) {
          c.fillStyle = i % 2 ? 'rgba(60,38,18,.35)' : 'rgba(210,180,140,.18)';
          c.fillRect(i * (w / 8), 0, 2, h);
        }
      });
      teak.wrapS = teak.wrapT = THREE.RepeatWrapping; teak.repeat.set(2, 8);
      const deckGeo = new THREE.BoxGeometry(BEAM - 0.6, 0.14, LOA - 1.6, 4, 1, 16);
      deckGeo.translate(0, DECK - HY, 0); shape(deckGeo);
      const deckM = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: teak, color: spec.deck, roughness: 0.7 }));
      deckM.position.y = HY; g.add(deckM);
      const trimGeos = [];
      for (const s of [-1, 1]) {                                  // bulwark board, converging at the stem
        const b = new THREE.BoxGeometry(0.16, 0.62, LOA - 2.4, 1, 1, 16);
        b.translate(s * (BEAM / 2 - 0.05), DECK - HY + 0.24, 0);
        trimGeos.push(b);
        const cap = new THREE.BoxGeometry(0.30, 0.10, LOA - 2.4, 1, 1, 16);
        cap.translate(s * (BEAM / 2 - 0.05), DECK - HY + 0.58, 0);
        trimGeos.push(cap);
      }
      const bowCap = new THREE.BoxGeometry(BEAM, 0.62, 1.2, 3, 1, 1);
      bowCap.translate(0, DECK - HY + 0.24, LOA / 2 - 0.9); trimGeos.push(bowCap);
      const transom = new THREE.BoxGeometry(BEAM, 0.62, 0.5, 3, 1, 1);
      transom.translate(0, DECK - HY + 0.24, -LOA / 2 + 0.6); trimGeos.push(transom);
      for (const geo of trimGeos) shape(geo);
      const trim = new THREE.Mesh(RR.City.mergeGeoms(trimGeos), white);
      trim.position.y = HY; g.add(trim);

      // ---- rows of benches down both sides of a centre aisle ----
      const padGeos = [], frameGeos = [];
      const rows = [];
      for (let z = -12.2; z <= 6.2; z += 1.55) rows.push(z);
      for (const z of rows) {
        for (const s of [-1, 1]) {
          const pad = new THREE.BoxGeometry(2.3, 0.14, 0.54); pad.translate(s * 1.75, DECK + 0.42, z);
          const back = new THREE.BoxGeometry(2.3, 0.52, 0.12); back.translate(s * 1.75, DECK + 0.70, z - 0.27);
          padGeos.push(pad, back);
          const rail = new THREE.BoxGeometry(2.2, 0.28, 0.10); rail.translate(s * 1.75, DECK + 0.22, z);
          frameGeos.push(rail);
        }
      }
      const seats = new THREE.Mesh(RR.City.mergeGeoms(padGeos), mat(spec.seat, { roughness: 0.85, metalness: 0 }));
      g.add(seats);
      g.add(new THREE.Mesh(RR.City.mergeGeoms(frameGeos), mat(0x2a2f36, { roughness: 0.7, metalness: 0.3 })));

      // ---- the passengers: two to a bench on about half the rows, a few turned to look up ----
      const COATS = [0xb03a2e, 0x27496d, 0x3d6b45, 0xd9c17a, 0x6c4675, 0x2f3640, 0xc98a3a];
      const SKINS = [0xc9946a, 0x8d5a3b, 0xe0b189, 0x6b4229];
      const people = [];
      for (let i = 0; i < rows.length; i++) {
        if (i % 2 === 1 && i !== 3) continue;                     // a real tour is never full
        for (const s of [-1, 1]) {
          for (const o of [-0.55, 0.55]) {
            if (rng() < 0.22) continue;
            const look = (rng() - 0.5) * 1.5;                     // heads turned toward the skyline
            personGeoms(people, s * 1.75 + o, DECK + 0.48, rows[i] + 0.05, {
              rotY: look, lean: 0.10 + rng() * 0.12,
              coat: COATS[(i * 3 + (s > 0 ? 1 : 0) + (o > 0 ? 2 : 0)) % COATS.length],
              skin: SKINS[Math.floor(rng() * SKINS.length)],
            });
          }
        }
      }
      const crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
      g.add(new THREE.Mesh(RR.City.mergeGeoms(people), crowdMat));

      // ---- canopy: striped awning on twelve posts over the seating ----
      const awn = RR.U.canvasTexture(128, 128, (c, w, h) => {
        c.fillStyle = '#f2ece0'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#b8362b';
        for (let i = 0; i < 4; i++) c.fillRect(0, i * (h / 4), w, h / 8);
      });
      awn.wrapS = awn.wrapT = THREE.RepeatWrapping; awn.repeat.set(1, 6);
      // stops short of the forward rows: on the real boats the best seats are the open ones,
      // because the whole point is looking straight up at the buildings
      const CY = DECK + 2.40, CZ0 = -12.8, CZ1 = 3.4;
      const canopyGeos = [];
      const roof = new THREE.BoxGeometry(BEAM - 0.7, 0.13, CZ1 - CZ0);
      roof.translate(0, CY, (CZ0 + CZ1) / 2); canopyGeos.push(roof);
      for (const s of [-1, 1]) {                                  // valance along both edges
        const v = new THREE.BoxGeometry(0.10, 0.26, CZ1 - CZ0);
        v.translate(s * (BEAM / 2 - 0.35), CY - 0.18, (CZ0 + CZ1) / 2); canopyGeos.push(v);
      }
      g.add(new THREE.Mesh(RR.City.mergeGeoms(canopyGeos), new THREE.MeshStandardMaterial({ map: awn, roughness: 0.9, side: THREE.DoubleSide })));
      const postGeos = [];
      for (let z = CZ0 + 1.2; z < CZ1; z += 3.2) {
        for (const s of [-1, 1]) {
          const p = new THREE.CylinderGeometry(0.07, 0.07, 2.40, 6);
          p.translate(s * (BEAM / 2 - 0.42), DECK + 1.20, z); postGeos.push(p);
        }
      }
      g.add(new THREE.Mesh(RR.City.mergeGeoms(postGeos), chrome()));

      // ---- wheelhouse, forward, where the skipper can see the piers ----
      const WZ = 9.6;
      const house = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 3.0), white);
      house.position.set(0, DECK + 1.15, WZ); g.add(house);
      const houseGlass = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 3.1), glassMat());
      houseGlass.position.set(0, DECK + 1.62, WZ); g.add(houseGlass);
      const houseRoof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 3.4), navy);
      houseRoof.position.set(0, DECK + 2.37, WZ); g.add(houseRoof);
      const mastGeos = [];
      const mast = new THREE.CylinderGeometry(0.06, 0.08, 1.5, 6); mast.translate(0, DECK + 3.15, WZ - 0.4);
      const radar = new THREE.BoxGeometry(1.5, 0.10, 0.22); radar.translate(0, DECK + 3.85, WZ - 0.4);
      mastGeos.push(mast, radar);
      g.add(new THREE.Mesh(RR.City.mergeGeoms(mastGeos), chrome()));
      // the skipper at the wheel — kept as her own mesh so main.js can stand her down when the
      // passenger with five taps of F takes over
      const skipperGeos = [];
      personGeoms(skipperGeos, -0.55, DECK + 0.02, WZ - 0.5, { stand: true, lean: 0.12, coat: 0x1d3a5c, legs: 0x20252c, skin: 0xc9946a });
      const skipper = new THREE.Mesh(RR.City.mergeGeoms(skipperGeos), crowdMat);
      g.add(skipper);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 14), mat(0x3a2415, { metalness: 0.3 }));
      wheel.position.set(-0.55, DECK + 1.05, WZ + 0.55); wheel.rotation.x = -0.35; g.add(wheel);

      // ---- the docent, amidships at the mic, facing the passengers ----
      const docent = driverFigure({
        pose: 'stand', lean: 0.05, suit: 0x1c2a3a, vest: spec.accent, cap: 0x14203a,
        handR: [0.16, 1.05, 0.22],
      });
      docent.position.set(0.9, DECK, 6.4); docent.rotation.y = Math.PI; g.add(docent);
      const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), mat(0x14161c));
      mic.position.set(0.72, DECK + 0.6, 6.2); g.add(mic);
      const speaker = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.24), mat(0x20252c, { roughness: 0.8 }));
      speaker.position.set(0, DECK + 1.9, 5.6); g.add(speaker);

      // ---- name boards, both sides, on the flat of the topsides ----
      const nameTex = RR.U.canvasTexture(512, 64, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.fillStyle = '#152c46'; c.font = 'bold 44px Georgia, "Times New Roman", serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('WACKER BELLE', w / 2, h / 2 + 2);
      });
      const nameMat = new THREE.MeshStandardMaterial({ map: nameTex, transparent: true, roughness: 0.6 });
      for (const s of [-1, 1]) {
        const n = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.55), nameMat);
        n.position.set(s * (BEAM / 2 + 0.04), 1.02, -1.5);
        n.rotation.y = s * Math.PI / 2; g.add(n);
      }

      // ---- the Chicago flag on the stern staff: two bars, four six-pointed stars ----
      const flagTex = RR.U.canvasTexture(96, 64, (c, w, h) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#b3ddf2'; c.fillRect(0, h * 0.17, w, h * 0.16); c.fillRect(0, h * 0.67, w, h * 0.16);
        c.fillStyle = '#ff0000';
        for (let i = 0; i < 4; i++) {
          const cx = w * (0.2 + i * 0.2), cy = h / 2, r = h * 0.13;
          c.beginPath();
          for (let k = 0; k < 12; k++) {
            const a = -Math.PI / 2 + k * Math.PI / 6, rr = k % 2 ? r * 0.45 : r;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            k ? c.lineTo(x, y) : c.moveTo(x, y);
          }
          c.closePath(); c.fill();
        }
      });
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), chrome());
      staff.position.set(1.9, DECK + 0.9, -14.3); g.add(staff);     // to starboard: the aisle is a view
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.9),
        new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
      flag.position.set(2.6, DECK + 1.35, -14.3); g.add(flag);

      const ringGeos = [];
      for (const s of [-1, 1]) {
        const r = new THREE.TorusGeometry(0.34, 0.09, 6, 14);
        r.rotateY(Math.PI / 2); r.translate(s * (BEAM / 2 - 0.16), DECK + 0.30, -8.5);
        ringGeos.push(r);
      }
      g.add(new THREE.Mesh(RR.City.mergeGeoms(ringGeos), mat(0xff7a1a, { roughness: 0.7 })));

      cleat(g, 3.0, 12.4, DECK + 0.5); cleat(g, -3.0, 12.4, DECK + 0.5);
      navLights(g, 3.1, 12.0, -14.6, DECK + 0.55);
      g.userData.size = { r: 5.4, len: LOA };
      // Where a passenger's eyes actually are. main.js parks the tour cameras on these, in the
      // hull's own frame, so the views ride the boat exactly like the seats do.
      g.userData.seatCams = {
        seat: [-1.75, DECK + 1.50, -2.9],        // port bench amidships, rows receding forward under the awning
        foredeck: [0.9, DECK + 1.75, 12.9],      // right up in the bow, where you crane your neck
        stern: [0, DECK + 3.4, -18.0],           // astern of the transom: the whole boat in frame
        wheel: [-0.55, DECK + 1.95, WZ + 1.72],  // over the front of the pilot house, clear of its glass
        helm: [0, DECK + 6.4, -28.0],            // the driving shot: 30 m of boat between you and the river
      };
      g.userData.crew = { skipper, docent };
      return g;
    },

    // Anakin's Podracer, matched to the film reference: each engine is a LONG SILVER
    // machinery cylinder (ribbed, chrome-banded, maroon belly) with a pointed silver
    // intake + spinner at the FRONT. The only gold is (a) the pair of rounded nacelle
    // bulbs slung under the front, domes facing forward, and (b) the three flat vanes
    // that trail off the back with rounded tips and blue X-marks. A magenta binder
    // crackles between the engines; the cockpit is towed far behind on two cables.
    podracer(spec) {
      const g = new THREE.Group();
      // moderate metalness — with no envmap, high-metal surfaces go BLACK whenever the sun
      // is behind them, which is exactly how the turbine blocks turned into dark barrels
      const silver = () => mat(0xd6dade, { roughness: 0.36, metalness: 0.5 });    // engine machinery (the dominant color)
      const brightChrome = () => mat(0xe9edf0, { roughness: 0.22, metalness: 0.6 });
      const goldMat = mat(spec.hull, { roughness: 0.4, metalness: 0.55 });        // ONLY the bulbs + trailing vanes
      const maroonMat = mat(0x7c3230, { roughness: 0.55, metalness: 0.25 });      // engine belly panel
      const blueMat = mat(0x3550b0, { roughness: 0.5, metalness: 0.2 });          // blue X-marks + accents
      const podM = mat(spec.deck, { roughness: 0.3, metalness: 0.55 });           // silver cockpit
      const cableMat = mat(0x24262b, { roughness: 0.6, metalness: 0.5 });         // Steelton control cables
      const darkM = mat(0x08090c, { roughness: 0.7, metalness: 0.3 });
      const rings = [], plasma = [], sparks = [], glows = [];
      // additive magenta so the energy binder crackles like the film, day or night
      const plasmaMat = () => new THREE.MeshBasicMaterial({ color: spec.accent, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const glowMat = () => new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

      const EX = 1.2;                                   // engine half-separation (they nearly touch)
      const EY = 0.82;                                  // engine axis height
      const EZ = 0.6;                                   // engine group forward offset

      // Static engine parts are accumulated per material and merged into ONE mesh each —
      // film detail without a draw-call explosion. Coordinates are LOCAL to an engine axis;
      // the s*EX/EY/EZ offset bakes in at push time.
      const silverGeos = [], goldGeos = [], darkGeos = [], chromeGeos = [], accentGeos = [], maroonGeos = [];
      function pushG(arr, geo, s) { geo.translate(s * EX, EY, EZ); arr.push(geo); }
      const cylZ = (r0, r1, len, seg) => { const c = new THREE.CylinderGeometry(r0, r1, len, seg || 16); c.rotateX(Math.PI / 2); return c; };

      function engine(s) {
        // --- FRONT (the end that leads): a big BLACK radial turbine fan filling a gold-
        // rimmed cowl, with the GOLD rounded spinner cone protruding from its center —
        // jet-engine anatomy, exactly like the reference render ---
        const rim = new THREE.TorusGeometry(0.86, 0.09, 8, 24); rim.translate(0, 0, 3.35);
        pushG(goldGeos, rim, s);                                          // gold cowl rim around the fan
        const cowl = new THREE.CylinderGeometry(0.88, 0.82, 0.6, 20, 1, true);
        cowl.rotateX(Math.PI / 2); cowl.translate(0, 0, 3.05);
        pushG(goldGeos, cowl, s);                                         // short gold cowl behind the rim
        const face = new THREE.CircleGeometry(0.8, 20); face.translate(0, 0, 3.24);
        pushG(darkGeos, face, s);                                         // black fan backdrop
        for (let i = 0; i < 3; i++) {                                     // triple air scoops around the cowl
          const a = Math.PI / 2 + i * (Math.PI * 2 / 3);
          const t = cylZ(0.14, 0.14, 0.7, 8); t.translate(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 2.85);
          pushG(darkGeos, t, s);
        }

        // --- LONG silver machinery body, tapering REARWARD (dominant color) ---
        pushG(silverGeos, cylZ(0.82, 0.66, 4.6, 20).translate(0, 0, 0.75), s);   // spans z −1.55 … +3.05
        for (const zz of [2.55, 1.7, 0.8, -0.15, -1.05]) {                // chrome band rings down the body
          const ring = new THREE.TorusGeometry(0.82, 0.05, 6, 24); ring.translate(0, 0, zz);
          pushG(chromeGeos, ring, s);
        }
        for (let i = 0; i < 8; i++) {                                     // vertical machinery ribs, front block
          const rib = new THREE.BoxGeometry(0.05, 0.18, 1.8); rib.translate(0, 0.79, 1.9); rib.rotateZ(i * Math.PI / 4);
          pushG(silverGeos, rib, s);
        }
        const belly = new THREE.CylinderGeometry(0.84, 0.72, 3.0, 16, 1, true, Math.PI / 2 - 0.6, 1.2);
        belly.rotateX(Math.PI / 2); belly.translate(0, 0, 0.3);
        pushG(maroonGeos, belly, s);                                      // maroon underbelly panel (bottom only)
        const crown = new THREE.BoxGeometry(0.5, 0.06, 1.3); crown.translate(0, 0.82, 1.6);
        pushG(goldGeos, crown, s);                                        // gold "620" panel on the crown
        for (const d of [-1, 1]) {                                        // small blue accent squares
          const sq = new THREE.BoxGeometry(0.24, 0.05, 0.24); sq.translate(0, 0.78, 0.3); sq.rotateZ(d * 0.9);
          pushG(accentGeos, sq, s);
        }

        // --- REAR (toward the towed cockpit): silver taper ending in the pointed TAIL
        // SPIKE — the spike is the exhaust cone at the BACK, never the nose ---
        pushG(silverGeos, cylZ(0.66, 0.34, 0.9, 16).translate(0, 0, -2.0), s);
        const spike = new THREE.ConeGeometry(0.3, 1.1, 12); spike.rotateX(Math.PI / 2); spike.rotateY(Math.PI);
        spike.translate(0, 0, -2.95);                                     // tip aft at z ≈ −3.5
        pushG(silverGeos, spike, s);

        // --- gold vanes: they flare FORWARD around the fan like a claw (per the official
        // render) — anchored on the machinery behind the cowl, sweeping ahead alongside
        // the fan with rounded tips reaching past the spinner cone, blue X near the tips ---
        for (const psi of [Math.PI / 2, Math.PI / 2 + 2.1, Math.PI / 2 - 2.1]) {
          const rot = psi - Math.PI / 2;
          const vane = [];
          const plank = new THREE.BoxGeometry(0.95, 0.08, 3.9); vane.push(plank);            // vane-local, centered
          const round = new THREE.CylinderGeometry(0.475, 0.475, 0.08, 10, 1, false, -Math.PI / 2, Math.PI);
          round.translate(0, 0, 1.95); vane.push(round);                                     // rounded FRONT tip
          const strips = [];
          for (const d of [-1, 1]) {
            const strip = new THREE.BoxGeometry(0.6, 0.045, 0.15); strip.rotateY(d * 0.62); strip.translate(0, 0.06, 1.3);
            strips.push(strip);
          }
          for (const p of vane.concat(strips)) {
            p.rotateX(-0.09);                       // slight outward flare toward the front tip
            p.translate(0, 0.88, 2.6);              // anchor just behind the cowl → tips reach z ≈ 4.5
            p.rotateZ(rot);
            pushG(strips.includes(p) ? accentGeos : goldGeos, p, s);
          }
        }

        // --- live parts: the big fan + gold spinner cone turning at the FRONT,
        // and the exhaust glow streaming off the tail spike ---
        const comp = new THREE.Group();
        const bladeGeos = [];
        for (let i = 0; i < 13; i++) {
          const a = i / 13 * Math.PI * 2;
          const bl = new THREE.BoxGeometry(0.14, 0.62, 0.06);
          bl.rotateZ(0.5); bl.translate(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0); bl.rotateZ(a);
          bladeGeos.push(bl);
        }
        comp.add(new THREE.Mesh(RR.City.mergeGeoms(bladeGeos), mat(0x23262b, { roughness: 0.5, metalness: 0.4 })));
        const spinGeos = [];
        const scone = new THREE.CapsuleGeometry(0.26, 0.55, 6, 12); scone.rotateX(Math.PI / 2); scone.translate(0, 0, 0.38);
        spinGeos.push(scone);                                             // the GOLD rounded spinner cone, poking forward
        comp.add(new THREE.Mesh(RR.City.mergeGeoms(spinGeos), goldMat));
        comp.position.set(s * EX, EY, EZ + 3.34); rings.push(comp); g.add(comp);
        const glow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.5, 12), glowMat());
        glow.rotation.x = -Math.PI / 2;                                   // tip aft, off the tail spike
        glow.position.set(s * EX, EY, EZ - 3.3); glow.layers.set(1); glow.renderOrder = 3;
        glows.push(glow); g.add(glow);
      }
      engine(-1); engine(1);

      // merge + mount the static engine geometry (6 draw calls for both engines)
      for (const [geos, m] of [[silverGeos, silver()], [goldGeos, goldMat], [darkGeos, darkM], [chromeGeos, brightChrome()], [accentGeos, blueMat], [maroonGeos, maroonMat]]) {
        const mesh = new THREE.Mesh(RR.City.mergeGeoms(geos), m);
        mesh.castShadow = true; g.add(mesh);
      }

      // ---- the energy binder: a jagged magenta arc between the engines' REAR inner
      // faces — the spot Anakin stares at from the cockpit, matching the render ----
      for (let i = 0; i < 7; i++) {
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(2 * EX - 0.9, 0.07, 0.06), plasmaMat());
        bolt.position.set(0, EY - 0.25 + i * 0.11, EZ - 1.7 + Math.sin(i * 2.1) * 0.2);
        bolt.rotation.z = Math.sin(i * 3.7) * 0.45;
        bolt.renderOrder = 3; sparks.push(bolt); g.add(bolt);
      }
      // The glow AROUND the arc. It has to stay faint: an additive box at any real opacity paints
      // its top face as a flat magenta panel from above, which read as an untextured face.
      const haze = new THREE.Mesh(new THREE.BoxGeometry(2 * EX - 1.3, 0.44, 0.30), plasmaMat());
      haze.position.set(0, EY, EZ - 1.7); haze.renderOrder = 3;
      plasma.push(haze); g.add(haze);

      // ---- the tiny cockpit sled, towed FAR behind across open air (film signature:
      // nothing rigid links pod to engines — only the two cables span the gap) ----
      const PZ = -6.1;                                                   // pod center — a real gap behind the cowls
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), podM);
      pod.scale.set(0.78, 0.6, 1.9); pod.position.set(0, 0.34, PZ); g.add(pod);
      const cnose = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 14), podM);
      cnose.rotation.x = Math.PI / 2; cnose.position.set(0, 0.38, PZ + 1.25); g.add(cnose);  // the pod's own short nose
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.4), glassMat());
      screen.position.set(0, 0.74, PZ + 0.6); screen.rotation.x = -0.55; g.add(screen);      // windscreen
      for (const s of [-1, 1]) {                                                             // tall curved side boards
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 1.5), podM);
        board.position.set(s * 0.55, 0.62, PZ + 0.1); board.rotation.z = s * 0.16; g.add(board);
      }
      for (const s of [-1, 1]) {                                                             // flat tail outrigger fins
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.5), podM);
        fin.position.set(s * 0.55, 0.5, PZ - 0.6); fin.rotation.z = s * 0.22; g.add(fin);
      }
      const cfin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.66), podM);
      cfin.position.set(0, 0.82, PZ - 0.85); g.add(cfin);                                    // dorsal tail fin
      const crim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16), chrome());
      crim.rotation.x = Math.PI / 2; crim.position.set(0, 0.66, PZ - 0.05); g.add(crim);
      const pilot = driverFigure({ pose: 'sit', lean: 0.26, footDrop: 0.1, suit: 0x8a6f4a, vest: 0xcaa06a, helmet: 0x7a5a3a, visor: true, scale: 0.88 });
      pilot.position.set(0, 0.42, PZ - 0.15); g.add(pilot);

      // ---- Steelton control cables spanning the AIR GAP: pod nose → rising arc → the
      // engines' REAR tops (short runs, like the render) ----
      for (const s of [-1, 1]) {
        limb(g, cableMat, 0.045, 0, 0.58, PZ + 1.5, s * 0.85, 1.4, -3.5);   // nose → high arc over the gap
        limb(g, cableMat, 0.045, s * 0.85, 1.4, -3.5, s * (EX - 0.15), EY + 0.5, EZ - 1.5);  // arc → rear top
      }

      navLights(g, 1.9, 2.4, PZ - 1.0, EY);
      g.userData.size = { r: 2.7, len: 9.0 };
      g.userData.noFlame = true;               // boost shows on the engine glows, not a stern cone
      g.userData.hoverShow = 1.14;             // extra lift so it floats in the showroom too
                                               // (absorbs main.js seating the hulled boats 0.34 lower)
      g.userData.tick = function (t, boat) {
        const sp = boat ? Math.hypot(boat.vel.x, boat.vel.z) : 7;
        const rev = t * (10 + sp * 0.5);
        for (const r of rings) r.rotation.z = rev;
        const fl = 0.55 + 0.3 * Math.sin(t * 30) + 0.16 * Math.sin(t * 63 + 1.3);
        for (const pl of plasma) pl.material.opacity = 0.09 + 0.06 * fl;   // the haze only breathes
        for (let i = 0; i < sparks.length; i++) sparks[i].visible = Math.sin(t * 42 + i * 7.3) > 0.2;   // crackle
        const boost = boat ? (boat.boostHeat || 0) : 0.2;
        for (const gl of glows) {
          gl.scale.set(1, 1 + boost * 1.3 + 0.12 * Math.sin(t * 26), 1);
          gl.material.opacity = 0.4 + boost * 0.4 + 0.12 * Math.sin(t * 31);
        }
      };
      return g;
    },
  };

  // fire boat: rigid inflatable — speedboat hull + collar + light bar + console
  function buildRescue(spec) {
    const g = builders.speedboat(spec);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.32, 8, 22), mat(0x8f1c14, { roughness: 0.75, metalness: 0.05 }));
    collar.rotation.x = Math.PI / 2; collar.scale.set(1, 2.1, 1); collar.position.set(0, 0.8, 0.1); g.add(collar);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x2255ff, emissive: 0x2255ff, emissiveIntensity: 1.5, roughness: 0.4 }));
    bar.position.set(0, 2.0, -0.6); g.add(bar);
    // water cannon
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.0, 8), chrome()); cannon.rotation.x = 0.6; cannon.position.set(0, 1.7, 1.6); g.add(cannon);
    return g;
  }

  B.build = function (spec) {
    const g = spec.id === 'rescue' ? buildRescue(spec) : builders[spec.kind](spec);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  };

  RR.Boats = B;
})();
