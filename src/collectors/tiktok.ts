import type { RawPost } from "../types.js";

const APIFY_API_BASE = "https://api.apify.com/v2";

/** Public Apify actor for TikTok scraping. Confirm this is still the right
 * actor id (and that its dataset field names below still match) with a
 * one-profile smoke test before relying on it for the full weekly run. */
export const TIKTOK_ACTOR_ID = "clockworks~tiktok-scraper";

export interface ApifyTikTokItem {
  webVideoUrl?: string;
  text?: string;
  createTimeISO?: string;
  playCount?: number;
  diggCount?: number;
  covers?: { default?: string };
  videoMeta?: { coverUrl?: string; downloadAddr?: string };
  authorMeta?: { name?: string };
}

export async function runApifyActor<T>(actorId: string, input: Record<string, unknown>, token: string): Promise<T[]> {
  const url = `${APIFY_API_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify actor ${actorId} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

export function normalizeTikTokItem(item: ApifyTikTokItem, profileId: string): RawPost {
  const isUnknown = profileId === "unknown";
  return {
    platform: "tiktok",
    profileId,
    authorHandle: isUnknown ? item.authorMeta?.name : undefined,
    authorDisplayName: isUnknown ? item.authorMeta?.name : undefined,
    url: item.webVideoUrl ?? "",
    postedAt: item.createTimeISO ?? new Date(0).toISOString(),
    views: item.playCount ?? 0,
    likes: item.diggCount ?? 0,
    caption: item.text ?? "",
    thumbnailUrl: item.covers?.default ?? item.videoMeta?.coverUrl ?? "",
    videoUrl: item.videoMeta?.downloadAddr,
  };
}

export async function fetchTiktokProfilePosts(
  username: string,
  profileId: string,
  apifyToken: string,
  resultsPerPage = 20,
): Promise<RawPost[]> {
  const items = await runApifyActor<ApifyTikTokItem>(
    TIKTOK_ACTOR_ID,
    { profiles: [username], resultsPerPage, shouldDownloadVideos: false, shouldDownloadCovers: false },
    apifyToken,
  );
  return items.map((item) => normalizeTikTokItem(item, profileId));
}

/** Niche-search hits outside the fixed bank, tagged profileId "unknown" so
 * they feed suggestion detection the same way YouTube keyword hits do. */
export async function searchTiktokByHashtag(
  hashtag: string,
  apifyToken: string,
  resultsPerPage = 25,
): Promise<RawPost[]> {
  const items = await runApifyActor<ApifyTikTokItem>(
    TIKTOK_ACTOR_ID,
    { hashtags: [hashtag], resultsPerPage, shouldDownloadVideos: false, shouldDownloadCovers: false },
    apifyToken,
  );
  return items.map((item) => normalizeTikTokItem(item, "unknown"));
}
