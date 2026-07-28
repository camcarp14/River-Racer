#!/usr/bin/env node
// ideafeed scanner
//
//   node scan.mjs            scan, merge into the existing feed, write feed.json
//   node scan.mjs --dry      scan and print what would change, write nothing
//   node scan.mjs --no-llm   skip the enrichment pass even if a key is present
//
// Designed to run unattended on a cron. Every external call is retried, every
// optional step degrades to a heuristic, and the feed file is only overwritten
// once a full run has succeeded.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  searchRepos,
  fetchReadme,
  mapLimit,
  isAuthenticated,
  coreQuotaExhausted,
} from './lib/github.mjs';
import { scoreRepo, shouldExclude, starVelocity, daysSince } from './lib/score.mjs';
import { buildHook, readmeContext, cleanDescription } from './lib/summarize.mjs';
import { enrichItems, enrichmentAvailable } from './lib/enrich.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry');
const NO_LLM = args.has('--no-llm');

const DAY = 86_400_000;

// IDEAFEED_CONFIG points at an alternate config file — handy for trying a
// different set of lanes without touching the one the cron job uses.
async function loadConfig() {
  const path = process.env.IDEAFEED_CONFIG
    ? resolve(process.cwd(), process.env.IDEAFEED_CONFIG)
    : resolve(HERE, 'config.json');
  const raw = await readFile(path, 'utf8');
  return { ...JSON.parse(raw), __dir: dirname(path) };
}

async function loadFeed(path) {
  if (!existsSync(path)) return { items: [] };
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch (err) {
    console.warn(`existing feed unreadable (${err.message}); starting fresh`);
    return { items: [] };
  }
}

/** `created:>{{days:21}}` -> `created:>2026-07-07` */
function expandQuery(query) {
  return query.replace(/\{\{days:(\d+)\}\}/g, (_, n) => {
    const date = new Date(Date.now() - Number(n) * DAY);
    return date.toISOString().slice(0, 10);
  });
}

async function collectCandidates(lanes, perQuery) {
  /** @type {Map<string, {repo: any, lanes: Set<string>}>} */
  const found = new Map();

  for (const lane of lanes) {
    const query = expandQuery(lane.query);
    process.stdout.write(`  ${lane.id.padEnd(14)} ${query}\n`);
    const repos = await searchRepos(query, { sort: lane.sort, perPage: perQuery });
    for (const repo of repos) {
      const key = String(repo.id);
      if (!found.has(key)) found.set(key, { repo, lanes: new Set() });
      found.get(key).lanes.add(lane.id);
    }
    console.log(`  ${' '.repeat(14)} → ${repos.length} repos`);
  }

  return found;
}

function laneLabels(config) {
  const byId = new Map();
  for (const lane of config.lanes) {
    byId.set(lane.id, { label: lane.label, blurb: lane.blurb });
  }
  return byId;
}

/** The distinct lane labels, in config order — these become the UI filter chips. */
function laneChips(config) {
  const seen = new Map();
  for (const lane of config.lanes) {
    if (!seen.has(lane.label)) {
      seen.set(lane.label, { id: lane.label, label: lane.label, blurb: lane.blurb });
    }
  }
  return [...seen.values()];
}

