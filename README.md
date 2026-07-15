# River Racer — Chicago

Arcade boat racing down the **real Chicago River** and out into **Lake Michigan**, in your browser. No install, no server, no network — pure WebGL.

![River Racer](shots/hero.png)

## Play

**Easiest:** download [`play/RiverRacer.html`](play/RiverRacer.html) and double-click it. The entire game — engine, city, audio, three.js — lives in that one file.

**From the repo:** open `index.html` in any browser.

Runs at 60 fps on any ordinary machine with a GPU — the renderer scales resolution dynamically to hold frame rate, and the whole city draws in a few dozen draw calls.

## The map is real

The river isn't game-designer squiggle — the three channels are **medial-axis centerlines extracted from real GIS hydrography** of the Chicago Area Waterway System (IEPA/USGS bank-line data), with channel widths measured from the same survey. All three branches meet at the true Wolf Point junction, and the Main Stem jogs north at Trump Tower exactly like the real river does.

Along the banks, modeled from their actual footprints and heights:

- **Marina City** corncobs, **Willis Tower**'s nine stepped tubes, **Trump Tower**, the **Wrigley Building** clock tower, **Tribune Tower**'s gothic crown, **Merchandise Mart**, **333 W Wacker**'s curved green glass at the bend, **St. Regis**, **Aqua**, the **Jewelers Building** cupolas, **Civic Opera House**, **150 N Riverside** on its impossible base, **River Point**, **Lake Point Tower**, and more — plus landmark callouts as you pass.
- **28 bridges** in their real order: the bascule spans of the Loop, Wells and Lake St double-deckers carrying the L, the DuSable/Michigan Ave bridge with four tender houses, and the **Kinzie St rail bridge permanently saluting the sky**.
- The **Chicago Harbor Lock** (real 24 m chamber — a genuine pinch at speed), **Navy Pier** with a turning **Centennial Wheel**, the **Chicago Harbor Lighthouse**, breakwaters, and open-lake chop that will put your hull in the air.

## Courses

| Course | Water |
|---|---|
| **Main Stem Sprint** | Wolf Point → ten bridges → the lock → finish at the lighthouse |
| **Full River Run** | Goose Island down the North Branch, the full Main Stem, out past the pier |
| **South Branch Charge** | Chinatown → under Willis Tower → the Loop bridges → the lock |
| **Lake Michigan Circuit** | 3 laps of open-water chop between the pier, lighthouse and breakwater |

## Boats

Five hulls with genuinely different physics: a whippy **sport jet ski**, an offshore **V-hull muscle boat**, a screaming **F1H2O tunnel-hull**, a varnished **1947 mahogany runabout**, and the **CFD Marine 7-1** fire boat. Lean into turns, ride the chop, launch off lake swells, manage the trim-boost meter.

## Controls

| Input | Action |
|---|---|
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `Shift` | Trim boost (watch the meter) |
| `C` | Camera (chase / close / hull) |
| `R` | Reset to course |
| `Esc` | Pause |

Gamepad (left stick + triggers) and touch (left half steers, right half throttles) both work.

## Under the hood

- Plain JavaScript + a vendored three.js — classic script tags, works from `file://`
- Custom water shader (analytic swell + scrolling ripple normals, Fresnel sky, sun glitter, bank foam) whose wave field is mirrored on the CPU so hulls actually ride it
- Whole-city geometry merging (one material for every generic tower), adaptive pixel-ratio scaling, shadow camera that follows the player
- 100% procedural WebAudio: five engine timbres, spray, horns, gulls, and a menu synth loop — zero audio files
- AI rivals with racing lines, corner anticipation, rubber-banding and Chicago-appropriate names (say hi to Deep Dish Dre)
- Race data: checkpoints, standings, best times in `localStorage`

## Development

```
npm install          # playwright for the test harness
node tools/screenshot.js          # headless smoke test + screenshots
node tools/deepwarp.js --course=1 # drive a course to the finish, screenshotting
node tools/bake_data.js           # regenerate js/data/chicago.js
node tools/build_singlefile.js    # rebuild play/RiverRacer.html
```
