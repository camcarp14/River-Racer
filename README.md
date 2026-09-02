# River Racer — Chicago

Arcade boat racing down the **real Chicago River** and out into **Lake Michigan**, in your browser. No install, no server, no network — pure WebGL.

![River Racer](shots/hero.png)

## Play

**Easiest:** download [`play/RiverRacer.html`](play/RiverRacer.html) and double-click it. The entire game — engine, city, audio, three.js — lives in that one file.

**From the repo:** open `index.html` in any browser.

The river **mirrors the skyline** with real planar reflections, the golden hour **blooms**, boats kick up **bow-wave foam**, and **bascule bridges raise and lower** — gun it under one as its warning horn sounds and gulls scatter off the deck (traffic waits at the barriers while the leaves are up). Hit one of the orange **jump ramps** at full boost and you'll **launch clean over the span**. You **shove rival racers off their line**, **dodge the yellow water taxis and white Wendella tour boats** working the channel, and blast through checkpoint gates to top up your boost. Tap **N** to ride the clock through **day → sunset → night**: the sky burns orange at dusk, then the whole city lights up — thousands of windows and street lamps glowing on the black water, the **Navy Pier wheel** blazing with color-cycling LEDs, and **fireworks** bursting over the pier. Hit **G** to dye the whole river **St. Patrick's-Day green**, or **P** for a cinematic photo-mode orbit. The renderer scales quality dynamically to hold frame rate.

## The map is real

The river isn't game-designer squiggle — the three channels are **medial-axis centerlines extracted from real GIS hydrography** of the Chicago Area Waterway System (IEPA/USGS bank-line data), with channel widths measured from the same survey. All three branches meet at the true Wolf Point junction, and the Main Stem jogs north at Trump Tower exactly like the real river does.

And it's built like the real thing vertically: the river runs in a **trough a full level (~20 ft) below the street grid**, just like Upper Wacker Drive — you race down at water level between tall quay walls, with the Riverwalk promenade at the water's edge and the Loop's dense wall of buildings rising from the street above.

Along the banks, modeled from their actual footprints and heights:

- **Marina City** corncobs, **Willis Tower**'s nine stepped tubes, **Trump Tower**, the **Wrigley Building** clock tower, **Tribune Tower**'s gothic crown, **Merchandise Mart**, **333 W Wacker**'s curved green glass at the bend, **St. Regis**, **Aqua**, the **Jewelers Building** cupolas, **Civic Opera House**, **150 N Riverside** on its impossible base, **River Point**, **Lake Point Tower**, and more — plus landmark callouts as you pass.
- **28 bridges** in their real order, each with its **street-name sign** (WELLS ST, WABASH AVE, LAKE SHORE DR…), cream-limestone tender houses with verdigris roofs, baluster railings and lamp posts: the bascule spans of the Loop, Wells and Lake St double-deckers carrying the L, the DuSable/Michigan Ave bridge with four tender houses, and the **Kinzie St rail bridge permanently saluting the sky**. Several **bascule bridges raise and lower** their leaves on their own cycles.
- The real **multi-level Chicago Riverwalk**: a lower promenade at the water's edge with quay walls and railings, stepped up to the street, threaded with its themed "rooms" — café pavilions under canopies, umbrella plazas, the stepped **River Theater**, floating gardens and kayak docks — plus docked **architecture-tour boats** and water taxis.
- A **living city**: crowds of people and cyclists stroll the promenades and **cars stream across every bridge**, all GPU-instanced. Lamp posts, benches, planters, street trees and pocket parks line the upper level — with strict keep-out so nothing but the bridges ever crosses the water.
- **Lake Shore Drive**: an elevated viaduct streaming with traffic runs the whole lakefront, crossing the river mouth on the **Link Bridge** with its four monumental Art-Moderne pylons — with lakefront parkland, a winding trail, trees and a seawall between the Drive and the water.
- The **Chicago Harbor Lock** (real 24 m chamber — a genuine pinch at speed), a built-out **Navy Pier** — Pier Park, Festival Hall, the domed ballroom, a carousel and string-lit promenade — crowned by the **Centennial Wheel**: a proper Ferris wheel with a double steel rim, hub, and hanging gondolas that spins on its true axle and blazes with color-cycling LEDs at night. Plus the **Chicago Harbor Lighthouse** and a **living harbor**: moored sailboats, yachts under sail, nav buoys, a lake freighter, and the Gold Coast and Museum Campus skylines low on the far shore. Out on the open water, a **glowing chevron ribbon and lit pylons** mark the racing line so you never lose the course.

