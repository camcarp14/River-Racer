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

    // Anakin's Podracer: two long radial-turbine engines (silver intake → golden open air-scoop)
    // with trailing forked control vanes, a magenta plasma energy-binder crackling between them,
    // and a small cockpit trailing behind on Steelton cables. Hovers (spec.hover) and marks the
    // water via turbine wash (effects.js). Local +z = forward (the intakes lead).
    podracer(spec) {
      const g = new THREE.Group();
      const silver = () => mat(0xc9ced2, { roughness: 0.3, metalness: 0.85 });   // turbine housings
      const tubeMat = mat(spec.hull, { roughness: 0.42, metalness: 0.55 });      // golden air-scoop tubes
      const vaneMat = mat(spec.hull, { roughness: 0.5, metalness: 0.35 });       // flat control vanes
      const blueMat = mat(0x2f5fc8, { roughness: 0.55, metalness: 0.2 });        // the blue "X" flashes
      const goldTri = mat(0xe0982a, { roughness: 0.45, metalness: 0.5 });        // engine-top emblem
      const podM = mat(spec.deck, { roughness: 0.3, metalness: 0.55 });          // silver cockpit
      const cableMat = mat(0x24262b, { roughness: 0.6, metalness: 0.5 });        // Steelton control cables
      const darkM = mat(0x08090c, { roughness: 0.7, metalness: 0.3 });
      const rings = [], plasma = [], sparks = [];
      // additive magenta so the energy binder crackles like the film, day or night
      const plasmaMat = () => new THREE.MeshBasicMaterial({ color: spec.accent, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

      const EX = 1.4;                                   // engine half-separation

      // ---- one engine, built along z about its own origin, then placed at (±EX, y, 0) ----
      function engine(s) {
        const e = new THREE.Group();
        // long golden air-scoop tube (rear), open at the back so it reads hollow
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 2.9, 18, 1, true), tubeMat);
        tube.rotation.x = Math.PI / 2; tube.position.z = -0.55; e.add(tube);
        const tubeIn = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.64, 2.7, 18, 1, true), darkM);   // dark inner wall
        tubeIn.rotation.x = Math.PI / 2; tubeIn.position.z = -0.55; e.add(tubeIn);
        const tubeCap = new THREE.Mesh(new THREE.CircleGeometry(0.6, 18), darkM);
        tubeCap.position.z = -1.9; tubeCap.rotation.y = Math.PI; e.add(tubeCap);                          // hollow-looking back
        // silver mid housing joining tube to the turbine
        const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.66, 1.2, 18), silver());
        mid.rotation.x = Math.PI / 2; mid.position.z = 1.4; e.add(mid);
        const joint = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.08, 8, 20), chrome());
        joint.position.z = 0.9; e.add(joint);
        // gold triangular emblem on the housing crown
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), goldTri);
        tri.rotation.x = Math.PI / 2; tri.position.set(0, 0.6, 1.5); e.add(tri);
        // flared silver turbine intake at the very front
        const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.72, 1.0, 20, 1, true), silver());
        intake.rotation.x = Math.PI / 2; intake.position.z = 2.55; e.add(intake);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.09, 8, 22), chrome());
        lip.position.z = 3.05; e.add(lip);
        // spinning compressor: hub + radial blades set into the maw
        const comp = new THREE.Group();
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 10), silver());
        hub.rotation.x = Math.PI / 2; comp.add(hub);
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2;
          const bl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.66, 0.05), silver());
          bl.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0); bl.rotation.z = a + 0.5; comp.add(bl);
        }
        comp.position.z = 2.35; rings.push(comp); e.add(comp);
        const back = new THREE.Mesh(new THREE.CircleGeometry(0.66, 18), darkM);
        back.position.z = 2.0; back.rotation.y = Math.PI; e.add(back);                                    // dark behind the blades

        // trailing forked control vanes (flat golden blades) with a blue X flash near each tip.
        // one rides the crown, two splay from the flanks — the podracer's tail signature.
        const vanes = [[0, 1.0, 0.0], [s * 0.62, 0.3, 0.7], [s * 0.62, 0.3, -0.7]];
        for (const [vx, vy, roll] of vanes) {
          const vane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 2.2), vaneMat);
          vane.position.set(vx, vy, -1.7); vane.rotation.z = roll; vane.rotation.x = 0.12; e.add(vane);
          for (const d of [-1, 1]) {                                   // small blue "X" near the tip
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.5), blueMat);
            b.position.set(vx, vy + 0.33, -2.3); b.rotation.z = roll; b.rotation.y = d * 0.5; e.add(b);
          }
        }
        e.position.set(s * EX, 0.72, 0.2);
        g.add(e);
      }
      engine(-1); engine(1);

      // ---- magenta energy binder crackling between the turbine fronts ----
      const field = new THREE.Mesh(new THREE.BoxGeometry(2 * EX - 0.4, 1.2, 0.08), plasmaMat());
      field.material.opacity = 0.3; field.position.set(0, 0.72, 2.2); field.renderOrder = 3; plasma.push(field); g.add(field);
      for (let i = 0; i < 6; i++) {
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(2 * EX - 0.3, 0.09, 0.07), plasmaMat());
        bolt.position.set(0, 0.2 + i * 0.2, 2.22); bolt.rotation.z = (i % 2 ? 0.5 : -0.5);
        bolt.renderOrder = 3; sparks.push(bolt); g.add(bolt);
      }

      // ---- cockpit shell trailing well behind, slung low ----
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), podM);
      pod.scale.set(0.78, 0.66, 1.5); pod.position.set(0, 0.34, -3.1); g.add(pod);
      const cnose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 14), podM);
      cnose.rotation.x = Math.PI / 2; cnose.position.set(0, 0.36, -2.0); g.add(cnose);   // points forward to the engines
      const cfin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.66, 0.9), goldTri);
      cfin.position.set(0, 0.82, -3.9); g.add(cfin);
      const crim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 16), chrome());
      crim.rotation.x = Math.PI / 2; crim.position.set(0, 0.7, -3.1); g.add(crim);
      const pilot = driverFigure({ pose: 'sit', lean: 0.26, footDrop: 0.1, suit: 0x8a6f4a, vest: 0xcaa06a, helmet: 0x7a5a3a, visor: true, scale: 0.9 });
      pilot.position.set(0, 0.4, -3.25); g.add(pilot);

      // ---- Steelton control cables: cockpit nose → each engine's rear-inner ----
      for (const s of [-1, 1]) limb(g, cableMat, 0.06, 0, 0.5, -2.2, s * (EX - 0.5), 0.72, -1.2);
      // plus a thin plasma tether tracing each cable so the binder energy reads along it
      for (const s of [-1, 1]) plasma.push(limb(g, plasmaMat(), 0.05, 0, 0.55, -2.1, s * (EX - 0.5), 0.8, -1.0));

      navLights(g, 1.6, 3.0, -3.9, 0.72);
      g.userData.size = { r: 2.7, len: 6.6 };
      g.userData.hoverShow = 0.8;              // extra lift so it floats in the showroom too
      g.userData.tick = function (t, boat) {
        const sp = boat ? Math.hypot(boat.vel.x, boat.vel.z) : 7;
        const rev = t * (10 + sp * 0.5);
        for (const r of rings) r.rotation.z = rev;
        const fl = 0.55 + 0.3 * Math.sin(t * 30) + 0.16 * Math.sin(t * 63 + 1.3);
        for (const pl of plasma) pl.material.opacity = Math.max(0.3, Math.min(1, fl));
        for (let i = 0; i < sparks.length; i++) sparks[i].visible = Math.sin(t * 42 + i * 7.3) > 0.2;   // crackle
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
