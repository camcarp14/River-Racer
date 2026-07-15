/* River Racer — procedural vehicle meshes + stat sheets */
(function () {
  const B = {};

  // stats: top (m/s), accel (m/s^2), turn (rad/s @ speed), grip (lateral damping), agility feel
  B.CATALOG = [
    {
      id: 'jetski', name: 'RX BLACKHAWK', kind: 'jetski',
      desc: 'Sport jet ski. Whips around bridge piers like a startled duck. Fragile top end, absurd agility.',
      top: 33, accel: 15.5, turn: 2.35, grip: 3.4, lean: 0.55, boost: 1.22,
      hull: 0x1b1e26, deck: 0xff3b30, accent: 0xffc857, seat: 0x22262e,
    },
    {
      id: 'speedboat', name: 'FORMULA 350 GT', kind: 'speedboat',
      desc: 'Offshore V-hull muscle. Monster straight-line pace, needs the whole channel to turn.',
      top: 40, accel: 11.5, turn: 1.35, grip: 2.1, lean: 0.34, boost: 1.18,
      hull: 0x10315e, deck: 0xf2f4f6, accent: 0xff3b30, seat: 0x1a1d22,
    },
    {
      id: 'f1', name: 'F1H2O PROTOTYPE', kind: 'f1',
      desc: 'Tunnel-hull race cat. The fastest thing on the river — if you can keep it pointed straight.',
      top: 46, accel: 14.0, turn: 1.75, grip: 2.9, lean: 0.22, boost: 1.25,
      hull: 0xffc857, deck: 0x14161c, accent: 0x0f8bd0, seat: 0x14161c,
    },
    {
      id: 'runabout', name: 'LAKESIDE QUEEN ’47', kind: 'runabout',
      desc: 'Varnished mahogany classic. Slowest in class, biggest heart. Style points are a currency.',
      top: 29, accel: 9.0, turn: 1.55, grip: 2.5, lean: 0.30, boost: 1.15,
      hull: 0x6e3b1c, deck: 0x8a5224, accent: 0xe8e2d0, seat: 0x7a1f16,
    },
    {
      id: 'rescue', name: 'CFD MARINE 7-1', kind: 'speedboat',
      desc: 'Fire department rigid inflatable. Punchy, planted, and it bounces off seawalls with dignity.',
      top: 36, accel: 13.0, turn: 1.85, grip: 3.0, lean: 0.28, boost: 1.2,
      hull: 0xd42a1e, deck: 0x1f242b, accent: 0xf5f6f7, seat: 0x14161c,
    },
  ];

  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.12 }, opts || {}));
  }
  function glassMat() {
    return new THREE.MeshStandardMaterial({ color: 0x0d1a24, roughness: 0.08, metalness: 0.65, transparent: true, opacity: 0.9 });
  }

  function addDriver(group, spec, sitY, sitZ, standing) {
    const g = new THREE.Group();
    const suit = mat(spec.accent, { roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.44, 3, 8), suit);
    torso.position.y = 0.62; g.add(torso);
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

  const builders = {
    jetski(spec) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 3.1, 1, 1, 3), mat(spec.hull, { roughness: 0.35 }));
      hull.position.y = 0.32;
      // taper the bow
      const p = hull.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        if (z > 0.9) { p.setX(i, p.getX(i) * 0.45); p.setY(i, p.getY(i) * 0.7 + 0.08); }
        if (z < -0.9) p.setX(i, p.getX(i) * 0.85);
      }
      hull.geometry.computeVertexNormals();
      g.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 1.9), mat(spec.deck, { roughness: 0.3 }));
      deck.position.set(0, 0.66, -0.15); g.add(deck);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 1.35), mat(spec.seat, { roughness: 0.85 }));
      seat.position.set(0, 0.86, -0.5); g.add(seat);
      const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), mat(0x333a42, { metalness: 0.6 }));
      bars.rotation.z = Math.PI / 2; bars.position.set(0, 1.06, 0.55); g.add(bars);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.5, 6), mat(0x333a42, { metalness: 0.6 }));
      stem.rotation.x = 0.5; stem.position.set(0, 0.88, 0.42); g.add(stem);
      addDriver(g, spec, 0.95, -0.45, true);
      g.userData.size = { r: 1.4, len: 3.1 };
      return g;
    },

    speedboat(spec) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 7.6, 1, 1, 5), mat(spec.hull, { roughness: 0.25, metalness: 0.2 }));
      hull.position.y = 0.42;
      const p = hull.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i), y = p.getY(i);
        if (z > 2.2) { p.setX(i, p.getX(i) * (1 - (z - 2.2) * 0.24)); p.setY(i, y * 0.75 + 0.15); }
        if (y < -0.3) p.setX(i, p.getX(i) * 0.62);   // V-hull chine
      }
      hull.geometry.computeVertexNormals();
      g.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 6.6), mat(spec.deck, { roughness: 0.35 }));
      deck.position.y = 0.98; g.add(deck);
      // racing stripe
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 6.6), mat(spec.accent, { roughness: 0.3 }));
      stripe.position.y = 1.1; g.add(stripe);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.08), glassMat());
      shield.position.set(0, 1.35, 0.9); shield.rotation.x = -0.42; g.add(shield);
      const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.8), mat(spec.seat, { roughness: 0.9 }));
      cockpit.position.set(0, 1.1, -0.3); g.add(cockpit);
      addDriver(g, spec, 1.05, -0.5, false);
      // outboards
      for (const s of [-0.55, 0.55]) {
        const ob = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.5), mat(0x1a1d22, { roughness: 0.4, metalness: 0.4 }));
        ob.position.set(s, 0.7, -3.85); g.add(ob);
      }
      g.userData.size = { r: 2.4, len: 7.6 };
      return g;
    },

    f1(spec) {
      const g = new THREE.Group();
      // twin sponsons
      for (const s of [-1, 1]) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 4.6, 1, 1, 3), mat(spec.hull, { roughness: 0.3 }));
        sp.position.set(s * 1.05, 0.32, 0.3);
        const p = sp.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > 1.4) p.setY(i, p.getY(i) * 0.6 + 0.1); }
        sp.geometry.computeVertexNormals();
        g.add(sp);
      }
      // center pod
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 5.2, 1, 1, 4), mat(spec.deck, { roughness: 0.35 }));
      pod.position.y = 0.55;
      const pp = pod.geometry.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const z = pp.getZ(i);
        if (z > 1.6) { pp.setX(i, pp.getX(i) * 0.4); pp.setY(i, pp.getY(i) * 0.6 + 0.1); }
      }
      pod.geometry.computeVertexNormals();
      g.add(pod);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glassMat());
      canopy.scale.set(0.85, 0.7, 1.5); canopy.position.set(0, 0.95, -0.4); g.add(canopy);
      // rear wing
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.5), mat(spec.accent, { roughness: 0.3 }));
      wing.position.set(0, 1.15, -2.2); g.add(wing);
      for (const s of [-1.05, 1.05]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.3), mat(0x1a1d22));
        strut.position.set(s, 0.85, -2.2); g.add(strut);
      }
      const num = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), mat(0xffffff));
      num.rotation.x = Math.PI / 2; num.position.set(0, 0.72, 1.9); g.add(num);
      g.userData.size = { r: 2.2, len: 5.4 };
      return g;
    },

    runabout(spec) {
      const g = new THREE.Group();
      const woodTex = RR.U.canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#7a4520'; ctx.fillRect(0, 0, w, h);
        const rng = RR.U.mulberry(4141);
        for (let i = 0; i < 22; i++) {
          ctx.strokeStyle = 'rgba(60,30,10,' + (0.25 + rng() * 0.3) + ')';
          ctx.lineWidth = 1 + rng() * 2;
          ctx.beginPath(); ctx.moveTo(0, i * 6 + rng() * 3);
          ctx.bezierCurveTo(w * 0.3, i * 6 + rng() * 5, w * 0.7, i * 6 - rng() * 5, w, i * 6 + rng() * 3);
          ctx.stroke();
        }
      });
      const wood = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xa86a30, roughness: 0.25, metalness: 0.1 });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.95, 6.4, 1, 1, 4), wood);
      hull.position.y = 0.45;
      const p = hull.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i), y = p.getY(i);
        if (z > 1.8) { p.setX(i, p.getX(i) * (1 - (z - 1.8) * 0.3)); p.setY(i, y * 0.8 + 0.1); }
        if (z < -2.6) p.setX(i, p.getX(i) * 0.8);
        if (y < -0.28) p.setX(i, p.getX(i) * 0.7);
      }
      hull.geometry.computeVertexNormals();
      g.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.14, 6.0), wood);
      deck.position.y = 0.97; g.add(deck);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.06), glassMat());
      shield.position.set(0, 1.28, 0.6); shield.rotation.x = -0.3; g.add(shield);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 0.9), mat(spec.seat, { roughness: 0.9 }));
      bench.position.set(0, 1.02, -0.4); g.add(bench);
      // chrome trim + little flag mast
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.05), mat(0xd8dde2, { metalness: 0.9, roughness: 0.15 }));
      trim.position.set(0, 1.06, 2.6); g.add(trim);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 5), mat(0xd8dde2, { metalness: 0.9, roughness: 0.2 }));
      mast.position.set(0, 1.3, -3.0); g.add(mast);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshBasicMaterial({ color: spec.seat, side: THREE.DoubleSide }));
      flag.position.set(0.2, 1.45, -3.0); g.add(flag);
      addDriver(g, spec, 1.0, -0.35, false);
      g.userData.size = { r: 2.1, len: 6.4 };
      return g;
    },
  };

  // fire boat reuses the speedboat shape with a light bar + inflatable collar
  function buildRescue(spec) {
    const g = builders.speedboat(spec);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.3, 8, 20), mat(0x8f1c14, { roughness: 0.7 }));
    collar.rotation.x = Math.PI / 2; collar.scale.set(1, 2.2, 1); collar.position.y = 0.75;
    g.add(collar);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x2255ff, emissive: 0x2255ff, emissiveIntensity: 1.4, roughness: 0.4 }));
    bar.position.set(0, 1.85, -0.3); g.add(bar);
    const arch = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.1), mat(0xd8dde2, { metalness: 0.7 }));
    arch.position.set(0, 1.75, -0.3); g.add(arch);
    return g;
  }

  B.build = function (spec) {
    const g = spec.id === 'rescue' ? buildRescue(spec) : builders[spec.kind](spec);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  };

  RR.Boats = B;
})();
