import { describe, expect, it } from "vitest";
import { buildWeeklySelection, collectViralHits, isWithinDays, scoreNicheSearchHits, scoreProfileCandidates } from "./pipeline.js";
import type { RawPost, ScoredPost } from "./types.js";

function post(overrides: Partial<RawPost> = {}): RawPost {
  return {
    platform: "youtube",
    profileId: "hormozi",
    url: "https://example.com/1",
    postedAt: "2026-09-01T00:00:00.000Z",
    views: 1000,
    likes: 100,
    caption: "test",
    thumbnailUrl: "https://example.com/thumb.jpg",
    ...overrides,
  };
}

const NOW = new Date("2026-09-10T00:00:00.000Z");

describe("isWithinDays", () => {
  it("is true for a date within the window", () => {
    expect(isWithinDays("2026-09-08T00:00:00.000Z", 7, NOW)).toBe(true);
  });

  it("is false for a date outside the window", () => {
    expect(isWithinDays("2026-08-01T00:00:00.000Z", 7, NOW)).toBe(false);
  });
});

describe("scoreProfileCandidates", () => {
  it("only scores posts within the recent window, against the rest of the history", () => {
    const oldHistory = Array.from({ length: 6 }, (_, i) =>
      post({ url: `old-${i}`, postedAt: "2026-08-01T00:00:00.000Z", views: 100 }),
    );
    const recentCandidate = post({ url: "recent", postedAt: "2026-09-09T00:00:00.000Z", views: 800 });
    const fullHistory = [...oldHistory, recentCandidate];

    const result = scoreProfileCandidates(fullHistory, 7, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("recent");
    expect(result[0].score).toBe(8);
    expect(result[0].scoreBasis).toBe("profile-history");
  });

  it("excludes the candidate itself from its own baseline average", () => {
    // 6 recent posts with view counts 100,100,100,100,100,500 — scoring the
    // 500 one should divide by the average of the other five (100), not all six.
    const posts = [100, 100, 100, 100, 100, 500].map((views, i) =>
      post({ url: `p${i}`, postedAt: "2026-09-09T00:00:00.000Z", views }),
    );
    const result = scoreProfileCandidates(posts, 7, NOW);
    const scored500 = result.find((p) => p.url === "p5")!;
    expect(scored500.score).toBe(5);
  });
});

describe("scoreNicheSearchHits", () => {
  it("scores each hit against the batch average", () => {
    const hits = [post({ url: "a", views: 100 }), post({ url: "b", views: 900 })];
    const result = scoreNicheSearchHits(hits);
    expect(result.find((p) => p.url === "b")!.score).toBe(1.8);
    expect(result.every((p) => p.scoreBasis === "niche-average")).toBe(true);
  });
});

describe("buildWeeklySelection", () => {
  function scored(overrides: Partial<ScoredPost> = {}): ScoredPost {
    return { ...post(), score: 1, scoreBasis: "profile-history", ...overrides };
  }

  it("merges profile and niche scored posts, ranked first", () => {
    const profileScored = [scored({ score: 3, url: "profile-hit" })];
    const nicheScored = [scored({ score: 9, url: "niche-hit", scoreBasis: "niche-average" })];
    const result = buildWeeklySelection(profileScored, nicheScored, 10);
    expect(result.map((p) => p.url)).toEqual(["niche-hit", "profile-hit"]);
  });
});

describe("collectViralHits", () => {
  it("extracts handle/displayName from unknown-profile posts with an authorHandle", () => {
    const posts = [
      post({ profileId: "unknown", authorHandle: "@new", authorDisplayName: "New Creator" }),
      post({ profileId: "hormozi" }), // fixed profile, should be ignored
      post({ profileId: "unknown", authorHandle: undefined }), // no author info, should be ignored
    ];
    const hits = collectViralHits(posts);
    expect(hits).toEqual([{ platform: "youtube", handle: "@new", displayName: "New Creator" }]);
  });
});
