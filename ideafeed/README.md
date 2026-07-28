# ideafeed

A quiet feed of novel projects appearing on GitHub.

A scanner runs every couple of hours, sweeps GitHub for repositories that look
like genuinely new ideas rather than yet another awesome-list, cleans up what it
finds into a readable one-liner, and commits the result as a static JSON file. A
small web app reads that file and shows it as a feed you can skim, save from, and
come back to.

There is no server, no database and no account. The scanner is a cron job, the
feed is a file, the app is static, and your saves live in your browser.

```
GitHub Search API  →  scanner (GitHub Actions, every 2h)  →  feed.json  →  web app
```

---

## Layout

| Path | What it is |
| --- | --- |
| `scanner/scan.mjs` | The scan: search → score → summarise → merge → write |
| `scanner/config.json` | Everything tunable: lanes, scoring weights, limits |
| `scanner/lib/` | GitHub client, scoring, README summariser, LLM enrichment |
| `web/` | Vite + React + TypeScript app |
| `web/public/feed.json` | The feed. Written by the scanner, read by the app |
| `../.github/workflows/ideafeed-scan.yml` | The cron job |
| `../.github/workflows/ideafeed-deploy.yml` | Optional GitHub Pages deploy (manual) |

---

## Running it locally

```bash
# 1. Fill the feed (a GitHub token is optional but strongly recommended —
#    it raises the API limit from 60/hour to 5000/hour)
cd scanner
npm install
GITHUB_TOKEN=ghp_… node scan.mjs

# 2. Look at it
cd ../web
npm install
npm run dev
```

Useful scanner flags:

```bash
node scan.mjs --dry      # scan and print, write nothing
node scan.mjs --no-llm   # skip enrichment even if a key is set
IDEAFEED_CONFIG=./my-lanes.json node scan.mjs   # try a different lane set
```

---

## How something gets into the feed

**1. Lanes.** `config.json` defines a handful of GitHub searches — brand new
repos with traction, young repos still under 250 stars, plus topic lanes for
agents, devtools, local-first, graphics and a couple of odd-language lanes. Each
lane is a plain GitHub search query with a `{{days:N}}` placeholder for dates, so
adding your own is a two-line edit.

**2. Scoring.** Five components, weighted to sum to 100:

| Component | What it measures |
| --- | --- |
| Momentum | Stars per day since creation, log-scaled |
| Freshness | Full marks under a week old, decaying to zero at a year |
| Novelty | Keyword and shape heuristics — see below |
| Substance | Is there a real README, description, topics, a license |
| Under the radar | A bell curve peaking around 400 stars |

The novelty component is the one doing the interesting work. It penalises the
words that reliably mark a repo as *not* an idea — awesome, boilerplate, roadmap,
cheatsheet, tutorial, clone of, 100 days — and rewards the ones that mark a real
mechanism: compiler, allocator, wire protocol, from scratch, CRDT, decompiler.
Odd languages get a bump, missing descriptions get a penalty, forks and archived
repos get a large one. Anything over 90k stars is excluded outright: you already
know about it.

**3. Enrichment (optional).** If `ANTHROPIC_API_KEY` is set, the top new items
from each run go to Claude in small batches, which writes the one-line hook, a
sentence on what's actually new, a few tags, and a 0–100 novelty rating that
nudges the final score by up to ±12 points. The prompt tells it plainly that most
repos are not novel and that a 30 is a normal answer, because a rating that's
always 80 is the same as no rating.

Without a key, nothing breaks — the feed falls back to a heuristic summariser
that strips badges, logos, nav rows and install instructions out of the README
and keeps the first line that actually describes the project.

**4. Merging.** Each run merges into the existing feed rather than replacing it.
Items keep their `first_seen` date and the star count they had when first found,
which is where the "+340 since found" figure on each card comes from. Items not
seen for 45 days age out.

---

## The app

- **Feed / Saved / Archive.** Save keeps something for later; archive hides it
  from the feed without deleting it.
- **Lanes and search.** Filter to a lane, or search across names, hooks, tags and
  languages.
- **Sorting.** Most interesting, newest find, fastest moving, most stars.
- **New since last visit.** The app remembers when you last looked and marks
  everything that showed up since.
- **Score breakdown.** The number on each card expands into the five components,
  so you can see why something surfaced instead of taking the number on faith.
- **Keyboard.** `j`/`k` move, `o` open, `b` save, `x` archive, `/` search,
  `1`/`2`/`3` switch views, `⌘K` for the command palette.
- **Export.** Saved items come back out as JSON.

Saves live in `localStorage` under `ideafeed.state.v1`. That's deliberate — no
account, works offline, nothing to run. If you ever want them synced across
devices, `web/src/lib/store.ts` defines an `IdeaStore` interface with a local
implementation; a Supabase version is a drop-in replacement and no component
changes.

---

## Deploying

**Netlify** (easiest): import the repo, set the base directory to `ideafeed/web`.
`web/netlify.toml` handles build, caching and SPA routing.

**GitHub Pages**: Settings → Pages → Source: "GitHub Actions", then run the
*ideafeed deploy* workflow manually. It's manual on purpose — publishing to Pages
replaces whatever else the repository currently serves there.

Either way the scan workflow keeps committing `feed.json`, and each commit
triggers a rebuild, so the live site stays current on its own.

---

## Secrets

| Secret | Needed? | Effect |
| --- | --- | --- |
| `GITHUB_TOKEN` | Provided automatically in Actions | Raises the API limit from 60/hr to 5000/hr |
| `ANTHROPIC_API_KEY` | Optional | Enables the enrichment pass |

Add the Anthropic key under Settings → Secrets and variables → Actions. The run
cost is bounded by `limits.maxNewEnrichmentsPerRun` in `config.json` (36 items
per run by default, in batches of 6).

---

## Tuning it

Almost everything worth changing is in `scanner/config.json`:

- **Different interests?** Edit `lanes`. Any GitHub search query works.
- **Too much noise?** Raise the `novelty` weight, or add the offending words to
  `penalizeKeywords`.
- **Too obscure?** Raise `obscurityIdealStars` or lower the `obscurity` weight.
- **Too expensive?** Lower `maxNewEnrichmentsPerRun`, or set
  `enrichment.enabled` to `false`.
- **Scan more or less often?** The cron expression in the workflow.
