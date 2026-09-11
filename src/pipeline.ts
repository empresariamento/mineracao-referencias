import { averageViews, scoreAgainstNicheAverage, scoreAgainstProfileHistory, selectTop } from "./score.js";
import type { RawPost, ScoredPost } from "./types.js";
import type { ViralHit } from "./profiles.js";

const TOP_ITEMS_LIMIT = 25;
const RECENT_WINDOW_DAYS = 7;

export function isWithinDays(isoDate: string, days: number, now: Date = new Date()): boolean {
  const posted = new Date(isoDate).getTime();
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return posted >= cutoff;
}

/** Scores this week's candidates (posts from the last RECENT_WINDOW_DAYS)
 * from one profile's fetched history, each against the average of the
 * REST of that same history (excluding itself). */
export function scoreProfileCandidates(
  fullHistory: RawPost[],
  days = RECENT_WINDOW_DAYS,
  now: Date = new Date(),
): ScoredPost[] {
  const candidates = fullHistory.filter((post) => isWithinDays(post.postedAt, days, now));
  return candidates.map((candidate) => {
    const restOfHistory = fullHistory.filter((post) => post.url !== candidate.url);
    return scoreAgainstProfileHistory(candidate, restOfHistory);
  });
}

/** Scores niche-search hits (outside the fixed bank) against the average
 * of the batch they were found in. */
export function scoreNicheSearchHits(hits: RawPost[]): ScoredPost[] {
  const nicheAverage = averageViews(hits);
  return hits.map((hit) => scoreAgainstNicheAverage(hit, nicheAverage));
}

export function buildWeeklySelection(
  profileScored: ScoredPost[],
  nicheScored: ScoredPost[],
  limit = TOP_ITEMS_LIMIT,
): ScoredPost[] {
  return selectTop([...profileScored, ...nicheScored], limit);
}

/** Extracts (platform, handle) pairs from niche-search hits that weren't
 * tied to a fixed profile, for suggestion detection. */
export function collectViralHits(nicheSearchPosts: RawPost[]): ViralHit[] {
  return nicheSearchPosts
    .filter((post): post is RawPost & { authorHandle: string } => post.profileId === "unknown" && Boolean(post.authorHandle))
    .map((post) => ({
      platform: post.platform,
      handle: post.authorHandle,
      displayName: post.authorDisplayName ?? post.authorHandle,
    }));
}
