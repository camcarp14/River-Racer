/* Bakes js/data/chicago.js from researched geography.
   River centerlines: real CAWS hydrography (medial-axis of bank polylines, see js/data/chicago.js header).
   Landmarks/bridges: curated tables, positions in WGS84. Run: node tools/bake_data.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ORIGIN = { lat: 41.888, lon: -87.63 };
const M_LAT = 111132;
const M_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);   // ≈ 82,877 m/deg

const X = (lon) => +(((lon - ORIGIN.lon) * M_LON).toFixed(1));
const Z = (lat) => +((-(lat - ORIGIN.lat) * M_LAT).toFixed(1));

// ---------- river centerlines (from CAWS GIS medial-axis extraction) ----------
const MAIN = [[41.8869,-87.6379],[41.887113,-87.636909],[41.88754,-87.636202],[41.88764,-87.635915],[41.887682,-87.635623],[41.887723,-87.634596],[41.88772,-87.633025],[41.887717,-87.631455],[41.887714,-87.629884],[41.887714,-87.629647],[41.88778,-87.628079],[41.887972,-87.627413],[41.888717,-87.626203],[41.88901,-87.625593],[41.889077,-87.625348],[41.889109,-87.623946],[41.889192,-87.622943],[41.889021,-87.621389],[41.88888,-87.620104],[41.888778,-87.618812],[41.88877,-87.617241],[41.888769,-87.616904],[41.888828,-87.615336],[41.888814,-87.614856],[41.88871,-87.614308],[41.888718,-87.612738],[41.88872,-87.6123],[41.88872,-87.61073],[41.88872,-87.6105],[41.88868,-87.609],[41.88865,-87.6079],[41.88862,-87.60717]];
const SOUTH = [[41.854312,-87.639415],[41.854576,-87.639213],[41.854704,-87.639049],[41.855466,-87.637634],[41.855826,-87.637057],[41.856461,-87.636232],[41.856832,-87.635847],[41.857318,-87.635522],[41.85819,-87.635218],[41.85914,-87.634659],[41.859531,-87.634549],[41.860835,-87.634548],[41.862139,-87.634546],[41.863197,-87.634545],[41.864277,-87.634478],[41.865581,-87.634519],[41.866884,-87.634561],[41.868057,-87.634667],[41.868748,-87.634788],[41.869657,-87.634841],[41.870944,-87.635118],[41.872232,-87.635395],[41.873519,-87.635672],[41.87374,-87.635719],[41.874691,-87.63599],[41.875162,-87.636234],[41.875608,-87.636644],[41.876065,-87.636983],[41.876857,-87.637469],[41.87733,-87.637638],[41.878253,-87.637775],[41.879204,-87.638045],[41.8805,-87.638233],[41.881055,-87.638313],[41.88214,-87.638249],[41.883438,-87.638079],[41.884612,-87.637925],[41.88566,-87.637856],[41.886075,-87.638133],[41.886501,-87.638541],[41.8869,-87.6379]];
const NORTH = [[41.896534,-87.644382],[41.895742,-87.64431],[41.895023,-87.644254],[41.894809,-87.644238],[41.894603,-87.644188],[41.89442,-87.644096],[41.894008,-87.6437],[41.893472,-87.643056],[41.892936,-87.642412],[41.892602,-87.642011],[41.892186,-87.641603],[41.891548,-87.641156],[41.890825,-87.640599],[41.890203,-87.640114],[41.889795,-87.639796],[41.889131,-87.639425],[41.888377,-87.639129],[41.887999,-87.638986],[41.887497,-87.638724],[41.88724,-87.63855],[41.8869,-87.6379]];

// half-width profiles (metres) along each channel, by fraction of length.
// widths from GIS: main ~64-71m, mouth basin flares to ~95-135m, then the 24.4m lock chamber.
function widthAt(profile, f) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [f0, w0] = profile[i], [f1, w1] = profile[i + 1];
    if (f >= f0 && f <= f1) return w0 + ((f - f0) / (f1 - f0)) * (w1 - w0);
  }
  return profile[profile.length - 1][1];
}
const W_MAIN = [[0, 30], [0.1, 34], [0.72, 33], [0.82, 44], [0.90, 56], [0.955, 30], [0.975, 12.5], [1, 12.5]];
const W_SOUTH = [[0, 27], [0.15, 26], [0.5, 21], [0.8, 24], [0.93, 30], [1, 29]];
const W_NORTH = [[0, 30], [0.3, 33], [0.62, 27], [0.85, 23], [1, 26]];

function bakePath(latlon, profile) {
  // cumulative length for the width profile
  const pts = latlon.map(([lat, lon]) => [X(lon), Z(lat)]);
  let len = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(len);
  }
  return pts.map((p, i) => [p[0], p[1], +widthAt(profile, cum[i] / len).toFixed(1)]);
}

const mainPath = bakePath(MAIN, W_MAIN);
const southPath = bakePath(SOUTH, W_SOUTH);
const northPath = bakePath(NORTH, W_NORTH);

// ---------- lake guide paths (hand-laid in metres; open water, so width = corridor hint) ----------
const lockEnd = mainPath[mainPath.length - 1];             // ~[1898, -69]
const lakeGuide = [
  [lockEnd[0], lockEnd[1], 14],
  [lockEnd[0] + 130, lockEnd[1] - 6, 40],
  [2250, -120, 70],
  [2620, -160, 80],
  [2980, -175, 80],                                        // toFrac .62 ≈ finish off Navy Pier tip for the sprint
  [3240, -165, 70],                                        // lighthouse gate
  [3330, -300, 60],
  [3280, -480, 60],
  [3060, -580, 60],                                        // rounding the pier tip, clear of its south face
  [2760, -595, 60],
];
// counter-clockwise oval in the harbor: out along the mouth channel line, around the
// lighthouse, back west through the corridor between Navy Pier's south face and the shore
const lakeLoop = [
  [2250, -90, 55],
  [2600, -70, 60],
  [2950, -90, 60],
  [3220, -140, 50],
  [3330, -220, 50],                                        // east of the lighthouse, inside the breakwater
  [3260, -300, 55],
  [2950, -280, 60],
  [2600, -250, 60],
  [2350, -190, 55],
  [2250, -90, 55],
];

// ---------- bridges (approx crossing coords; builder snaps to channel + aligns to tangent) ----------
// kinds: bascule | l (double-deck w/ transit) | deck (fixed high girder) | lift | railraised
const BRIDGES = [
  // Main Stem, west → east
  // lat corrected onto the GIS centerline so the builder snaps to the true crossing (was ~110-150m off)
  { name: 'Franklin–Orleans St', lat: 41.8877, lon: -87.6355, br: 'main', kind: 'bascule', cl: 6.0 },
  { name: 'Wells St', lat: 41.8877, lon: -87.6339, br: 'main', kind: 'l', cl: 5.5 },
  { name: 'LaSalle St', lat: 41.8877, lon: -87.6324, br: 'main', kind: 'bascule', cl: 5.8 },
  { name: 'Clark St', lat: 41.8877, lon: -87.6309, br: 'main', kind: 'bascule', cl: 5.8 },
  { name: 'Dearborn St', lat: 41.8877, lon: -87.6294, br: 'main', kind: 'bascule', cl: 5.8 },
  { name: 'State St', lat: 41.8878, lon: -87.6279, br: 'main', kind: 'bascule', cl: 6.0 },
  { name: 'Wabash Ave', lat: 41.8887, lon: -87.6263, br: 'main', kind: 'bascule', cl: 5.8 },
  { name: 'DuSable / Michigan Ave', lat: 41.8889, lon: -87.6244, br: 'main', kind: 'bascule2', cl: 6.2 },
  { name: 'Columbus Dr', lat: 41.8889, lon: -87.6205, br: 'main', kind: 'bascule', cl: 6.4 },
  { name: 'Lake Shore Dr', lat: 41.8888, lon: -87.6136, br: 'main', kind: 'deck', cl: 9.5 },
  // South Branch, south → north
  { name: 'St. Charles Air Line', lat: 41.8571, lon: -87.6357, br: 'south', kind: 'lift', cl: 6.5 },
  { name: '18th St', lat: 41.8578, lon: -87.6354, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Roosevelt Rd', lat: 41.8672, lon: -87.6346, br: 'south', kind: 'bascule', cl: 6.0 },
  { name: 'Harrison St', lat: 41.8745, lon: -87.6362, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Ida B. Wells Dr', lat: 41.8757, lon: -87.6365, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Van Buren St', lat: 41.8768, lon: -87.6368, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Jackson Blvd', lat: 41.8781, lon: -87.6371, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Adams St', lat: 41.8794, lon: -87.6374, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Monroe St', lat: 41.8807, lon: -87.6377, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Madison St', lat: 41.8820, lon: -87.6379, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Washington St', lat: 41.8834, lon: -87.6380, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Randolph St', lat: 41.8846, lon: -87.6379, br: 'south', kind: 'bascule', cl: 5.8 },
  { name: 'Lake St', lat: 41.8859, lon: -87.6379, br: 'south', kind: 'l', cl: 5.5 },
  // North Branch, north → south
  { name: 'Chicago Ave', lat: 41.8965, lon: -87.6444, br: 'north', kind: 'bascule', cl: 5.8 },
  { name: 'Ohio St', lat: 41.8925, lon: -87.6424, br: 'north', kind: 'deck', cl: 8.0 },
  { name: 'Grand Ave', lat: 41.8912, lon: -87.6416, br: 'north', kind: 'bascule', cl: 5.8 },
  { name: 'Kinzie St rail (raised)', lat: 41.8887, lon: -87.6392, br: 'north', kind: 'railraised', cl: 99 },
  { name: 'Kinzie St', lat: 41.8893, lon: -87.6390, br: 'north', kind: 'bascule', cl: 5.6 },
];

// ---------- landmarks ----------
// kind picks the bespoke builder in js/world/landmarks.js.
// `gx`/`gz` override the lat/lon conversion with hand-reconciled GAME-frame metres. The baked
// river centerlines are a medial-axis extraction that drifts ~50 m east / ~90 m south of WGS84
// at the Wolf Point confluence, so buildings that must sit ON the water's edge are placed
// against RR.River.paths directly rather than through the projection.
const LANDMARKS = [
  // Main Stem — north bank, west → east
  { name: 'Merchandise Mart', lat: 41.8888, lon: -87.6354, kind: 'mart', h: 104, w: 170, d: 90, c: 0xbfae94 },
  { name: 'Reid Murdoch Center', lat: 41.8889, lon: -87.6312, kind: 'reid', h: 34, w: 98, d: 30, c: 0x9c4f33 },
  // real Marina City stands ~15 m off the water over its own marina; the baked lat put it 82 m back
  { name: 'Marina City', lat: 41.8888, lon: -87.6285, gz: -24, kind: 'marina', h: 179, w: 90, d: 33, c: 0xcac4b8 },
  { name: '330 N Wabash', lat: 41.8886, lon: -87.6268, kind: 'boxglass', h: 212, w: 81, d: 42, c: 0x33302a, dark: true },
  { name: 'Trump Tower', lat: 41.8890, lon: -87.6260, kind: 'trump', h: 357, w: 78, d: 40, c: 0x9fb6c4 },
  { name: 'Wrigley Building', lat: 41.8893, lon: -87.6247, kind: 'wrigley', h: 133.5, w: 55, d: 35, c: 0xf1ede0 },
  { name: 'Tribune Tower', lat: 41.8905, lon: -87.6233, kind: 'tribune', h: 141, w: 40, d: 40, c: 0xc9bfa8 },
  { name: '401 N Michigan', lat: 41.8897, lon: -87.6237, kind: 'boxglass', h: 132, w: 55, d: 42, c: 0x8a7e68 },
  { name: 'NBC Tower', lat: 41.8901, lon: -87.6206, kind: 'nbc', h: 191, w: 42, d: 36, c: 0xcdc2a8 },
  { name: 'Lake Point Tower', lat: 41.8917, lon: -87.6134, kind: 'lakepoint', h: 197, w: 50, d: 50, c: 0x3a342a },
  // Main Stem — south bank, west → east
  { name: '333 W Wacker', lat: 41.8863, lon: -87.6370, kind: 'wacker333', h: 147, w: 74, d: 32, c: 0x2e5f57 },
  { name: 'LondonHouse', lat: 41.8877, lon: -87.6248, kind: 'london', h: 90, w: 42, d: 34, c: 0xd9cfb8 },
  { name: '333 N Michigan', lat: 41.8874, lon: -87.6252, kind: 'deco', h: 120.7, w: 22, d: 40, c: 0xb5a88e },
  { name: 'Mather Tower', lat: 41.8873, lon: -87.6260, kind: 'mather', h: 157, w: 20, d: 20, c: 0xd8cdb4 },
  { name: 'Jewelers Building', lat: 41.8868, lon: -87.6265, kind: 'jewelers', h: 159, w: 48, d: 48, c: 0xd3c7ac },
  // 153 m, not 120 — at 120 the green bottle disappears behind its neighbours
  { name: 'Carbide & Carbon', lat: 41.8866, lon: -87.6245, kind: 'deco', h: 153, w: 30, d: 42, c: 0x1c3a2c, gold: true },
  { name: 'Hyatt Regency', lat: 41.8876, lon: -87.6216, kind: 'boxglass', h: 109, w: 90, d: 34, c: 0x5a4a3a, dark: true },
  { name: 'Swissôtel', lat: 41.8877, lon: -87.6196, kind: 'swissotel', h: 140, w: 55, d: 55, c: 0xaebfca },
  { name: 'Aqua Tower', lat: 41.8860, lon: -87.6203, kind: 'aqua', h: 262, w: 60, d: 30, c: 0xdfe5e8 },
  { name: 'St. Regis Chicago', lat: 41.8867, lon: -87.6185, kind: 'stregis', h: 363, w: 68, d: 30, c: 0x5d8a96 },
  // East skyline wall — the Randolph St corridor seen from the lake and the river mouth
  { name: 'Aon Center', lat: 41.8853, lon: -87.6216, kind: 'aon', h: 346, w: 58, d: 58, c: 0xe8e6e0 },
  { name: 'One Prudential Plaza', lat: 41.8858, lon: -87.6244, kind: 'pru1', h: 183, w: 80, d: 30, c: 0xcfc8b4 },
  { name: 'Two Prudential Plaza', lat: 41.8853, lon: -87.6232, kind: 'pru2', h: 275, w: 46, d: 46, c: 0xd8d2c6 },
  { name: 'Blue Cross Blue Shield Tower', lat: 41.8848, lon: -87.6221, kind: 'boxglass', h: 227, w: 70, d: 32, c: 0x4d708c },
  // Streeterville / N Michigan — the wall between the river mouth and the pier root
  { name: 'John Hancock Center', lat: 41.8988, lon: -87.6228, kind: 'hancock', h: 344, w: 80, d: 50, c: 0x1a1d22 },
  { name: 'Onterie Center', lat: 41.8925, lon: -87.6178, kind: 'onterie', h: 174, w: 55, d: 30, c: 0x9a938a },
  { name: 'Lake Shore Place', lat: 41.8935, lon: -87.6141, kind: 'boxstone', h: 104, w: 115, d: 42, c: 0xcabb9e },
  { name: '400 N Lake Shore Dr North', lat: 41.8898, lon: -87.6152, kind: 'boxglass', h: 120, w: 36, d: 30, c: 0xafc3cf },
  { name: '400 N Lake Shore Dr South', lat: 41.8894, lon: -87.6152, kind: 'boxglass', h: 114, w: 36, d: 30, c: 0xafc3cf },
  { name: 'North Pier Apartments', lat: 41.8908, lon: -87.6133, kind: 'boxglass', h: 100, w: 42, d: 34, c: 0x8e9aa4 },
  // South Branch, south → north
  { name: 'River City', lat: 41.8686, lon: -87.6342, kind: 'boxstone', h: 35, w: 120, d: 30, c: 0xb8b2a6 },
  { name: 'Willis Tower', lat: 41.8789, lon: -87.6358, kind: 'willis', h: 442, w: 68, d: 68, c: 0x323842 },
  { name: '311 S Wacker', lat: 41.8774, lon: -87.6366, kind: 'crown311', h: 293, w: 52, d: 52, c: 0xc2a8a0 },
  { name: 'Union Station', lat: 41.8787, lon: -87.6402, kind: 'boxstone', h: 36, w: 100, d: 80, c: 0xcfc5ae },
  { name: 'Civic Opera House', lat: 41.8824, lon: -87.6374, kind: 'opera', h: 169, w: 82, d: 50, c: 0xc8bda6 },
  { name: 'Boeing Building', lat: 41.8843, lon: -87.6390, kind: 'boxglass', h: 137, w: 60, d: 34, c: 0x7f939e },
  { name: '150 N Riverside', lat: 41.8848, lon: -87.6385, kind: 'riverside150', h: 228, w: 54, d: 30, c: 0x39525e },
  { name: 'River Point', lat: 41.8861, lon: -87.6396, kind: 'riverpoint', h: 224, w: 64, d: 30, c: 0x9fc2cf },
  // Old Chicago Main Post Office — the Eisenhower is punched clean through its base
  { name: 'Old Chicago Main Post Office', gx: -690, gz: 1230, kind: 'postoffice', h: 104, w: 100, d: 210, c: 0xc9bea1 },
  // caps the LaSalle St canyon; 9.4 m faceless Ceres on the pyramid
  { name: 'Chicago Board of Trade', gx: -207, gz: 1000, kind: 'bot', h: 184.4, w: 50, d: 50, c: 0xc2b79e },
  // Wolf Point trio — the peninsula NORTH of the Main Stem, east of the North Branch.
  // The old lat/lon put East and Salesforce inside the channel; clampToLand then threw them
  // onto the Loop bank, i.e. the wrong side of the river entirely.
  { name: 'Wolf Point West', gx: -702, gz: -100, kind: 'boxglass', h: 154, w: 40, d: 32, c: 0x93a9b4 },
  { name: 'Wolf Point East', gx: -676, gz: -46, kind: 'wolfsail', h: 210, w: 44, d: 30, c: 0x8fa5b0 },
  { name: 'Salesforce Tower', gx: -666, gz: 52, kind: 'wolfcrown', h: 253, w: 48, d: 36, c: 0xa9bcc4 },
  { name: 'Apparel Center', gx: -600, gz: -110, kind: 'boxstone', h: 76, w: 90, d: 70, c: 0xb8b2a4 },
  { name: 'Fulton House', gx: -800, gz: -60, kind: 'boxstone', h: 50, w: 34, d: 34, c: 0x8c4a33 },
  // North Branch
  { name: 'Old Montgomery Ward', lat: 41.8963, lon: -87.6422, kind: 'boxstone', h: 32, w: 150, d: 40, c: 0xb6ad9c },
  // the printing plant that sits on the Full River Run start line
  { name: 'Tribune Freedom Center', gx: -1367, gz: -900, kind: 'boxstone', h: 22, w: 200, d: 90, c: 0x9aa0a6 },
  // Fulton River District, west bank of the South Branch — the user's office, an unmistakable orange slab
  { name: '111 N Canal (Ovative Group)', lat: 41.8847, lon: -87.6396, kind: 'canal111', h: 96, w: 64, d: 46, c: 0xf26a1c },
  // Loop / Grant Park easter-egg landmarks
  { name: 'Cloud Gate (The Bean)', lat: 41.8827, lon: -87.6233, kind: 'bean', h: 10, w: 20, d: 13, c: 0xd6dbe0 },
  { name: 'Buckingham Fountain', lat: 41.8758, lon: -87.6189, kind: 'fountain', h: 8, w: 40, d: 40, c: 0xc99a8a },
  { name: 'Chicago Theatre', lat: 41.8856, lon: -87.6278, kind: 'marquee', h: 30, w: 22, d: 18, c: 0xc4b8a2 },
];

// ---------- assemble ----------
const lighthouse = { x: X(-87.59058), z: Z(41.88935) };
const pierRoot = { x: X(-87.6042), z: Z(41.8915) };
const pierTip = { x: X(-87.5921), z: Z(41.8921) };

const out = {
  origin: ORIGIN,
  metersPerDeg: { lat: M_LAT, lon: +M_LON.toFixed(1) },
  paths: { north: northPath, south: southPath, main: mainPath, lakeGuide, lakeLoop },
  bridges: BRIDGES.map((b) => ({ name: b.name, x: X(b.lon), z: Z(b.lat), branch: b.br, kind: b.kind, clearance: b.cl })),
  landmarks: LANDMARKS.map((l) => ({
    name: l.name,
    x: l.gx !== undefined ? l.gx : X(l.lon),
    z: l.gz !== undefined ? l.gz : Z(l.lat),
    kind: l.kind,
    h: l.h, w: l.w, d: l.d, c: l.c, dark: !!l.dark, gold: !!l.gold,
  })),
  generic: { seed: 20260715, loopCenter: { x: -140, z: 980 } },
  lake: {
    openWaterX: lockEnd[0] + 34,
    eastX: 4600,
    shoreZNorth: -1050,
    shoreZSouth: 1600,
    lock: { x: lockEnd[0], z: lockEnd[1], len: 183, w: 24.4 },
    navyPier: { root: pierRoot, tip: pierTip, width: 120, wheel: { frac: 0.22, h: 60 } },
    lighthouse,
    breakwaters: [
      { ax: 3450, az: -720, bx: 3450, bz: lighthouse.z - 60 },
      { ax: 3450, az: lighthouse.z + 60, bx: 3450, bz: 900 },
      { ax: 2050, az: 320, bx: 2780, bz: 430 },
    ],
    jardine: { x: X(-87.6005), z: Z(41.8935), w: 220, d: 160 },
  },
};

const header = `/* River Racer — Chicago geography (generated by tools/bake_data.js — edit that, not this).
   River centerlines: medial axis of real CAWS bank-line GIS data (IEPA/USGS segments via
   open-city hydrography), validated against documented bridge crossings; Wolf Point junction
   shared exactly by all three channels. Coordinate frame: metres, +x east, +z south,
   origin ${ORIGIN.lat}, ${ORIGIN.lon}. */\n`;
fs.writeFileSync(path.join(__dirname, '..', 'js', 'data', 'chicago.js'),
  header + 'window.CHICAGO = ' + JSON.stringify(out, null, 1) + ';\n');
console.log('baked js/data/chicago.js',
  '\n main stem pts:', mainPath.length, ' south:', southPath.length, ' north:', northPath.length,
  '\n lock at', lockEnd, '\n pier root', pierRoot, 'tip', pierTip, '\n lighthouse', lighthouse);
