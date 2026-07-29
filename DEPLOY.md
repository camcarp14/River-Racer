# River Racer — Play With Your Coworkers ($0 hosting)

River Racer now has **live online multiplayer**: everyone races the same track at the
same time and sees each other's boats move in real time. It costs **nothing** to run —
the game is a static web page, and live boats connect **browser-to-browser (P2P)** with
no game server.

There are two things you can hand people:

| File | What it's for |
|------|----------------|
| `play/RiverRacer.html` | The **offline** single-player game. Email it, open it from a USB stick, works with no internet. Online play is disabled here (a local file can't do networking). |
| The **repo folder** (`index.html` + `js/`) hosted on the web | The **online** version. This is what you deploy for multiplayer. |

---

## 1. Put the game online (pick one — all free)

You're deploying a plain static site (no build step, no backend). Any of these work:

### Option A — Cloudflare Pages (recommended, from your GitHub repo)
1. Go to <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick this repository and the `claude/river-racer-enhancement-stvbxs` branch.
3. Build settings: **Framework preset = None**, **Build command = (leave blank)**, **Build output directory = `/`**.
4. **Save and Deploy.** You get a URL like `https://river-racer.pages.dev`.

### Option B — Netlify drop (no account-linking, 60 seconds)
1. Zip the repo folder (must include `index.html` and the `js/` folder).
2. Go to <https://app.netlify.com/drop> and drag the folder in. You get a URL instantly.

### Option C — GitHub Pages
1. Repo → **Settings → Pages** → Source = **Deploy from a branch** → branch `claude/river-racer-enhancement-stvbxs`, folder `/ (root)` → **Save**.
2. Your URL is `https://<you>.github.io/<repo>/`.

> After deploying, open the URL and confirm the game loads and you see a **▸ PLAY ONLINE**
> button at the bottom of the title screen. (That button only appears on a hosted page.)

---

## 2. Race together from Slack

No Slack app required to start — Slack is just where you share the link.

**To run a race:**
1. Post a link in your channel with a room code, e.g.
   `🏁 River Racer — join room DERBY: https://river-racer.pages.dev/?room=DERBY`
   (any word works as the code — everyone using the **same code** lands in the same race).
2. Everyone clicks it, types their name once (remembered next time), picks a boat, and lands
   in the **lobby**. It shows who's in.
3. The **first person in the room is the host** and gets a **START RACE** button. It also
   auto-starts when 6 racers are in.
4. You all race live; when everyone finishes, the **results** panel ranks you by time.
5. Want another? The host hits **RACE AGAIN**.

**Tip:** make it a standing thing — pin a message like "☕ 3pm Friday race — room `FRIDAY`,
click to join: `…/?room=FRIDAY`". You can also make a one-click **Slack Workflow Builder**
button (Workflow Builder → new workflow → trigger "link/shortcut" → step "send a message"
with that link) so there's a permanent "🏁 New Race" button in the channel — still no code,
no hosting.

---

## 3. The one thing to know about P2P (please read)

Live boats connect **directly between browsers** over WebRTC, using free public relays only
to introduce the players to each other. This is what makes it $0 with no server. It's rock
solid when **players are on the same office network/Wi-Fi** (their browsers reach each other
directly).

It can struggle when players are **fully remote / on restrictive VPNs**, if the company
firewall blocks the peer-introduction relays or blocks direct connections. If some people
can't see each other:

- First try: everyone on the **same office Wi-Fi**.
- If your network blocks it, there's a rock-solid fallback — a tiny **free Cloudflare relay**
  that funnels the live positions through one allowed address (works through any firewall).
  It's a ~15-minute add; ask and I'll wire it in.

Single-player and the leaderboard don't depend on P2P at all.

---

## 4. Next step: Slack lobby button + a persistent leaderboard

Right now the leaderboard is **per-race** (shown in-game). To keep a **standing office
leaderboard** (most wins, fastest lap per course, win %) and a proper `/riverracer` lobby
posted by a bot, we add a small **Slack app on Slack's own hosted platform** (a Slack-run
Datastore holds the stats — still no server you operate).

That part is deployed with Slack's CLI (`slack deploy`) from your workspace, which needs your
Slack admin login — so we set it up together in ~20 minutes. The game already knows how to
report a finished race's results to it. Say the word and we'll do that pass.
