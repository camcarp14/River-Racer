/* River Racer — procedural vehicle meshes + stat sheets */
(function () {
  const B = {};

  // stats: top (m/s), accel (m/s^2), turn (rad/s @ speed), grip (lateral damping), agility feel
  B.CATALOG = [
    {
      id: 'jetski', name: 'RX BLACKHAWK', kind: 'jetski',
      desc: 'Sport jet ski. Whips around bridge piers like a startled duck. Fragile top end, absurd agility.',
      top: 33, accel: 15.5, turn: 2.5, grip: 3.6, lean: 0.55, boost: 1.22, mass: 0.7,
      hull: 0x1b1e26, deck: 0xff3b30, accent: 0xffc857, seat: 0x22262e,
    },
    {
      id: 'speedboat', name: 'FORMULA 350 GT', kind: 'speedboat',
      desc: 'Offshore V-hull muscle. Monster straight-line pace — but it needs the whole channel to turn.',
      top: 41, accel: 11.5, turn: 1.3, grip: 1.9, lean: 0.34, boost: 1.16, mass: 1.45,
      hull: 0x10315e, deck: 0xf2f4f6, accent: 0xff3b30, seat: 0x1a1d22,
    },
    {
      id: 'f1', name: 'F1H2O PROTOTYPE', kind: 'f1',
      desc: 'Tunnel-hull race cat. The fastest thing on the river — if you can keep it pointed straight.',
      top: 46, accel: 14.0, turn: 1.6, grip: 2.2, lean: 0.22, boost: 1.14, mass: 0.9,
      hull: 0xffc857, deck: 0x14161c, accent: 0x0f8bd0, seat: 0x14161c,
    },
    {
      id: 'runabout', name: 'LAKESIDE QUEEN ’47', kind: 'runabout',
      desc: 'Varnished mahogany classic. Slowest in class — but glued to the water, with the strongest boost aboard.',
      top: 30, accel: 10.0, turn: 2.1, grip: 3.7, lean: 0.30, boost: 1.3, mass: 1.2,
      hull: 0x6e3b1c, deck: 0x8a5224, accent: 0xe8e2d0, seat: 0x7a1f16,
    },
    {
      id: 'rescue', name: 'CFD MARINE 7-1', kind: 'speedboat',
      desc: 'Fire department rigid inflatable. Punchy, planted, and it bounces off seawalls with dignity.',
      top: 36, accel: 13.0, turn: 1.85, grip: 3.0, lean: 0.28, boost: 1.2, mass: 1.35,
      hull: 0xd42a1e, deck: 0x1f242b, accent: 0xf5f6f7, seat: 0x14161c,
    },
    {
      id: 'podracer', name: 'ANAKIN’S PODRACER', kind: 'podracer',
      desc: 'Twin radial turbines on a plasma tether, skimming the river on a cushion of thrust. Untouchable top end — if you can steer the thing.',
      top: 61, accel: 21.0, turn: 1.55, grip: 1.7, lean: 0.42, boost: 1.18, mass: 0.85,
      hover: 1.15,                                    // rides ~1.15m above the wave crests
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

  // red port / green starboard / white stern nav lights (glow at night via bloom)
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
      navLights(g, 0.5, 1.3, -1.5, 0.72);
      g.userData.size = { r: 1.4, len: 3.2 };
      return g;
    },

    speedboat(spec) {
      const g = new THREE.Group();
      const hullGeo = new THREE.BoxGeometry(2.35, 1.05, 7.8, 3, 2, 10);
      shapeHull(hullGeo, 7.8, 2.35, 1.05, 0.7);
      const hull = new THREE.Mesh(hullGeo, mat(spec.hull, { roughness: 0.22, metalness: 0.35 }));
      hull.position.y = 0.5; g.add(hull);
      // topside racing stripe wrapping the sheer
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.22, 7.0), mat(spec.accent, { roughness: 0.3 }));
      stripe.position.set(0, 0.86, 0.2); g.add(stripe);
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
      cleat(g, 0.9, 3.0, 1.12); cleat(g, -0.9, 3.0, 1.12);
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
      navLights(g, 1.05, 3.4, -4.0, 1.1);
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
      const str = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 5.0), mat(spec.hull, { roughness: 0.3 })); str.position.set(0, 0.9, 0.1); g.add(str);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glassMat()); canopy.scale.set(0.85, 0.75, 1.5); canopy.position.set(0, 1.0, -0.5); g.add(canopy);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 12, Math.PI), chrome()); halo.rotation.x = Math.PI / 2; halo.position.set(0, 1.05, -0.5); g.add(halo);
      // rear wing
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.55), mat(spec.accent, { roughness: 0.3 })); wing.position.set(0, 1.2, -2.3); g.add(wing);
      for (const s of [-1.05, 1.05]) { const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.3), mat(0x14161a)); strut.position.set(s, 0.9, -2.3); g.add(strut); }
      const num = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), mat(0xffffff)); num.rotation.x = Math.PI / 2; num.position.set(0, 0.78, 2.0); g.add(num);
      // reclined pilot: only helmet + shoulders show under the glass, legs run into the hull
      const pilot = driverFigure({ pose: 'recline', lean: 0.35, suit: spec.hull, helmet: spec.accent, visor: true, legs: false, arms: false });
      pilot.position.set(0, 0.48, -0.78); g.add(pilot);
      navLights(g, 1.3, 2.4, -2.0, 0.7);
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
      const trimT = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 6.0), chrome()); trimT.position.set(0, 0.98, 0.1); g.add(trimT);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.32, 1.0), mat(spec.seat, { roughness: 0.9, metalness: 0 })); bench.position.set(0, 1.06, -0.4); g.add(bench);
      windshield(g, 1.5, 0.42, 1.32, 0.7, -0.3, 0xcfcabc);
      // wheel
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 14), chrome()); wheel.position.set(-0.35, 1.2, 0.2); wheel.rotation.y = 0.4; g.add(wheel);
      // flag mast
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), chrome()); mast.position.set(0, 1.3, -3.05); g.add(mast);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshStandardMaterial({ color: spec.seat, side: THREE.DoubleSide })); flag.position.set(0.2, 1.48, -3.05); g.add(flag);
      cleat(g, 0.85, 2.7, 1.02);
      // relaxed captain on the bench, flat cap, right hand on the wheel
      const capt = driverFigure({ pose: 'sit', lean: 0.08, footDrop: 0.06, suit: 0xe8e2d0, cap: 0x5b3a1e,
        handR: [0.02, 0.1, 0.55] });
      capt.position.set(-0.35, 1.16, -0.42); g.add(capt);
      navLights(g, 0.95, 2.9, -3.1, 1.02);
      g.userData.size = { r: 2.1, len: 6.6 };
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
        // --- FRONT: pointed silver nose spike + flared intake maw + chrome lip + spinner ---
        const spike = new THREE.ConeGeometry(0.3, 0.95, 12); spike.rotateX(Math.PI / 2); spike.translate(0, 0, 4.15);
        pushG(silverGeos, spike, s);
        const maw = new THREE.CylinderGeometry(0.9, 0.74, 0.72, 20, 1, true); maw.rotateX(Math.PI / 2); maw.translate(0, 0, 3.4);
        pushG(silverGeos, maw, s);
        const mawLip = new THREE.TorusGeometry(0.89, 0.07, 8, 22); mawLip.translate(0, 0, 3.72);
        pushG(chromeGeos, mawLip, s);
        const mawIn = new THREE.CylinderGeometry(0.84, 0.7, 0.62, 20, 1, true); mawIn.rotateX(Math.PI / 2); mawIn.translate(0, 0, 3.4);
        pushG(darkGeos, mawIn, s);
        const face = new THREE.CircleGeometry(0.72, 18); face.translate(0, 0, 3.08);
        pushG(darkGeos, face, s);                                          // dark throat behind the spinner

        // --- LONG silver machinery body — the dominant color, running the whole length ---
        pushG(silverGeos, cylZ(0.82, 0.7, 5.0, 20).translate(0, 0, 0.55), s);   // spans z −1.95 … +3.05
        for (const zz of [2.7, 1.9, 1.05, 0.15, -0.85, -1.7]) {           // chrome band rings down the body
          const ring = new THREE.TorusGeometry(0.83, 0.05, 6, 24); ring.translate(0, 0, zz);
          pushG(chromeGeos, ring, s);
        }
        for (let i = 0; i < 8; i++) {                                     // vertical machinery ribs, front block
          const rib = new THREE.BoxGeometry(0.05, 0.18, 2.0); rib.translate(0, 0.8, 2.0); rib.rotateZ(i * Math.PI / 4);
          pushG(silverGeos, rib, s);
        }
        const belly = new THREE.CylinderGeometry(0.855, 0.735, 3.2, 16, 1, true, Math.PI / 2 - 0.6, 1.2);
        belly.rotateX(Math.PI / 2); belly.translate(0, 0, 0.7);
        pushG(maroonGeos, belly, s);                                      // maroon underbelly panel (bottom only)
        const crown = new THREE.BoxGeometry(0.5, 0.06, 1.3); crown.translate(0, 0.84, 1.8);
        pushG(goldGeos, crown, s);                                        // gold "620" panel on the crown
        for (const d of [-1, 1]) {                                        // small blue accent squares
          const sq = new THREE.BoxGeometry(0.24, 0.05, 0.24); sq.translate(0, 0.8, 0.4); sq.rotateZ(d * 0.9);
          pushG(accentGeos, sq, s);
        }

        // --- THE gold that belongs at the FRONT: two rounded nacelle bulbs slung under the
        // nose, their domes facing forward — the podracer's signature gold up front ---
        for (const bx of [-0.48, 0.48]) {
          const bulb = new THREE.CapsuleGeometry(0.33, 1.35, 6, 14); bulb.rotateX(Math.PI / 2);
          bulb.translate(bx, -0.62, 1.95);
          pushG(goldGeos, bulb, s);
          const bandR = new THREE.TorusGeometry(0.335, 0.045, 6, 16); bandR.translate(bx, -0.62, 1.7);
          pushG(chromeGeos, bandR, s);
        }

        // --- dark exhaust nozzle at the very back ---
        pushG(darkGeos, cylZ(0.5, 0.38, 0.95, 14).translate(0, 0, -2.35), s);

        // --- three gold vanes TRAILING off the back (dorsal + two splayed low), rounded
        // tips, blue X painted on their outer faces ---
        for (const psi of [Math.PI / 2, Math.PI / 2 + 2.1, Math.PI / 2 - 2.1]) {
          const rot = psi - Math.PI / 2;
          const plank = new THREE.BoxGeometry(0.9, 0.08, 3.7); plank.translate(0, 0.86, -1.35); plank.rotateZ(rot);  // z 0.5 … −3.2
          pushG(goldGeos, plank, s);
          const round = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 10, 1, false, Math.PI / 2, Math.PI);
          round.translate(0, 0.86, -3.2); round.rotateZ(rot);            // rounded trailing tip
          pushG(goldGeos, round, s);
          for (const d of [-1, 1]) {                                     // blue X on the outer face
            const strip = new THREE.BoxGeometry(0.6, 0.045, 0.15); strip.rotateY(d * 0.62); strip.translate(0, 0.905, -2.6); strip.rotateZ(rot);
            pushG(accentGeos, strip, s);
          }
        }

        // --- live parts: spinner turning inside the maw + exhaust glow at the back ---
        const comp = new THREE.Group();
        const compGeos = [];
        for (let i = 0; i < 11; i++) {
          const a = i / 11 * Math.PI * 2;
          const bl = new THREE.BoxGeometry(0.12, 0.55, 0.06);
          bl.rotateZ(0.5); bl.translate(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0); bl.rotateZ(a);
          compGeos.push(bl);
        }
        const cone = new THREE.ConeGeometry(0.17, 0.55, 8); cone.rotateX(Math.PI / 2); cone.translate(0, 0, 0.35);
        compGeos.push(cone);                                             // spinner cone hub poking forward
        comp.add(new THREE.Mesh(RR.City.mergeGeoms(compGeos), silver()));
        comp.position.set(s * EX, EY, EZ + 3.35); rings.push(comp); g.add(comp);
        const glow = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.9, 12), glowMat());
        glow.rotation.x = -Math.PI / 2;                                  // tip aft
        glow.position.set(s * EX, EY, EZ - 2.9); glow.layers.set(1); glow.renderOrder = 3;
        glows.push(glow); g.add(glow);
      }
      engine(-1); engine(1);

      // merge + mount the static engine geometry (6 draw calls for both engines)
      for (const [geos, m] of [[silverGeos, silver()], [goldGeos, goldMat], [darkGeos, darkM], [chromeGeos, brightChrome()], [accentGeos, blueMat], [maroonGeos, maroonMat]]) {
        const mesh = new THREE.Mesh(RR.City.mergeGeoms(geos), m);
        mesh.castShadow = true; g.add(mesh);
      }

      // ---- the energy binder: a jagged magenta arc leaping the gap between the inner
      // faces mid-engine (film-accurate spot), crackling via visibility flicker ----
      for (let i = 0; i < 7; i++) {
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(2 * EX - 1.0, 0.07, 0.06), plasmaMat());
        bolt.position.set(0, EY - 0.25 + i * 0.11, EZ + 0.55 + Math.sin(i * 2.1) * 0.14);
        bolt.rotation.z = Math.sin(i * 3.7) * 0.45;
        bolt.renderOrder = 3; sparks.push(bolt); g.add(bolt);
      }
      const haze = new THREE.Mesh(new THREE.BoxGeometry(2 * EX - 1.0, 0.9, 0.5), plasmaMat());
      haze.material.opacity = 0.16; haze.position.set(0, EY, EZ + 0.55); haze.renderOrder = 3;
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

      // ---- Steelton control cables spanning the AIR GAP: pod nose → rising arc → engine crown ----
      for (const s of [-1, 1]) {
        limb(g, cableMat, 0.045, 0, 0.58, PZ + 1.5, s * 0.9, 1.5, -2.4);   // nose → high arc over the gap
        limb(g, cableMat, 0.045, s * 0.9, 1.5, -2.4, s * (EX - 0.1), EY + 0.6, EZ + 0.7);  // arc → engine crown
      }

      navLights(g, 1.6, 4.2, PZ - 1.0, EY);
      g.userData.size = { r: 2.7, len: 9.0 };
      g.userData.noFlame = true;               // boost shows on the engine glows, not a stern cone
      g.userData.hoverShow = 0.8;              // extra lift so it floats in the showroom too
      g.userData.tick = function (t, boat) {
        const sp = boat ? Math.hypot(boat.vel.x, boat.vel.z) : 7;
        const rev = t * (10 + sp * 0.5);
        for (const r of rings) r.rotation.z = rev;
        const fl = 0.55 + 0.3 * Math.sin(t * 30) + 0.16 * Math.sin(t * 63 + 1.3);
        for (const pl of plasma) pl.material.opacity = Math.max(0.28, Math.min(1, fl));
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
