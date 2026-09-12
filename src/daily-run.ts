#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { todayIso } from "./date.js";
import { fetchYoutubeChannelPosts, searchYoutubeByKeyword } from "./collectors/youtube.js";
import { fetchInstagramProfilePosts } from "./collectors/instagram.js";
import { fetchTiktokProfilePosts, searchTiktokByHashtag } from "./collectors/tiktok.js";
import { buildDailySelection, collectViralHits, scoreNicheSearchHits, scoreProfileCandidates } from "./pipeline.js";
import { detectSuggestions, loadProfiles } from "./profiles.js";
import { transcribeAll } from "./transcribe.js";
import type { DailyRunResult, RawPost } from "./types.js";

const NICHE_KEYWORDS = ["marketing digital", "how to get clients online", "online business tips"];
const NICHE_HASHTAGS = ["marketingtips", "onlinebusiness"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const profiles = loadProfiles();
  const sourceErrors: DailyRunResult["sourceErrors"] = [];
  const profileHistories: RawPost[] = [];
  const nicheHits: RawPost[] = [];

  for (const profile of profiles) {
    if (profile.handles.youtube) {
      try {
        profileHistories.push(
          ...(await fetchYoutubeChannelPosts(profile.handles.youtube, profile.id, requireEnv("YOUTUBE_API_KEY"))),
        );
      } catch (err) {
        sourceErrors.push({ platform: "youtube", message: `${profile.id}: ${(err as Error).message}` });
      }
    }
    if (profile.handles.instagram) {
      try {
        profileHistories.push(
          ...(await fetchInstagramProfilePosts(
            profile.handles.instagram,
            profile.id,
            requireEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
            requireEnv("META_ACCESS_TOKEN"),
          )),
        );
      } catch (err) {
        sourceErrors.push({ platform: "instagram", message: `${profile.id}: ${(err as Error).message}` });
      }
    }
    if (profile.handles.tiktok) {
      try {
        profileHistories.push(
          ...(await fetchTiktokProfilePosts(profile.handles.tiktok, profile.id, requireEnv("APIFY_TOKEN"))),
        );
      } catch (err) {
        sourceErrors.push({ platform: "tiktok", message: `${profile.id}: ${(err as Error).message}` });
      }
    }
  }

  for (const keyword of NICHE_KEYWORDS) {
    try {
      nicheHits.push(...(await searchYoutubeByKeyword(keyword, requireEnv("YOUTUBE_API_KEY"))));
    } catch (err) {
      sourceErrors.push({ platform: "youtube", message: `search "${keyword}": ${(err as Error).message}` });
    }
  }
  for (const hashtag of NICHE_HASHTAGS) {
    try {
      nicheHits.push(...(await searchTiktokByHashtag(hashtag, requireEnv("APIFY_TOKEN"))));
    } catch (err) {
      sourceErrors.push({ platform: "tiktok", message: `hashtag #${hashtag}: ${(err as Error).message}` });
    }
  }

  const profileScored = scoreProfileCandidates(profileHistories);
  const nicheScored = scoreNicheSearchHits(nicheHits);
  const top = buildDailySelection(profileScored, nicheScored);
  const analyzed = await transcribeAll(top, requireEnv("GROQ_API_KEY"));
  const suggestedProfiles = detectSuggestions(collectViralHits(nicheHits), profiles);

  const result: DailyRunResult = {
    runDate: todayIso(),
    items: analyzed,
    sourceErrors,
    suggestedProfiles,
  };

  const outPath = path.join(process.cwd(), "daily-run-output.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${analyzed.length} items (${sourceErrors.length} source errors) to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
