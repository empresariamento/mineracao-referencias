import type { RawPost } from "../types.js";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YoutubeSearchItem {
  id: { videoId: string };
}

interface YoutubeSearchResponse {
  items: YoutubeSearchItem[];
}

interface YoutubeVideoItem {
  id: string;
  snippet: {
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    title: string;
    thumbnails: { high?: { url: string }; medium?: { url: string } };
  };
  statistics: { viewCount?: string; likeCount?: string };
}

interface YoutubeVideoResponse {
  items: YoutubeVideoItem[];
}

/** Resolves a public @handle to its channel ID via the officially
 * supported forHandle lookup — avoids hardcoding channel IDs, which drift
 * and are easy to get wrong by hand. */
export async function resolveChannelIdForHandle(handle: string, apiKey: string): Promise<string> {
  const cleanedHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const url = `${YOUTUBE_API_BASE}/channels?key=${apiKey}&forHandle=${encodeURIComponent(cleanedHandle)}&part=id`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube channel lookup failed for ${handle}: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { items: { id: string }[] };
  if (data.items.length === 0) throw new Error(`No YouTube channel found for handle ${handle}`);
  return data.items[0].id;
}

export async function fetchChannelUploadIds(channelId: string, apiKey: string, maxResults = 20): Promise<string[]> {
  const url = `${YOUTUBE_API_BASE}/search?key=${apiKey}&channelId=${channelId}&part=id&order=date&type=video&maxResults=${maxResults}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as YoutubeSearchResponse;
  return data.items.map((item) => item.id.videoId);
}

export async function fetchVideoDetails(videoIds: string[], apiKey: string): Promise<YoutubeVideoItem[]> {
  if (videoIds.length === 0) return [];
  const url = `${YOUTUBE_API_BASE}/videos?key=${apiKey}&id=${videoIds.join(",")}&part=snippet,statistics`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube videos failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as YoutubeVideoResponse;
  return data.items;
}

export function normalizeYoutubeVideo(
  item: YoutubeVideoItem,
  profileId: string,
  author?: { handle: string; displayName: string },
): RawPost {
  return {
    platform: "youtube",
    profileId,
    authorHandle: author?.handle,
    authorDisplayName: author?.displayName,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    postedAt: item.snippet.publishedAt,
    views: Number(item.statistics.viewCount ?? 0),
    likes: Number(item.statistics.likeCount ?? 0),
    caption: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.medium?.url ?? "",
  };
}

/** Fetches the last `maxResults` uploads for one of the fixed bank's
 * channels, by @handle. */
export async function fetchYoutubeChannelPosts(
  handle: string,
  profileId: string,
  apiKey: string,
  maxResults = 20,
): Promise<RawPost[]> {
  const channelId = await resolveChannelIdForHandle(handle, apiKey);
  const ids = await fetchChannelUploadIds(channelId, apiKey, maxResults);
  const details = await fetchVideoDetails(ids, apiKey);
  return details.map((item) => normalizeYoutubeVideo(item, profileId));
}

function sevenDaysAgoIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString();
}

/** Searches for recent videos matching a niche keyword, outside the fixed
 * profile bank — these come back tagged profileId "unknown" with the
 * uploading channel recorded as authorHandle/authorDisplayName so they can
 * feed suggestion detection. */
export async function searchYoutubeByKeyword(keyword: string, apiKey: string, maxResults = 25): Promise<RawPost[]> {
  const url =
    `${YOUTUBE_API_BASE}/search?key=${apiKey}&q=${encodeURIComponent(keyword)}` +
    `&part=id&order=viewCount&type=video&publishedAfter=${sevenDaysAgoIso()}&maxResults=${maxResults}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube keyword search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as YoutubeSearchResponse;
  const ids = data.items.map((item) => item.id.videoId);
  const details = await fetchVideoDetails(ids, apiKey);
  return details.map((item) =>
    normalizeYoutubeVideo(item, "unknown", { handle: item.snippet.channelId, displayName: item.snippet.channelTitle }),
  );
}
