/* River Racer — Chicago's public sculpture, all of it welded into ONE merged mesh with ONE
   flat material: the Picasso, Calder's Flamingo, Oldenburg's Bat Column, Chagall's Four Seasons,
   the Marshall Field's clock, the Pillar of Fire on the site of the O'Leary barn, the Museum
   Campus silhouettes, the Merchandise Mart's Hall of Fame busts, and — the one that matters —
   the municipal Y standing on the Wolf Point peninsula, because that Y *is* this river.
   Self-initialising: main.js may not call init(), so the module arms itself on the first frame. */
(function () {
  const S = { tags: [], _armed: false };
  const U = () => RR.U;
  let rng, mesh = null;
  let qTimer = 0, qLow = 0;

  function tint(g, hex, jit) { RR.City.tintGeom(g, hex, jit || 0, rng); return g; }
  const box = (P, w, h, d, x, y, z, hex, ry, jit) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z); P.push(tint(g, hex, jit));
    return g;
  };
  const cyl = (P, rt, rb, h, seg, x, y, z, hex, jit) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(x, y, z); P.push(tint(g, hex, jit));
    return g;
  };
  // a plaza reads as "this is a civic object", and it is what stops a sculpture looking dropped
  function plaza(P, x, z, r, hex) {
    const g = new THREE.CylinderGeometry(r, r, 0.35, 20);
    g.translate(x, RR.City.GROUND_Y - 0.1, z);
    P.push(tint(g, hex, 0.03));
  }

  // city.js fills the Loop on a 96 m block / 22 m street grid, so a sculpture dropped on its
  // true address lands *inside* a filler tower. Snapping to the nearest street intersection
  // moves it under 59 m and puts it exactly where you actually see the Picasso from: looking
  // straight up the Clark St canyon from the water.
  const PITCH = 118, MID = 59;
  function street(x, z) {
    return { x: Math.round((x - MID) / PITCH) * PITCH + MID,
             z: Math.round((z - MID) / PITCH) * PITCH + MID };
  }
  // RR.City.landClearance is a signed distance to water, but the lake basin only contributes
  // when the sample is INSIDE the basin rectangle — from the land side the lake edge is
  // invisible to it, and reads as a thousand metres of dry ground. The Museum Campus stands on
  // exactly that edge, so add the missing distance to the rectangle here.
  function waterClear(x, z) {
    let c = RR.City.landClearance(x, z);
    const R = RR.River;
    if (R.lakeWestX != null) {
      const dx = Math.max(R.lakeWestX - x, x - R.lakeEastX);
      const dz = Math.max(R.lakeShoreZTop - z, z - R.lakeShoreZBot);
      if (dx > 0 || dz > 0) {
        const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
        if (d < c) c = d;
      }
    }
    return c;
  }

  // Which way is dry land? The clearance gradient, snapped to an axis so a group's boxes stay
  // rectangular in its own frame.
  function inlandDir(x, z) {
    const s = 14;
    const gx = waterClear(x + s, z) - waterClear(x - s, z);
    const gz = waterClear(x, z + s) - waterClear(x, z - s);
    return Math.abs(gx) >= Math.abs(gz) ? { x: gx < 0 ? -1 : 1, z: 0 } : { x: 0, z: gz < 0 ? -1 : 1 };
  }

  // A waterside group is laid out in its own frame: u runs ALONG the bank, v runs INLAND from
  // the anchor. `foot` lists every shape the group occupies in that frame — `{u,v,hu,hv}` for a
  // block, `{u,v,r}` for a plaza disc — the offset plaza, the flame and the cow included, not
  // just the mass at the origin. Sampling the whole list is the point: validating one centre
  // point is how a 0.35 m granite disc ended up floating six metres over the South Branch.
  function fits(ax, az, V, foot, margin) {
    const ux = V.z, uz = -V.x;
    const dry = (u, v) => waterClear(ax + ux * u + V.x * v, az + uz * u + V.z * v) >= margin;
    for (const s of foot) {
      if (s.r) {
        if (!dry(s.u, s.v)) return false;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          if (!dry(s.u + Math.cos(a) * s.r, s.v + Math.sin(a) * s.r)) return false;
        }
        continue;
      }
      const su = (s.hu / 2) || 1, sv = (s.hv / 2) || 1;
      for (let du = -s.hu; du <= s.hu + 1e-6; du += su) {
        for (let dv = -s.hv; dv <= s.hv + 1e-6; dv += sv) {
          if (!dry(s.u + du, s.v + dv)) return false;
        }
      }
    }
    return true;
  }

  // Anchor a group. The sites below are hand-verified against the built world; this is the
  // guard that catches it if the bake or the channel ever moves under them, and it will only
  // ever return a spot where the ENTIRE footprint is on dry land.
  function siteAt(x, z, foot) {
    let V = inlandDir(x, z);
    if (!fits(x, z, V, foot, 2)) {
      for (let s = 20; s <= 260; s += 30) {
        let done = false;
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6, px = x + Math.cos(a) * s, pz = z + Math.sin(a) * s;
          const W = inlandDir(px, pz);
          if (fits(px, pz, W, foot, 2)) { x = px; z = pz; V = W; done = true; break; }
        }
        if (done) break;
      }
    }
    const ux = V.z, uz = -V.x;
    return {
      ry: Math.atan2(V.x, V.z),
      px: (u, v) => x + ux * u + V.x * v,
      pz: (u, v) => z + uz * u + V.z * v,
    };
  }

  S.init = function () {
    if (S._armed) return;
    if (!RR.City || !RR.City.mergeGeoms || !RR.River || !RR.River.paths) return;
    S._armed = true;
    rng = U().mulberry(19670815);              // 15 August 1967: the Picasso was unveiled
    const GY = RR.City.GROUND_Y;
    const P = [];

    // ---------- #13 THE PICASSO, Daley Plaza ----------
    // Untitled, 1967. 15.2 m, 162 tons of Cor-Ten. Picasso refused the $100,000 fee and gave it
    // to the city; Chicago hated it and wanted an Ernie Banks statue instead. Now kids slide
    // down the base every single day.
    {
      const sp = street(0, 450), x = sp.x, z = sp.z, CT = 0x8a4a2b, CS = 0x6e3a22;
      plaza(P, x, z, 10.5, 0xb9b2a4);
      box(P, 5.2, 3.6, 3.0, x, GY + 1.8, z, CS, 0, 0.04);                  // base plinth
      // the head: two great curved plates flaring back, with the arching "face" between them
      for (const s of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          const t = k / 4;
          box(P, 0.5, 9.0 - t * 2.4, 2.6, x + s * (1.9 + t * 3.4), GY + 4.2 + (1 - t) * 3.6,
              z - t * 1.4, k % 2 ? CS : CT, s * (0.14 + t * 0.30), 0.05);
        }
        const wing = new THREE.BoxGeometry(0.45, 7.6, 3.4);                // swept side plate
        wing.rotateZ(s * 0.22); wing.rotateY(s * 0.55);
        wing.translate(x + s * 5.6, GY + 7.4, z - 2.0);
        P.push(tint(wing, CT, 0.05));
      }
      box(P, 3.4, 8.4, 1.5, x, GY + 8.0, z + 0.6, CT, 0, 0.03);            // the face
      box(P, 2.2, 1.0, 1.7, x, GY + 11.6, z + 0.9, CS, 0, 0);              // brow
      for (const s of [-1, 1]) box(P, 0.7, 0.7, 0.8, x + s * 0.75, GY + 11.0, z + 1.3, CS, 0, 0);
      box(P, 0.35, 5.6, 0.35, x, GY + 14.6, z + 0.2, CT, 0, 0);            // the two fins on top
      for (const s of [-1, 1]) {
        const fin = new THREE.BoxGeometry(0.3, 4.2, 1.1);
        fin.rotateZ(s * 0.35); fin.translate(x + s * 1.5, GY + 13.4, z - 0.4);
        P.push(tint(fin, CS, 0));
      }
      S.tags.push({ name: 'THE PICASSO', sub: 'UNTITLED · 1967 · 162 TONS OF COR-TEN', x, z, r2: 150 * 150 });
    }

    // ---------- #14 CALDER'S *FLAMINGO*, Federal Plaza ----------
    // 1974. 16 m of arching stabile in Calder red, standing between Mies's black federal boxes:
    // the most photographed piece of colour in the Loop.
    {
      const sp = street(25, 1022), x = sp.x, z = sp.z, CR = 0xdf3e23;      // vermilion, not fire-engine
      plaza(P, x, z, 10.5, 0xb9b2a4);
      const legs = [[0.0, -5.4, 0.55, 0.10], [-4.6, -2.2, 0.62, -0.34],
                    [4.6, -2.6, 0.60, 0.34], [-3.0, 4.4, 0.52, -0.20], [3.4, 4.0, 0.52, 0.20]];
      for (const [lx, lz, th, lean] of legs) {
        const g = new THREE.BoxGeometry(th * 1.9, 12.5, th * 2.6);
        g.rotateZ(-lean * 1.5); g.rotateX(lean * 0.9);
        g.translate(x + lx, GY + 6.0, z + lz);
        P.push(tint(g, CR, 0.03));
      }
      for (let k = 0; k < 9; k++) {                                        // the arch overhead
        const a = (k / 8) * Math.PI;
        box(P, 1.5, 0.85, 2.4, x + Math.cos(a) * 5.2, GY + 12.0 + Math.sin(a) * 3.6,
            z + Math.sin(a) * 1.1 - 0.6, CR, a * 0.5, 0.02);
      }
      box(P, 0.9, 4.6, 2.9, x + 5.6, GY + 13.4, z - 3.2, CR, 0.5, 0);      // the neck sweep
      S.tags.push({ name: 'CALDER’S FLAMINGO', sub: '1974 · 16 M · CALDER RED', x, z, r2: 150 * 150 });
    }

    // ---------- #29 OLDENBURG'S *BAT COLUMN*, 600 W Madison ----------
    // 1977. 30.5 m of grey-painted steel lattice — a baseball bat standing on end outside a
    // federal building. It is absurd, and Chicago loves it.
    {
      const sp = street(-1028, 700), x = sp.x, z = sp.z, GRY = 0x7e838a, H = 30.5;
      plaza(P, x, z, 6.5, 0xb9b2a4);
      cyl(P, 2.4, 2.6, 2.2, 12, x, GY + 1.1, z, 0x5e6369, 0.03);           // the base drum
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const g = new THREE.BoxGeometry(0.16, H, 0.16);
        g.rotateZ(Math.cos(a) * 0.033); g.rotateX(-Math.sin(a) * 0.033);
        g.translate(x + Math.cos(a) * 1.45, GY + 2.2 + H / 2, z + Math.sin(a) * 1.45);
        P.push(tint(g, GRY, 0.04));
      }
      for (let k = 0; k < 40; k++) {                                       // 40 taper rings
        const t = k / 39, r = 1.9 - t * 1.0;
        const g = new THREE.TorusGeometry(r, 0.075, 4, 12);
        g.rotateX(Math.PI / 2); g.translate(x, GY + 2.4 + t * (H - 0.6), z);
        P.push(tint(g, GRY, 0.05));
      }
      S.tags.push({ name: 'BAT COLUMN', sub: 'OLDENBURG · 1977 · 30.5 M OF STEEL LATTICE', x, z, r2: 150 * 150 });
    }

    // ---------- #30 CHAGALL'S *FOUR SEASONS*, Chase Tower Plaza ----------
    // 1974. A 21 m hand-chipped glass mosaic Chagall re-worked on site because he decided
    // Chicago had changed since his sketches.
    {
      const sp = street(0, 700), x = sp.x, z = sp.z;
      box(P, 21.4, 4.3, 3.4, x, GY + 2.15, z, 0x2e5fa8, 0, 0.02);
      box(P, 21.8, 0.5, 3.8, x, GY + 4.5, z, 0xb9b2a4, 0, 0);              // capping course
      const MOS = [0xf2c230, 0xb0322a, 0x3dbb3d, 0xf4f2ec, 0x2e5fa8, 0x7a4fa8];
      for (const s of [-1, 1]) {                                           // hand-chipped tesserae
        for (let cx2 = 0; cx2 < 14; cx2++) for (let cy2 = 0; cy2 < 4; cy2++) {
          if (rng() < 0.34) continue;
          box(P, 1.28, 0.86, 0.1, x - 8.4 + cx2 * 1.42, GY + 0.7 + cy2 * 0.94, z + s * 1.72,
              MOS[(rng() * MOS.length) | 0], 0, 0.16);
        }
      }
      S.tags.push({ name: 'CHAGALL’S FOUR SEASONS', sub: '1974 · RE-WORKED ON SITE · 21 M OF MOSAIC',
        x, z, r2: 130 * 130 });
    }

    // ---------- #32 THE MARSHALL FIELD'S CLOCK ----------
    // 7.75 tons of bronze on the corner at State & Randolph, 1897. Norman Rockwell painted it.
    // Chicagoans still refuse to say "Macy's".
    {
      const sp = street(191, 617), x = sp.x + 9, z = sp.z;
      // the clock needs a building corner to hang off, and a 22 m street crossing has none —
      // so the corner pier comes with it
      box(P, 5, 26, 5, x + 1.6, GY + 13, z, 0x8a7f6b, 0, 0.03);
      box(P, 5.8, 1.0, 5.8, x + 1.6, GY + 26.3, z, 0x6e6558, 0, 0);
      box(P, 2.6, 0.35, 0.35, x - 1.3, GY + 13.4, z, 0x6e5230, 0, 0);      // bracket
      box(P, 0.4, 1.6, 0.4, x - 2.4, GY + 12.7, z, 0x6e5230, 0, 0);
      for (const s of [-1, 1]) {
        const face = new THREE.CylinderGeometry(1.2, 1.2, 0.12, 16);
        face.rotateX(Math.PI / 2); face.translate(x - 2.6, GY + 12.0, z + s * 0.42);
        P.push(tint(face, 0xe8dfc6, 0));
      }
      cyl(P, 1.32, 1.32, 0.75, 16, x - 2.6, GY + 12.0, z, 0x6e5230, 0);    // bronze case
      const crown = new THREE.SphereGeometry(0.5, 8, 6);
      crown.translate(x - 2.6, GY + 13.05, z); P.push(tint(crown, 0x6e5230, 0));
      for (const s of [-1, 1]) {                                           // hands, reading 3:20
        box(P, 0.9, 0.1, 0.05, x - 2.25, GY + 12.0, z + s * 0.5, 0x231f1c, 0, 0);
        box(P, 0.1, 0.7, 0.05, x - 2.6, GY + 11.68, z + s * 0.5, 0x231f1c, 0, 0);
      }
      S.tags.push({ name: 'MEET ME UNDER THE CLOCK', sub: 'MARSHALL FIELD’S · 1897 · 7.75 TONS',
        x, z, r2: 90 * 90 });
    }

    // ---------- #24 PILLAR OF FIRE, the O'Leary site ----------
    // The Great Fire started on 8 October 1871 in the barn behind the O'Leary house on DeKoven
    // St. The cow story was invented by a reporter who later admitted it. The site is the
    // Chicago Fire Academy, and its true address is 500 m back from the channel behind an
    // unbroken wall of riverfront buildings — from a boat, which is the only place this game
    // is ever played from, it does not exist. This is the one open riverside block on the whole
    // South Branch reach: River City's forecourt, plaza and flame hard against the quay, the
    // academy block set behind them.
    {
      const FOOT = [
        { u: 0, v: 20, r: 9.5 },                // plaza + flame
        { u: -13, v: 16, hu: 2.5, hv: 2.5 },    // cow
        { u: 0, v: 48, hu: 23.5, hv: 13.5 },    // academy block + parapet
        { u: -18, v: 34, hu: 6, hv: 3 },        // apparatus bay
      ];
      const F = siteAt(-372, 2085, FOOT);
      box(P, 46, 9, 26, F.px(0, 48), GY + 4.5, F.pz(0, 48), 0x9c4f33, F.ry, 0.03);   // academy block
      box(P, 47, 0.7, 27, F.px(0, 48), GY + 9.3, F.pz(0, 48), 0x6e5f52, F.ry, 0);    // parapet
      box(P, 12, 4.2, 6, F.px(-18, 34), GY + 2.1, F.pz(-18, 34), 0x8a4636, F.ry, 0.03);  // apparatus bay
      plaza(P, F.px(0, 20), F.pz(0, 20), 9, 0xb9b2a4);
      for (const s of [0, 1, 2]) {                                         // three twisting blades
        const a0 = s * 2.09;
        for (let k = 0; k < 7; k++) {
          const t = k / 6, r = 1.6 - t * 1.4, a = a0 + t * 1.5;
          const bu = Math.cos(a) * r, bv = 20 + Math.sin(a) * r;
          box(P, 1.5 - t * 1.1, 1.6, 0.7 - t * 0.4,
              F.px(bu, bv), GY + 1.0 + t * 8.0, F.pz(bu, bv), 0x7a5a2e, F.ry + a, 0.05);
        }
      }
      {                                                                    // and one cow
        const cu = -13, cv = 16;
        box(P, 1.1, 1.2, 2.4, F.px(cu, cv), GY + 1.35, F.pz(cu, cv), 0xe8e4da, F.ry + 0.4, 0.03);
        box(P, 1.0, 0.9, 1.0, F.px(cu + 0.9, cv + 0.9), GY + 1.7, F.pz(cu + 0.9, cv + 0.9),
            0x3a2e26, F.ry + 0.4, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          cyl(P, 0.11, 0.11, 0.85, 5, F.px(cu + sx * 0.4, cv + sz * 0.85), GY + 0.42,
              F.pz(cu + sx * 0.4, cv + sz * 0.85), 0x3a2e26, 0);
        }
      }
      S.tags.push({ name: 'WHERE IT STARTED · 1871', sub: 'DeKOVEN ST · THE COW WAS A REPORTER’S INVENTION',
        x: F.px(0, 20), z: F.pz(0, 20), r2: 200 * 200 });
    }

    // ---------- #25 MUSEUM CAMPUS: Field, Shedd, Adler ----------
    // Far-shore silhouettes off the Lake Michigan Circuit — and Sue, the most complete T. rex
    // ever found, 12.3 m of her, inside the Field. The real campus stands on landfill 2.4 km
    // south of the river mouth; the modelled lake basin stops at z 1600, so the three of them
    // are strung north-to-south along the empty lakefront band inside it, long faces and
    // colonnade turned to the water. Their true coordinates are 1.4 km inland of any modelled
    // water and land squarely in the Loop's filler grid — a cream box between two red towers,
    // which is the opposite of a lakefront silhouette.
    {
      const FU = -190, FV = 52, SU = 0, SV = 44, AU = 205, AV = 36;
      const FOOT = [
        { u: FU, v: FV, hu: 52, hv: 24 },        // Field mass + cornice
        { u: FU, v: FV - 25, hu: 41, hv: 3 },    // Field colonnade, pediment, SUE banner
        { u: SU, v: SV, hu: 32, hv: 20 },        // Shedd + octagonal roof
        { u: AU, v: AV, hu: 20, hv: 20 },        // Adler + dome
      ];
      const F = siteAt(1906, 1270, FOOT);
      const fx = (u, v) => F.px(FU + u, FV + v), fz = (u, v) => F.pz(FU + u, FV + v);
      box(P, 100, 26, 46, fx(0, 0), GY + 13, fz(0, 0), 0xe4e0d2, F.ry, 0.02);   // Field: neoclassical mass
      box(P, 62, 12, 30, fx(0, 0), GY + 32, fz(0, 0), 0xe4e0d2, F.ry, 0.02);
      box(P, 104, 1.6, 48, fx(0, 0), GY + 26.8, fz(0, 0), 0xd8d2c2, F.ry, 0);   // cornice
      for (let k = 0; k < 14; k++) {                                       // the colonnade
        cyl(P, 1.15, 1.3, 14, 8, fx(-39 + k * 6, -24.5), GY + 7, fz(-39 + k * 6, -24.5), 0xeeeade, 0.02);
      }
      box(P, 46, 12, 3, fx(0, -24), GY + 34, fz(0, -24), 0xd0cbbc, F.ry, 0);    // pediment block
      box(P, 16, 4.2, 0.6, fx(-26, -25.5), GY + 20, fz(-26, -25.5), 0x1b3a6b, F.ry, 0);  // the SUE banner
      box(P, 14, 2.4, 0.7, fx(-26, -25.9), GY + 20, fz(-26, -25.9), 0xf2c230, F.ry, 0);
      const sx = (u, v) => F.px(SU + u, SV + v), sz = (u, v) => F.pz(SU + u, SV + v);
      box(P, 64, 20, 40, sx(0, 0), GY + 10, sz(0, 0), 0xe8e4da, F.ry, 0.02);    // Shedd
      for (let k = 0; k < 8; k++) {                                        // octagonal roof
        const a = (k / 8) * Math.PI * 2, ru = Math.cos(a) * 9, rv = Math.sin(a) * 9;
        box(P, 17, 1.2, 9, sx(ru, rv), GY + 22 + Math.abs(Math.cos(a * 2)) * 1.2,
            sz(ru, rv), 0x8fa8a0, F.ry + a, 0.03);
      }
      cyl(P, 0.5, 4.0, 7, 8, sx(0, 0), GY + 24, sz(0, 0), 0x8fa8a0, 0);
      const ax = F.px(AU, AV), az = F.pz(AU, AV);
      box(P, 40, 14, 40, ax, GY + 7, az, 0x2a2a2e, F.ry, 0.03);           // Adler
      const dome = new THREE.SphereGeometry(11, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(ax, GY + 14, az); P.push(tint(dome, 0x2a2a2e, 0.02));
      cyl(P, 0.16, 0.16, 4.5, 5, ax, GY + 27, az, 0x9aa0a6, 0);
      S.tags.push({ name: 'MUSEUM CAMPUS', sub: 'FIELD · SHEDD · ADLER · SUE IS 12.3 M LONG',
        x: sx(0, 0), z: sz(0, 0), r2: 420 * 420 });
    }

    // ---------- #17 MERCHANDISE MART HALL OF FAME ----------
    // Eight four-times-life-size bronze busts on 6 m granite columns along the river esplanade,
    // installed 1953. They stare at you from the bank and almost nobody knows who they are.
    {
      for (let k = 0; k < 8; k++) {
        const x = -530 + k * 23, z = -40;
        cyl(P, 0.9, 1.0, 6, 12, x, GY + 3, z, 0xb9b2a4, 0.03);
        cyl(P, 1.25, 1.25, 0.4, 12, x, GY + 6.2, z, 0xa9a396, 0);          // capital
        const b = new THREE.SphereGeometry(1.1, 9, 7);
        b.scale(1, 1.3, 1); b.translate(x, GY + 7.7, z);
        P.push(tint(b, k % 3 === 1 ? 0x5f8a76 : 0x6e5230, 0.06));          // verdigris streaking
        box(P, 1.9, 0.9, 1.4, x, GY + 6.9, z, 0x6e5230, 0, 0.05);          // shoulders
      }
      S.tags.push({ name: 'THE MART — HALL OF FAME', sub: 'EIGHT MERCHANTS IN BRONZE · 1953',
        x: -450, z: -40, r2: 150 * 150 });
    }

    // ---------- #6a THE MUNICIPAL Y, Wolf Point ----------
    // The Y carved on hundreds of Chicago buildings, bridges and lamp posts is the three
    // branches of this river meeting at Wolf Point. It is the first thing you see on the start
    // line, and for this game there is no better symbol in the city.
    {
      // back from the literal tip: at (-664, 78) the 6.5 m plaza rim overhung the point by 2.6 m
      const Y = siteAt(-642, 74, [{ u: 0, v: 0, r: 7 }]);
      const x = Y.px(0, 0), z = Y.pz(0, 0), BR = 0x8c6a2f;
      plaza(P, x, z, 6.5, 0xb9b2a4);
      box(P, 1.5, 5.4, 1.5, x, GY + 2.7, z, BR, 0, 0.02);                  // the stem
      for (const s of [-1, 1]) {
        const arm = new THREE.BoxGeometry(1.4, 8.4, 1.4);
        arm.rotateZ(-s * 0.46);
        arm.translate(x + s * 2.3, GY + 8.6, z);
        P.push(tint(arm, BR, 0.02));
      }
      box(P, 3.2, 0.6, 3.2, x, GY + 0.3, z, 0x6e5230, 0, 0);               // bronze base pad
      if (RR.Theme && RR.Theme.addLamp) {
        RR.Theme.addLamp(x, GY + 0.9, z + 2.6, 0xffd27f);
        RR.Theme.addLamp(x, GY + 0.9, z - 2.6, 0xffd27f);
      }
      S.tags.push({ name: 'THE MUNICIPAL Y', sub: 'THREE BRANCHES · ONE RIVER · WOLF POINT',
        x, z, r2: 140 * 140 });
    }

    mesh = new THREE.Mesh(RR.City.mergeGeoms(P), RR.City.flatMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    RR.Engine.scene.add(mesh);
    S.mesh = mesh;
  };

  // Degradation hook. There is no numbered autoQuality tier in the engine, so this uses the
  // only honest signal it has: a sustained frame rate low enough that the engine has already
  // shed post and reflections. Below that, one static mesh of civic bronze is not the priority.
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

  RR.Sculpture = S;
})();
