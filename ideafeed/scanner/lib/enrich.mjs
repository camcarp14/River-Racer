// Optional enrichment pass: turns a repo + README excerpt into a clean, human
// one-liner plus a "why this is interesting" note and a novelty rating.
//
// This is strictly optional. If ANTHROPIC_API_KEY isn't set, the scanner falls
// back to the heuristic summariser and the feed still works — the entries just
// read a little more like GitHub and a little less like a person wrote them.

// The SDK is imported lazily so the scanner runs with zero dependencies
// installed whenever enrichment is turned off.

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The exact id given in the input. Copy it verbatim.',
          },
          hook: {
            type: 'string',
            description:
              'One sentence, max 22 words, plain English, no marketing. What the thing actually is. Never start with the repo name.',
          },
          why: {
            type: 'string',
            description:
              'One sentence on what is genuinely new or unusual here, or why someone would care. If nothing is novel, say so plainly.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '2-4 lowercase topic tags, e.g. "inference", "crdt", "compilers".',
          },
          novelty: {
            type: 'integer',
            description:
              'How novel the idea is, 0-100. 0-25 = a rebuild of something common. 26-60 = a solid but familiar tool. 61-85 = a genuinely fresh angle. 86-100 = nobody has tried this.',
          },
        },
        required: ['id', 'hook', 'why', 'tags', 'novelty'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const SYSTEM = `You triage newly discovered GitHub repositories for a personal "novel ideas" feed.

The reader is a technical person who wants to spot genuinely interesting projects early. They are bored by yet another awesome-list, boilerplate, tutorial repo, or CRUD clone, and they will notice immediately if you dress one of those up as exciting.

For each repository, write a one-sentence hook that says what it actually is, and a one-sentence note on what is new or unusual about it. Be concrete and specific. Prefer the technical mechanism over the pitch: "compiles regexes to branchless SIMD" beats "blazing fast regex engine".

Rate novelty honestly. Most repositories are not novel — a 30 is a normal, correct answer. Reserve scores above 85 for approaches you have genuinely not seen before. Never inflate a score to make an item sound worth reading.

Keep responses focused and brief. No preamble, no caveats.`;

function buildPrompt(batch) {
  const blocks = batch.map((item) => {
    const lines = [
      `id: ${item.id}`,
      `repo: ${item.full_name}`,
      `stars: ${item.stars} (${item.star_velocity.toFixed(2)}/day since creation)`,
      `language: ${item.language || 'unknown'}`,
      `topics: ${(item.topics || []).join(', ') || 'none'}`,
      `description: ${item.description || '(none)'}`,
      `readme excerpt:\n${item.readme_context || '(none)'}`,
    ];
    return lines.join('\n');
  });

  return `Triage these ${batch.length} repositories.\n\n${blocks.join('\n\n---\n\n')}`;
}

function parseResponse(response) {
  if (response.stop_reason === 'refusal') {
    throw new Error(
      `model declined (${response.stop_details?.category || 'unknown category'})`,
    );
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!text.trim()) throw new Error('empty response');
  return JSON.parse(text).items || [];
}

export function enrichmentAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * Enrich one batch. Tries the server-side fallback path first so a safety
 * classifier decline on one odd repo doesn't cost us the whole batch, and
 * retries once on the plain endpoint if the beta path is unavailable.
 */
async function enrichBatch(client, batch, cfg) {
  const request = {
    model: cfg.model,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      effort: cfg.effort,
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: 'user', content: buildPrompt(batch) }],
  };

  try {
    return parseResponse(
      await client.beta.messages.create({
        ...request,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }),
    );
  } catch (err) {
    console.warn(`  enrichment retry without fallbacks: ${err.message}`);
    return parseResponse(await client.messages.create(request));
  }
}

/**
 * Enrich items in batches. Never throws — on failure the items simply come back
 * unenriched and the heuristic summary stands.
 */
export async function enrichItems(items, cfg, batchSize = 6) {
  if (!items.length) return new Map();
  if (!enrichmentAvailable()) {
    console.log('  no ANTHROPIC_API_KEY — using heuristic summaries only');
    return new Map();
  }

  let client;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic();
  } catch (err) {
    console.warn(`  @anthropic-ai/sdk unavailable (${err.message}) — skipping enrichment`);
    return new Map();
  }

  const results = new Map();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const label = `${i + 1}-${Math.min(i + batchSize, items.length)}/${items.length}`;
    try {
      const enriched = await enrichBatch(client, batch, cfg);
      for (const entry of enriched) {
        if (!entry?.id) continue;
        results.set(String(entry.id), {
          hook: String(entry.hook || '').trim(),
          why: String(entry.why || '').trim(),
          tags: (entry.tags || []).map((t) => String(t).toLowerCase().trim()).slice(0, 4),
          novelty: Math.max(0, Math.min(100, Math.round(Number(entry.novelty) || 0))),
        });
      }
      console.log(`  enriched ${label}`);
    } catch (err) {
      console.warn(`  enrichment failed for ${label}: ${err.message}`);
    }
  }

  return results;
}