## Modes

| Mode | What it is |
|---|---|
| **Race** | Six boats, one course, ROOKIE / SKIPPER / LEGEND rivals |
| **The Chicago Cup** | Four rounds across all four courses, with a full bracket and season table after every round |
| **Time Trial** | You against your own best line — a translucent **ghost** of your record run drives it alongside you, with a live delta |
| **Architecture Tour** | No clock, no rivals. You ride the *Wacker Belle*, a 30 m river tour boat, while the docent names what you are passing. She keeps a secret |
| **Multiplayer** | Real cross-machine P2P rooms — share a link, everyone brings their own boat |

## Driving it

Boost is **earned, not waited for**. The meter only trickles back up while you are flat out with
the wheel near centre; everything else has to be gone and got:

- **Catch a slide.** When the stern lets go, steer *into* it. Catching it recovers grip and pays
  boost, once per slide and sized by how far out she was. Merely holding lock through a corner
  pays nothing — you are just pushing wide.
- **Thread the buoys.** Red left, green right. A central line through the pair pays more than a
  scrape past one, and a clean streak pays more again.
- **Take the gold gates.** They sit off the racing line on purpose: a metre of your time for the
  biggest single payout on the course.
- **Get air**, off a ramp or a lake swell, and **draft** a rival's wake.

Lifting the throttle is a **coast**, not a brake — you can trim ten per cent for a bend and keep
it — and `S` is the fast way down when you actually need to stop. A throttle inside a quarter of a
second of GO is a **perfect start** and pays a kick; sitting on it early is a jump start and costs
you half a second on the line.

Every course keeps a **best time per hull** and a four-tier medal ladder — BRONZE, SILVER, GOLD
and AUTHOR — scaled to the boat you drove, so a lap in the slow one is measured against the slow
one. The results card shows the whole ladder and how far off the next rung you were.

## Power-ups

Gold crates ride the channel — drive through one and the slot spins you an item. The draw is
**weighted by race position**: out front you mostly pull a SHIELD and things to leave behind you,
at the back you pull the TORPEDO and the GULLS. So a lead is never safe, and the race is not
decided by whoever gets out first. The AI uses them too.

| Item | What it does | Drawn most by |
|---|---|---|
| **Shield** | Blocks the next item, or one hard crash | the leader |
| **Turbo** | A three-second burst well past your top end | anyone |
| **Oil Slick** | Three slicks astern; whoever hits one spins | mid-field and up |
| **Green Dye** | A blinding green cloud behind you | mid-field |
| **Deep Dish** | You go heavy and shove boats aside | mid-field and back |
| **Shockwave** | A blast of water that throws nearby boats off | the chasing pack |
| **Gull Swarm** | A flock in the face of the four boats ahead | the back |
| **Torpedo** | Homes up the river onto the next boat ahead | last place |

Nothing chains: a boat that has just been hit, spun or blinded is **immune for two and a half
seconds**, so the tail cannot be juggled from one item into the next. Rivals fire on a tier-scaled
cadence — roughly six items a minute at ROOKIE against twelve at LEGEND — and they reach for a
crate no further than you do.

On by default; toggle with `I` or from the title and pause screens.

## Courses

| Course | Water |
|---|---|
| **Main Stem Sprint** | Wolf Point → ten bridges → the lock → finish at the lighthouse |
| **Full River Run** | Goose Island down the North Branch, the full Main Stem, out past the pier |
| **South Branch Charge** | Chinatown → under Willis Tower → the Loop bridges → the lock |
| **Lake Michigan Circuit** | 2 laps of open-water chop between the pier, lighthouse and breakwater |

## Boats

Pick your ride in a **live 3D showroom** — the boat idles on the lake chop with the skyline behind it while you compare **SPEED / ACCEL / CONTROL / BOOST**. Six hulls, and speed genuinely costs control: every boat pays a **top-end steering tax** scaled to how loose she is, so the fastest thing on the water keeps less than half her wheel at full chat while the jet ski keeps nine tenths of hers. The **F1H2O tunnel-hull** is the quickest of the racing boats and the most slippery; the offshore **V-hull** needs the whole channel to turn; the **jet ski** and the varnished **'47 mahogany runabout** give away top end and take it back in the bends — and the runabout packs the strongest boost. Course records are kept **per hull**, so a lap in the slow boat is measured against the slow boat. Every cockpit has a **real driver** at the helm: a leaning jet-ski rider, a helmeted F1 pilot under the canopy, a flat-capped captain at the wooden wheel, a firefighter in high-vis. Pick your poison before each race: **ROOKIE, SKIPPER or LEGEND** rivals — legends run the perfect line and never lift. Cross the line first and the **1ST place pop** says so before the leaderboard does.

