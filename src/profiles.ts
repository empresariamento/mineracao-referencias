import fs from "node:fs";
import path from "node:path";
import type { Platform, Profile, SuggestedProfile } from "./types.js";

const DEFAULT_PROFILES_PATH = path.join(process.cwd(), "data", "profiles.json");

/** A niche-search hit outside the fixed profile bank, seen once. */
export interface ViralHit {
  platform: Platform;
  handle: string;
  displayName: string;
}

/** How many times a handle must show up across this run's niche searches
 * before it's worth surfacing as a suggestion. */
const SUGGESTION_THRESHOLD = 2;

export function parseProfiles(json: string): Profile[] {
  return JSON.parse(json) as Profile[];
}

export function loadProfiles(filePath: string = DEFAULT_PROFILES_PATH): Profile[] {
  return parseProfiles(fs.readFileSync(filePath, "utf-8"));
}

/** Counts repeated niche-search hits that aren't already in the fixed bank,
 * and returns the ones seen at least SUGGESTION_THRESHOLD times. */
export function detectSuggestions(hits: ViralHit[], knownProfiles: Profile[]): SuggestedProfile[] {
  const knownHandles = new Set(
    knownProfiles.flatMap((profile) =>
      Object.values(profile.handles)
        .filter((handle): handle is string => Boolean(handle))
        .map((handle) => handle.toLowerCase()),
    ),
  );

  const counts = new Map<string, SuggestedProfile>();
  for (const hit of hits) {
    if (knownHandles.has(hit.handle.toLowerCase())) continue;
    const key = `${hit.platform}:${hit.handle.toLowerCase()}`;
    const existing = counts.get(key);
    if (existing) {
      existing.occurrences += 1;
    } else {
      counts.set(key, {
        profileId: key,
        displayName: hit.displayName,
        platform: hit.platform,
        handle: hit.handle,
        occurrences: 1,
      });
    }
  }

  return Array.from(counts.values()).filter((suggestion) => suggestion.occurrences >= SUGGESTION_THRESHOLD);
}
