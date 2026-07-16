/* River Racer — procedural vehicle meshes + stat sheets */
(function () {
  const B = {};

  // stats: top (m/s), accel (m/s^2), turn (rad/s @ speed), grip (lateral damping), agility feel
  B.CATALOG = [
    {
      id: 'jetski', name: 'RX BLACKHAWK', kind: 'jetski',
      desc: 'Sport jet ski. Whips around bridge piers like a startled duck. Fragile top end, absurd agility.',
      top: 33, accel: 15.5, turn: 2.35, grip: 3.4, lean: 0.55, boost: 1.22, mass: 0.7,
      hull: 0x1b1e26, deck: 0xff3b30, accent: 0xffc857, seat: 0x22262e,
    },
    {
      id: 'speedboat', name: 'FORMULA 350 GT', kind: 'speedboat',
      desc: 'Offshore V-hull muscle. Monster straight-line pace, needs the whole channel to turn.',
      top: 40, accel: 11.5, turn: 1.35, grip: 2.1, lean: 0.34, boost: 1.18, mass: 1.45,
      hull: 0x10315e, deck: 0xf2f4f6, accent: 0xff3b30, seat: 0x1a1d22,
    },
    {
      id: 'f1', name: 'F1H2O PROTOTYPE', kind: 'f1',
      desc: 'Tunnel-hull race cat. The fastest thing on the river — if you can keep it pointed straight.',
      top: 46, accel: 14.0, turn: 1.75, grip: 2.9, lean: 0.22, boost: 1.25, mass: 0.9,
      hull: 0xffc857, deck: 0x14161c, accent: 0x0f8bd0, seat: 0x14161c,
    },
    {
      id: 'runabout', name: 'LAKESIDE QUEEN ’47', kind: 'runabout',
      desc: 'Varnished mahogany classic. Slowest in class, biggest heart. Style points are a currency.',
      top: 29, accel: 9.0, turn: 1.55, grip: 2.5, lean: 0.30, boost: 1.15, mass: 1.2,
      hull: 0x6e3b1c, deck: 0x8a5224, accent: 0xe8e2d0, seat: 0x7a1f16,
    },
    {
      id: 'rescue', name: 'CFD MARINE 7-1', kind: 'speedboat',
      desc: 'Fire department rigid inflatable. Punchy, planted, and it bounces off seawalls with dignity.',
      top: 36, accel: 13.0, turn: 1.85, grip: 3.0, lean: 0.28, boost: 1.2, mass: 1.35,
      hull: 0xd42a1e, deck: 0x1f242b, accent: 0xf5f6f7, seat: 0x14161c,
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

  function addDriver(group, spec, sitY, sitZ, standing) {
    const g = new THREE.Group();
    const suit = mat(spec.accent, { roughness: 0.7, metalness: 0.05 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.44, 3, 8), suit);
    torso.position.y = 0.62; g.add(torso);
    const vest = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.3, 3, 8), mat(0xf2b21a, { roughness: 0.7 }));
    vest.position.y = 0.66; vest.scale.z = 0.7; g.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(0x2a2d33, { roughness: 0.3 }));
    head.position.y = 1.06; g.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8, -0.6, 1.2, 1.0, 1.1), glassMat());
    visor.position.y = 1.06; g.add(visor);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.4, 2, 6), suit);
      arm.position.set(s * 0.3, 0.72, 0.18);
      arm.rotation.x = standing ? -0.9 : -0.6;
      arm.rotation.z = s * -0.25;
      g.add(arm);
    }
    g.position.set(0, sitY, sitZ);
    g.scale.setScalar(0.95);
    group.add(g);
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
      addDriver(g, spec, 0.95, -0.45, true);
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
      addDriver(g, spec, 1.15, -0.9, false);
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
      addDriver(g, spec, 1.05, -0.3, false);
      navLights(g, 0.95, 2.9, -3.1, 1.02);
      g.userData.size = { r: 2.1, len: 6.6 };
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
