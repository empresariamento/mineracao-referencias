import type { RawPost } from "../types.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

interface BusinessDiscoveryMedia {
  caption?: string;
  like_count?: number;
  timestamp: string;
  media_type: string;
  media_url?: string;
  permalink: string;
  thumbnail_url?: string;
}

interface BusinessDiscoveryResponse {
  business_discovery?: {
    media?: { data: BusinessDiscoveryMedia[] };
  };
}

/** Looks up the Instagram Business Account ID linked to one of the user's
 * own Facebook Pages — this is the "anchor" account business_discovery
 * queries are made from. Run once and store the result as
 * INSTAGRAM_BUSINESS_ACCOUNT_ID. */
export async function resolveOwnBusinessAccountId(accessToken: string): Promise<string> {
  const pagesRes = await fetch(`${GRAPH_API_BASE}/me/accounts?access_token=${accessToken}`);
  if (!pagesRes.ok) throw new Error(`Failed to list pages: ${pagesRes.status} ${await pagesRes.text()}`);
  const pages = (await pagesRes.json()) as { data: { id: string }[] };
  for (const page of pages.data) {
    const igRes = await fetch(`${GRAPH_API_BASE}/${page.id}?fields=instagram_business_account&access_token=${accessToken}`);
    if (!igRes.ok) continue;
    const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
    if (igData.instagram_business_account?.id) return igData.instagram_business_account.id;
  }
  throw new Error("No page with a linked Instagram business account was found for this token");
}

/**
 * NOTE — known limitation: the Graph API's business_discovery field does
 * NOT expose view/play counts for accounts other than your own, so `views`
 * here is a likes-based proxy, not a real view count. Documented in the
 * project README.
 */
export function normalizeInstagramMedia(item: BusinessDiscoveryMedia, profileId: string): RawPost {
  return {
    platform: "instagram",
    profileId,
    url: item.permalink,
    postedAt: item.timestamp,
    views: item.like_count ?? 0,
    likes: item.like_count ?? 0,
    caption: item.caption ?? "",
    thumbnailUrl: item.thumbnail_url ?? item.media_url ?? "",
    videoUrl: item.media_type === "VIDEO" ? item.media_url : undefined,
  };
}

export async function fetchInstagramProfilePosts(
  targetUsername: string,
  profileId: string,
  ownBusinessAccountId: string,
  accessToken: string,
  limit = 20,
): Promise<RawPost[]> {
  const mediaFields = "caption,like_count,timestamp,media_type,media_url,permalink,thumbnail_url";
  const fields = `business_discovery.username(${targetUsername}){media.limit(${limit}){${mediaFields}}}`;
  const url = `${GRAPH_API_BASE}/${ownBusinessAccountId}?fields=${encodeURIComponent(fields)}&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram business_discovery failed for ${targetUsername}: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as BusinessDiscoveryResponse;
  const media = data.business_discovery?.media?.data ?? [];
  return media.map((item) => normalizeInstagramMedia(item, profileId));
}