async function main() {
  const config = await loadConfig();
  const outPath = resolve(config.__dir, config.output);
  const previous = await loadFeed(outPath);
  const previousById = new Map(previous.items.map((item) => [String(item.id), item]));

  console.log(
    `ideafeed scan — ${previous.items.length} items in feed, ` +
      `github auth: ${isAuthenticated() ? 'yes' : 'no (rate limits will be tight)'}`,
  );

  console.log('\nsearching…');
  const candidates = await collectCandidates(config.lanes, config.limits.perQuery);
  console.log(`\n${candidates.size} unique repos found`);

  // Split into repos we've never seen (need a README fetch + summary) and repos
  // we already know (just refresh the numbers).
  const fresh = [];
  const known = [];
  let excluded = 0;

  for (const { repo, lanes } of candidates.values()) {
    const reason = shouldExclude(repo, config.scoring);
    if (reason) {
      excluded++;
      continue;
    }
    const entry = { repo, lanes: [...lanes] };
    if (previousById.has(String(repo.id))) known.push(entry);
    else fresh.push(entry);
  }

  console.log(`${fresh.length} new, ${known.length} already known, ${excluded} excluded`);

  console.log('\nfetching readmes for new repos…');
  const readmes = await mapLimit(fresh, 6, async ({ repo }) =>
    fetchReadme(repo.full_name, config.limits.readmeBytes),
  );
  const withReadme = readmes.filter(Boolean).length;
  console.log(`  ${withReadme}/${fresh.length} readmes fetched`);
  if (coreQuotaExhausted()) {
    console.warn(
      '  GitHub core quota exhausted — remaining summaries fall back to the repo\n' +
        '  description. Set GITHUB_TOKEN to raise the limit from 60/hr to 5000/hr.',
    );
  }

  const labels = laneLabels(config);
  const nowIso = new Date().toISOString();

  /**
   * A model-assessed novelty rating is better evidence than our keyword
   * heuristic, so once an item has one it nudges the final score.
   */
  const withNoveltyBoost = (score, novelty) => {
    if (novelty == null) return score;
    const delta = ((novelty - 50) / 50) * 12; // ±12 points
    return Math.round(Math.max(0, Math.min(100, score + delta)) * 10) / 10;
  };

  /** Build the item shape shared by new and refreshed entries. */
  const buildItem = ({ repo, lanes }, readme, prior) => {
    const { score, breakdown } = scoreRepo(
      repo,
      readme || '',
      config.scoring,
      prior?.breakdown || null,
    );
    const velocity = starVelocity(repo);
    const laneLabelSet = [...new Set(lanes.map((id) => labels.get(id)?.label || id))];

    return {
      id: String(repo.id),
      full_name: repo.full_name,
      owner: repo.owner?.login || repo.full_name.split('/')[0],
      name: repo.name,
      url: repo.html_url,
      homepage: repo.homepage || null,
      description: cleanDescription(repo.description || ''),
      hook: prior?.hook || buildHook(repo, readme || ''),
      why: prior?.why || null,
      tags: prior?.tags || (repo.topics || []).slice(0, 4),
      novelty: prior?.novelty ?? null,
      language: repo.language || null,
      license: repo.license?.spdx_id || null,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      topics: repo.topics || [],
      created_at: repo.created_at,
      pushed_at: repo.pushed_at,
      age_days: Math.round(daysSince(repo.created_at)),
      star_velocity: Math.round(velocity * 100) / 100,
      base_score: score,
      score: withNoveltyBoost(score, prior?.novelty ?? null),
      breakdown,
      lanes: prior ? [...new Set([...(prior.lanes || []), ...laneLabelSet])] : laneLabelSet,
      enriched: Boolean(prior?.enriched),
      first_seen: prior?.first_seen || nowIso,
      last_seen: nowIso,
      stars_at_first_seen: prior?.stars_at_first_seen ?? repo.stargazers_count,
      readme_context: undefined, // stripped before write; only used for enrichment
    };
  };

  const newItems = fresh.map((entry, i) => {
    const item = buildItem(entry, readmes[i], null);
    item.readme_context = readmeContext(readmes[i] || '');
    return item;
  });

  const refreshedItems = known.map((entry) =>
    buildItem(entry, '', previousById.get(String(entry.repo.id))),
  );

  // Enrich the most promising new items only — this is the one part of the run
  // that costs money, so it's capped hard by config.
  let enrichmentMap = new Map();
  if (config.enrichment.enabled && !NO_LLM) {
    const toEnrich = [...newItems]
      .sort((a, b) => b.score - a.score)
      .slice(0, config.limits.maxNewEnrichmentsPerRun);

    if (toEnrich.length) {
      console.log(
        `\nenriching ${toEnrich.length} new items` +
          `${enrichmentAvailable() ? '' : ' (skipped — no API key)'}…`,
      );
      enrichmentMap = await enrichItems(
        toEnrich,
        config.enrichment,
        config.limits.enrichBatchSize,
      );
    }
  }

  for (const item of newItems) {
    const enriched = enrichmentMap.get(item.id);
    if (!enriched) continue;
    if (enriched.hook) item.hook = enriched.hook;
    if (enriched.why) item.why = enriched.why;
    if (enriched.tags?.length) item.tags = enriched.tags;
    item.novelty = enriched.novelty;
    item.enriched = true;
    item.score = withNoveltyBoost(item.base_score, enriched.novelty);
  }

  // Merge: refreshed + new override their previous versions, everything else
  // in the old feed is carried forward untouched.
  const merged = new Map(previousById);
  for (const item of [...refreshedItems, ...newItems]) merged.set(item.id, item);

  const cutoff = Date.now() - config.limits.keepUnseenDays * DAY;
  const items = [...merged.values()]
    .map((item) => {
      const { readme_context, ...rest } = item;
      return {
        ...rest,
        stars_gained: Math.max(0, rest.stars - (rest.stars_at_first_seen ?? rest.stars)),
      };
    })
    .filter((item) => new Date(item.last_seen).getTime() >= cutoff)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.limits.maxItemsInFeed);

  const feed = {
    version: 1,
    generated_at: nowIso,
    enriched: enrichmentMap.size > 0,
    lanes: laneChips(config),
    stats: {
      total: items.length,
      new_this_run: newItems.length,
      enriched_this_run: enrichmentMap.size,
      scanned: candidates.size,
    },
    items,
  };

  console.log(
    `\n${items.length} items in feed ` +
      `(+${newItems.length} new, ${enrichmentMap.size} enriched this run)`,
  );

  const top = items.slice(0, 8);
  console.log('\ntop of the feed:');
  for (const item of top) {
    console.log(`  ${String(item.score).padStart(5)}  ${item.full_name}`);
    console.log(`         ${item.hook.slice(0, 96)}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry: nothing written');
    return;
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
  console.log(`\nwrote ${outPath}`);
}

main().catch((err) => {
  console.error(`\nscan failed: ${err.stack || err.message}`);
  process.exit(1);
});
