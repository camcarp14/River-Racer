/* River Racer — every hand-lettered sign in the city on ONE 1024² canvas atlas (16 cells at
   256²), ONE MeshBasicMaterial and ONE draw call: the Billy Goat, Malört, NO KETCHUP, Mr Beef,
   the Tribune blackletter, Garrett / Vienna Beef / Portillo's, the Green Mill, Chess Records,
   Frankie Knuckles Way, the deep-dish-versus-tavern-cut argument being shouted across the
   water, and the bronze panel that explains why the river runs the wrong way.
   Self-initialising: main.js may not call init(), so the module arms itself on the first frame. */
(function () {
  const S = { tags: [], _armed: false };
  const U = () => RR.U;
  let mesh = null, qTimer = 0, qLow = 0;

  // ---------- the atlas ----------
  // Each cell is painted into a band matching its sign's real aspect ratio and the UVs address
  // only that band, so nothing is stretched and no letter comes out squashed.
  const AR = [3.1, 1.46, 2.0, 2.5, 5.3, 6.7, 2.9, 2.9, 2.9, 1.5, 2.5, 2.5, 4.3, 2.5, 2.5, 2.0];
  const band = (i) => Math.max(40, Math.min(256, Math.round(256 / AR[i])));

  function fitText(c, txt, cx, cy, maxW, px, font, fill) {
    c.fillStyle = fill;
    let size = px;
    do { c.font = 'bold ' + size + 'px ' + font; size -= 1; }
    while (size > 7 && c.measureText(txt).width > maxW);
    c.fillText(txt, cx, cy);
  }

  const PAINT = [
    // 0 — Billy Goat Tavern. Belushi's "cheezborger", and the Curse of the Billy Goat: William
    // Sianis and his goat Murphy thrown out of the 1945 World Series, 71 years of Cubs misery.
    (c, W, H) => {
      c.fillStyle = '#7a1f1a'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#f1efe8'; c.lineWidth = 3; c.strokeRect(4, 4, W - 8, H - 8);
      c.fillStyle = '#f1efe8';                                  // goat silhouette
      c.beginPath(); c.ellipse(36, H * 0.42, 17, 10, 0, 0, 6.3); c.fill();
      c.beginPath(); c.ellipse(52, H * 0.30, 8, 6, 0.4, 0, 6.3); c.fill();
      c.beginPath(); c.moveTo(54, H * 0.24); c.lineTo(64, H * 0.08); c.lineTo(57, H * 0.24); c.fill();
      c.fillRect(28, H * 0.5, 4, H * 0.2); c.fillRect(42, H * 0.5, 4, H * 0.2);
      fitText(c, 'BILLY GOAT', 156, H * 0.30, 176, 34, 'Arial, sans-serif', '#f1efe8');
      fitText(c, 'TAVERN', 156, H * 0.56, 176, 34, 'Arial, sans-serif', '#f1efe8');
      fitText(c, 'NO FRIES — CHEEPS', 128, H * 0.80, 228, 17, 'Arial, sans-serif', '#f2d024');
      fitText(c, 'NO PEPSI — COKE', 128, H * 0.93, 228, 17, 'Arial, sans-serif', '#f2d024');
    },
    // 1 — Malört. Wormwood liqueur that tastes like a burning tyre; the "Malört face" is a
    // Chicago initiation. Yellow on black, and unmistakable.
    (c, W, H) => {
      c.fillStyle = '#101014'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#f2d024'; c.lineWidth = 4; c.strokeRect(7, 7, W - 14, H - 14);
      fitText(c, 'JEPPSON’S', W / 2, H * 0.26, 190, 26, 'Georgia, serif', '#f2d024');
      fitText(c, 'MALÖRT', W / 2, H * 0.55, 208, 58, 'Georgia, serif', '#f2d024');
      fitText(c, 'YOU’RE WELCOME', W / 2, H * 0.84, 198, 20, 'Arial, sans-serif', '#c9a227');
    },
    // 2 — the only rule of a Chicago dog.
    (c, W, H) => {
      c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#c4382e'; c.fillRect(0, 0, W, 12); c.fillRect(0, H - 12, W, 12);
      fitText(c, 'NO KETCHUP.', W / 2, H * 0.42, 218, 52, 'Georgia, serif', '#231f1c');
      fitText(c, 'DRAGGED THROUGH THE GARDEN', W / 2, H * 0.75, 226, 16, 'Arial, sans-serif', '#5c5a55');
    },
    // 3 — Mr. Beef on Orleans, the real exterior of The Bear's "Original Beef of Chicagoland".
    (c, W, H) => {
      c.fillStyle = '#d8d2c4'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#b0322a';
      for (let k = 0; k < 8; k++) if (k % 2) c.fillRect(k * (W / 8), 0, W / 8, 16);
      fitText(c, 'ITALIAN BEEF', W / 2, H * 0.44, 222, 44, 'Georgia, serif', '#8a1f1a');
      fitText(c, 'DIPPED · HOT · SWEET', W / 2, H * 0.76, 222, 22, 'Arial, sans-serif', '#3a352e');
    },
    // 4 — carved into the Tribune Tower's river face. WGN = World's Greatest Newspaper.
    (c, W, H) => {
      c.fillStyle = '#d6cdb8'; c.fillRect(0, 0, W, H);
      fitText(c, 'Tribune Tower', W / 2, H * 0.54, 234, 44, 'Georgia, serif', '#a2977c');
    },
    // 5 — the rooftop masthead on the Freedom Center: the first thing you see on the Full River Run.
    (c, W, H) => {
      c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, W, H);
      fitText(c, 'Chicago Tribune', W / 2, H * 0.54, 238, 40, 'Georgia, serif', '#f1efe8');
    },
    // 6 — Garrett's caramel-cheddar "Chicago Mix" and the line around the block.
    (c, W, H) => {
      c.fillStyle = '#0e3a2c'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#f2c230'; c.lineWidth = 3; c.strokeRect(5, 5, W - 10, H - 10);
      fitText(c, 'GARRETT', W / 2, H * 0.38, 208, 40, 'Georgia, serif', '#f2c230');
      fitText(c, 'POPCORN · CHICAGO MIX', W / 2, H * 0.74, 218, 18, 'Arial, sans-serif', '#f1efe8');
    },
    // 7 — Vienna Beef, in Chicago since the 1893 World's Fair.
    (c, W, H) => {
      c.fillStyle = '#b0322a'; c.fillRect(0, 0, W, H);
      fitText(c, 'VIENNA BEEF', W / 2, H * 0.38, 222, 40, 'Georgia, serif', '#f4f2ec');
      fitText(c, 'SINCE 1893', W / 2, H * 0.74, 198, 22, 'Arial, sans-serif', '#f2c230');
    },
    // 8 — Portillo's, and the chocolate cake shake.
    (c, W, H) => {
      c.fillStyle = '#b0322a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#8a1f1a'; c.fillRect(0, H * 0.62, W, H * 0.38);
      fitText(c, 'Portillo’s', W / 2, H * 0.34, 212, 46, 'Georgia, serif', '#f2c230');
      fitText(c, 'CHOCOLATE CAKE SHAKE', W / 2, H * 0.80, 222, 17, 'Arial, sans-serif', '#f4f2ec');
    },
    // 9 — the Green Mill, 1907. Capone's booth is still there, and so is the trapdoor.
    (c, W, H) => {
      c.fillStyle = '#0b1410'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#2ed47a'; c.lineWidth = 5; c.strokeRect(9, 9, W - 18, H - 18);
      c.save(); c.translate(W / 2, H * 0.30); c.lineWidth = 6;    // the windmill
      for (let k = 0; k < 4; k++) {
        c.rotate(Math.PI / 2);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -H * 0.19); c.stroke();
      }
      c.restore();
      fitText(c, 'GREEN MILL', W / 2, H * 0.62, 208, 34, 'Georgia, serif', '#2ed47a');
      fitText(c, 'JAZZ NIGHTLY', W / 2, H * 0.85, 178, 18, 'Arial, sans-serif', '#7fe8ae');
    },
    // 10 — 2120 S Michigan: Chess Records. Muddy, Wolf, Chuck Berry, Etta James. The Rolling
    // Stones recorded there and named a song after the address.
    (c, W, H) => {
      c.fillStyle = '#141418'; c.fillRect(0, 0, W, H);
      fitText(c, '2120 S MICHIGAN', W / 2, H * 0.36, 230, 34, 'Arial, sans-serif', '#f2c230');
      fitText(c, 'CHESS RECORDS', W / 2, H * 0.74, 208, 24, 'Georgia, serif', '#c9a227');
    },
    // 11 — Buddy Guy still plays a January residency at Legends.
    (c, W, H) => {
      c.fillStyle = '#141418'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2e5fa8';                                    // the polka-dot Strat
      c.beginPath(); c.ellipse(42, H * 0.5, 24, 15, -0.3, 0, 6.3); c.fill();
      c.fillStyle = '#f4f2ec';
      for (const d of [[32, 0.42], [48, 0.44], [40, 0.60], [52, 0.58]]) {
        c.beginPath(); c.arc(d[0], H * d[1], 3.2, 0, 6.3); c.fill();
      }
      c.fillStyle = '#c9a227'; c.fillRect(60, H * 0.47, 44, 5);
      fitText(c, 'BUDDY GUY’S', 172, H * 0.36, 148, 26, 'Arial, sans-serif', '#f2c230');
      fitText(c, 'LEGENDS', 172, H * 0.72, 148, 30, 'Georgia, serif', '#f4f2ec');
    },
    // 12 — Jefferson between Adams and Jackson is honorary Frankie Knuckles Way. Chicago's
    // honorary blades are BROWN, not street green, and house music is named after his club.
    // …and the same cell's unused lower band carries the Lower Wacker blade, in Chicago's
    // real street green. Two blades, one 256² cell.
    (c, W, H) => {
      c.fillStyle = '#5a3a22'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#f4f2ec'; c.lineWidth = 4; c.strokeRect(6, 6, W - 12, H - 12);
      fitText(c, 'FRANKIE KNUCKLES WAY', W / 2, H * 0.52, 222, 30, 'Arial, sans-serif', '#f4f2ec');
      c.fillStyle = '#0f4a34'; c.fillRect(0, H + 6, W, H);
      c.strokeStyle = '#f4f2ec'; c.lineWidth = 4; c.strokeRect(6, H + 12, W - 12, H - 12);
      fitText(c, 'LOWER WACKER DR', W / 2, H * 1.55, 222, 32, 'Arial, sans-serif', '#f4f2ec');
    },
    // 13 & 14 — the argument, shouted across the water. Pizzeria Uno invented deep dish in
    // 1943; actual Chicagoans mostly eat tavern-style thin crust cut into squares.
    (c, W, H) => {
      c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#c4382e'; c.fillRect(0, 0, W, H * 0.22);
      fitText(c, 'DEEP DISH', W / 2, H * 0.12, 218, 30, 'Georgia, serif', '#f4f1e6');
      fitText(c, 'SINCE 1943', W / 2, H * 0.48, 218, 44, 'Georgia, serif', '#8a1f1a');
      fitText(c, 'ACCEPT NO IMITATION', W / 2, H * 0.81, 224, 18, 'Arial, sans-serif', '#3a352e');
    },
    (c, W, H) => {
      c.fillStyle = '#1b3a6b'; c.fillRect(0, 0, W, H);
      fitText(c, 'TAVERN CUT', W / 2, H * 0.32, 224, 42, 'Georgia, serif', '#f4f2ec');
      fitText(c, 'SQUARES ONLY', W / 2, H * 0.65, 224, 34, 'Arial, sans-serif', '#f2c230');
      fitText(c, 'ASK ANYONE FROM HERE', W / 2, H * 0.89, 224, 15, 'Arial, sans-serif', '#b3ddf2');
    },
    // 15 — the bronze interpretive panel near Wolf Point. 1900, and Marquette and Jolliet's
    // 1673 portage, which is the only reason there is a city here at all.
    (c, W, H) => {
      c.fillStyle = '#7a5a2e'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#5e451f'; c.lineWidth = 6; c.strokeRect(8, 8, W - 16, H - 16);
      fitText(c, 'THE RIVER RAN', W / 2, H * 0.30, 208, 30, 'Georgia, serif', '#e8dfc6');
      fitText(c, 'THE OTHER WAY', W / 2, H * 0.54, 208, 30, 'Georgia, serif', '#e8dfc6');
      fitText(c, 'UNTIL 1900', W / 2, H * 0.80, 178, 26, 'Georgia, serif', '#c9a227');
    },
  ];

  // ---------- placement ----------
  // sd: +1 = right of downstream (the south / east bank), -1 = left. Given explicitly wherever
  // CHICAGO names the bank, because the baked medial-axis centreline wanders off the true river.
  const SIGNS = [
    { c: 0, x: 492, z: -168, y: 3.4, w: 5.0, h: 1.6, off: 8.0, sd: -1,
      tag: 'BILLY GOAT TAVERN', sub: 'LOWER LEVEL · THE CURSE OF THE BILLY GOAT · 1945' },
    { c: 1, x: -260, z: 74, y: 8.5, w: 3.5, h: 2.4, off: 9.5, sd: 1,
      tag: 'MALÖRT — YOU’RE WELCOME', sub: 'WORMWOOD · THE MALÖRT FACE IS AN INITIATION' },
    { c: 2, x: 112, z: 65, y: 3.0, w: 1.7, h: 0.85, off: 3.9, sd: 1 },
    { c: 3, x: -589, z: -547, y: 4.2, w: 4.0, h: 1.6, off: 8.0, sd: 1,
      tag: 'ITALIAN BEEF — DIPPED', sub: '666 N ORLEANS · EAT IT IN THE CHICAGO LEAN' },
    { c: 4, abs: true, x: 555.2, z: -257.6, y: 18, w: 16, h: 3.0,
      tag: 'TRIBUNE TOWER', sub: 'WGN — WORLD’S GREATEST NEWSPAPER' },
    { c: 5, abs: true, x: -1367, z: -855, y: 31, w: 40, h: 6.0 },
    { c: 6, x: -30, z: 74, y: 3.4, w: 4.0, h: 1.4, off: 9.3, sd: 1 },
    { c: 7, x: 210, z: 74, y: 3.4, w: 4.0, h: 1.4, off: 9.3, sd: 1 },
    { c: 8, x: 400, z: 74, y: 3.4, w: 4.0, h: 1.4, off: 9.3, sd: 1 },
    { c: 9, x: -1120, z: -700, y: 9.0, w: 3.0, h: 2.0, off: 9.5, sd: 1,
      tag: 'THE GREEN MILL', sub: '1907 · CAPONE’S BOOTH · THE TRAPDOOR IS REAL' },
    { c: 10, x: -350, z: 2900, y: 7.6, w: 4.0, h: 1.6, off: 9.5, sd: 1,
      tag: 'CHESS RECORDS', sub: '2120 S MICHIGAN · MUDDY, WOLF, ETTA, THE STONES' },
    { c: 11, x: -330, z: 1500, y: 7.6, w: 4.0, h: 1.6, off: 9.5, sd: 1 },
    { c: 12, x: -994, z: 1000, y: 8.2, w: 2.6, h: 0.6, off: 9.5, sd: 1,
      tag: 'FRANKIE KNUCKLES WAY', sub: 'THE WAREHOUSE · 1977 · HOUSE IS NAMED FOR THE CLUB' },
    { c: 13, x: -270, z: -14, y: 3.4, w: 3.5, h: 1.4, off: 8.6, sd: -1,
      tag: 'DEEP DISH vs TAVERN CUT', sub: 'THEY ARE SHOUTING ACROSS THE WATER' },
    { c: 14, x: -250, z: 74, y: 3.4, w: 3.5, h: 1.4, off: 8.6, sd: 1 },
    { c: 15, x: -600, z: 140, y: 2.4, w: 2.4, h: 1.2, off: 2.6, sd: 1,
      tag: 'THE REVERSAL · 1900', sub: 'MARQUETTE AND JOLLIET PORTAGED HERE IN 1673' },
    // the three Lower Wacker portal blades, sharing cell 12's lower band
    { c: 12, y0: 66, hp: 60, x: -140, z: 74, y: 5.75, w: 2.6, h: 0.6, off: 7.3, sd: 1,
      tag: 'LOWER WACKER DR', sub: 'GOTHAM’S TUNNELS · THE BLUESMOBILE LIVED DOWN THERE' },
    { c: 12, y0: 66, hp: 60, x: 120, z: 74, y: 5.75, w: 2.6, h: 0.6, off: 7.3, sd: 1 },
    { c: 12, y0: 66, hp: 60, x: 380, z: 74, y: 5.75, w: 2.6, h: 0.6, off: 7.3, sd: 1 },
  ];

  function nearestPath(x, z) {
    let best = null, bd = Infinity;
    for (const key in RR.River.paths) {
      if (key.indexOf('lake') === 0) continue;
      const q = U().pathNearest(RR.River.paths[key], x, z);
      if (q.dist < bd) { bd = q.dist; best = q; }
    }
    return best;
  }

  S.init = function () {
    if (S._armed) return;
    if (!RR.City || !RR.City.mergeGeoms || !RR.River || !RR.River.paths) return;
    S._armed = true;

    const tex = U().canvasTexture(1024, 1024, (c, W, H) => {
      c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < PAINT.length; i++) {
        const col = i % 4, row = (i / 4) | 0, hp = band(i);
        c.save();
        c.beginPath(); c.rect(col * 256, row * 256, 256, 256); c.clip();
        c.translate(col * 256, row * 256);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        PAINT[i](c, 256, hp);
        c.restore();
      }
    });
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;

    const geoms = [];
    for (const s of SIGNS) {
      let px = s.x, pz = s.z, yaw = 0;
      const q = nearestPath(s.x, s.z);
      if (!q) continue;
      if (s.abs) {
        yaw = Math.atan2(q.x - s.x, q.z - s.z);                       // +z faces the channel
      } else {
        const nx = -q.tz, nz = q.tx;                                  // right of downstream
        const sd = s.sd || (((s.x - q.x) * nx + (s.z - q.z) * nz) >= 0 ? 1 : -1);
        px = q.x + nx * (q.w + s.off) * sd;
        pz = q.z + nz * (q.w + s.off) * sd;
        yaw = Math.atan2(-nx * sd, -nz * sd);
      }
      const g = new THREE.PlaneGeometry(s.w, s.h);
      const col = s.c % 4, row = (s.c / 4) | 0;
      const y0 = s.y0 || 0, hp = s.hp || band(s.c);
      const u0 = col / 4, u1 = (col + 1) / 4;
      const v0 = 1 - (row * 256 + y0 + hp) / 1024, v1 = 1 - (row * 256 + y0) / 1024;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      }
      g.rotateY(yaw); g.translate(px, s.y, pz);
      geoms.push(g);
      if (s.tag) S.tags.push({ name: s.tag, sub: s.sub || '', x: px, z: pz, r2: 70 * 70 });
    }
    if (!geoms.length) return;
    mesh = new THREE.Mesh(RR.City.mergeGeoms(geoms), new THREE.MeshBasicMaterial({
      map: tex, side: THREE.DoubleSide, fog: true,
    }));
    mesh.renderOrder = 1;
    RR.Engine.scene.add(mesh);
    S.mesh = mesh;
  };

  // Degradation hook. The engine has no numbered autoQuality tier, so this uses the only honest
  // signal available: a frame rate low enough that post, reflections and shadows have already
  // been shed. Below that, sixteen sign quads are not what is costing the frame.
  RR.Engine.onUpdate(function arm(dt) {
    S.init();
    if (!mesh) return;
    qTimer += dt;
    if (qTimer < 1.5) return;
    qTimer = 0;
    if (!RR.Engine.autoQuality) { mesh.visible = true; return; }
    const f = RR.Engine.fps();
    qLow = f < 24 ? qLow + 1 : 0;
    if (qLow >= 3) mesh.visible = false;
    else if (f > 40) mesh.visible = true;
  });

  RR.Signs = S;
})();
