export interface ScoreBreakdown {
  momentum: number;
  freshness: number;
  novelty: number;
  substance: number;
  obscurity: number;
}

export interface FeedItem {
  id: string;
  full_name: string;
  owner: string;
  name: string;
  url: string;
  homepage: string | null;
  description: string;
  /** The one-liner the feed shows. Written by the enrichment pass when available. */
  hook: string;
  /** What is actually new here. Null when the item hasn't been enriched. */
  why: string | null;
  tags: string[];
  novelty: number | null;
  language: string | null;
  license: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  topics: string[];
  created_at: string;
  pushed_at: string;
  age_days: number;
  star_velocity: number;
  score: number;
  base_score?: number;
  breakdown: ScoreBreakdown;
  lanes: string[];
  enriched: boolean;
  first_seen: string;
  last_seen: string;
  stars_at_first_seen: number;
  stars_gained: number;
}

export interface Lane {
  id: string;
  label: string;
  blurb: string;
}

export interface Feed {
  version: number;
  generated_at: string;
  enriched: boolean;
  lanes: Lane[];
  stats: {
    total: number;
    new_this_run: number;
    enriched_this_run: number;
    scanned: number;
  };
  items: FeedItem[];
}

export type View = 'feed' | 'saved' | 'archive';
export type SortKey = 'score' | 'newest' | 'momentum' | 'stars';