**Original music, zero audio files**: a soulful Chicago-house groove on the title screen and a driving 126 BPM race track once the flag drops — all synthesized live in WebAudio, with the engines mixed low so the music rides on top.

**Chicago easter eggs** — the point of the whole thing. **Cloud Gate** on its plaza and **Buckingham Fountain** firing its jets; the **Picasso**, **Calder's Flamingo**, Oldenburg's **Bat Column** and **Chagall's Four Seasons**, each snapped to the street intersection you actually see it from; the **Centennial Fountain** firing its real hourly 60 m arc straight across the racing line; a car sailing off the Marina City garage exactly as it does in *The Hunter* (1980); **Art on theMART** thrown across the Mart's river face after dark; the **Municipal Y** standing on Wolf Point, because that Y *is* this river; the **Eastland** memorial and the **1871** marker where it started; the **Rubber Duck Derby**, the **Playpen**, **"meet me under the clock"**, and yes — **the Rat Hole**. Hand-lettered signage for the **Billy Goat**, **Malört**, **NO KETCHUP**, **Mr Beef**, the **Green Mill** and **Chess Records** rides on a single draw call.

## Controls

| Input | Action |
|---|---|
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `Shift` | Boost (drains fast; the meter only trickles back while you are flat out) |
| `C` | Camera (chase / close / hull) |
| `N` | Time of day (day / sunset / **dusk** / night) |
| `G` | Dye the river green (St. Patrick's Day) |
| `E` / `Space` | Fire the item you are holding |
| `B` / `Q` | Hold to look astern |
| `P` | Photo mode (orbit camera, HUD off) |
| `[` `]` | Cycle cinematic camera shots |
| `M` | Sound on / off (the game boots silent) |
| `I` | Power-ups on / off (menus only) |
| `R` | Reset to course (costs boost and a second of throttle) |
| `Esc` | Pause |

Gamepad: **left stick** steers, **RT/LT** throttle and brake, **A** throttle, **X** boost, **B** fires your item, **LB** looks astern, **Start** pauses, **Back** resets, and the d-pad works the menus.

Touch: a **steering pad** in the bottom-left corner and a **throttle column** in the bottom-right with GO, BOOST and reverse, plus **FIRE** and **PAUSE** — every key above that matters in a race is a control on the glass, not a keyboard binding a phone does not have.

## Under the hood

- Plain JavaScript + a vendored three.js — classic script tags, works from `file://`
- Custom water shader (analytic swell + scrolling ripple normals, Fresnel sky, sun glitter, bank foam) whose wave field is mirrored on the CPU so hulls actually ride it
- **Ten facade families** — limestone, black anodised Mies steel, common brick, terracotta, pink granite, green and blue glass, concrete, curtain wall, retail — each a 256px tile of one 3.0 m bay by one 3.6 m floor, with geometry bucketed per family. Which one a building gets is decided by a **district model**: the Loop and Main Stem banks run limestone and black steel; brick pools into Fulton Market, River North and Printer's Row, where Chicago actually keeps it
- Four time-of-day presets (day / sunset / dusk / night), a colour grade folded into the bloom composite rather than a second pass, and a baked vertical AO ramp in vertex colour standing in for SSAO at no cost
- Whole-city geometry merging, adaptive pixel-ratio scaling, shadow camera that follows the player
- 100% procedural WebAudio: five engine timbres, spray, horns, gulls, and a menu synth loop — zero audio files
- AI rivals with racing lines, corner anticipation, rubber-banding and Chicago-appropriate names (say hi to Deep Dish Dre)
- Race data: checkpoints, standings, best times in `localStorage`; ghosts recorded to a 20 Hz ring buffer, quantised to Int16 and base64'd to ~30 KB per course and hull
- The whole city is **deterministic** — every procedural placement runs off a seeded `mulberry32`, so the skyline is identical on every load and on every machine

## Development

```
npm install          # playwright for the test harness
node tools/check.js               # fast load check — fails on any console error (~30s)
node tools/check.js --shot=NAME --cam=x,y,z --look=x,y,z [--time=night]
                                  # park a free camera anywhere and render one frame
node tools/screenshot.js          # full headless smoke test + screenshots (~90s)
node tools/deepwarp.js --course=1 # drive a course to the finish, screenshotting
node tools/bake_data.js           # regenerate js/data/chicago.js
node tools/build_singlefile.js    # rebuild play/RiverRacer.html
```
