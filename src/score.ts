import type { RawPost, ScoredPost } from "./types.js";

/** Below this many history posts, a profile's average isn't trustworthy
 * enough to score against — it enters the weekly list unranked instead. */
const MIN_HISTORY_POSTS = 5;

export function averageViews(posts: RawPost[]): number {
  if (posts.length === 0) return 0;
  const total = posts.reduce((sum, post) => sum + post.views, 0);
  return total / posts.length;
}

/** Scores one candidate post against the trailing average of the REST of
 * that profile's history (the candidate itself must already be excluded
 * from `profileHistory` by the caller). */
export function scoreAgainstProfileHistory(post: RawPost, profileHistory: RawPost[]): ScoredPost {
  if (profileHistory.length < MIN_HISTORY_POSTS) {
    return { ...post, score: NaN, scoreBasis: "insufficient-history" };
  }
  const avg = averageViews(profileHistory);
  if (avg <= 0) {
    return { ...post, score: NaN, scoreBasis: "insufficient-history" };
  }
  return { ...post, score: post.views / avg, scoreBasis: "profile-history" };
}

/** Scores a niche-search hit (not tied to a fixed profile) against the
 * average of the whole batch it was found in. */
export function scoreAgainstNicheAverage(post: RawPost, nicheAverage: number): ScoredPost {
  if (nicheAverage <= 0) {
    return { ...post, score: NaN, scoreBasis: "insufficient-history" };
  }
  return { ...post, score: post.views / nicheAverage, scoreBasis: "niche-average" };
}

/** Ranked (scorable) posts first, highest score first; unranked posts
 * (score is NaN) fill any remaining slots after them. */
export function selectTop(posts: ScoredPost[], limit: number): ScoredPost[] {
  const ranked = posts.filter((post) => !Number.isNaN(post.score)).sort((a, b) => b.score - a.score);
  const unranked = posts.filter((post) => Number.isNaN(post.score));
  return [...ranked, ...unranked].slice(0, limit);
}
