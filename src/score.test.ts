import { describe, expect, it } from "vitest";
import { averageViews, scoreAgainstNicheAverage, scoreAgainstProfileHistory, selectTop } from "./score.js";
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

describe("averageViews", () => {
  it("returns 0 for an empty list", () => {
    expect(averageViews([])).toBe(0);
  });

  it("returns the mean of views across posts", () => {
    const posts = [post({ views: 100 }), post({ views: 200 }), post({ views: 300 })];
    expect(averageViews(posts)).toBe(200);
  });
});

describe("scoreAgainstProfileHistory", () => {
  it("marks a post insufficient-history when fewer than 5 history posts exist", () => {
    const history = [post({ views: 100 }), post({ views: 100 })];
    const result = scoreAgainstProfileHistory(post({ views: 500 }), history);
    expect(result.scoreBasis).toBe("insufficient-history");
    expect(Number.isNaN(result.score)).toBe(true);
  });

  it("scores views against the history average when there is enough history", () => {
    const history = Array.from({ length: 5 }, () => post({ views: 100 }));
    const result = scoreAgainstProfileHistory(post({ views: 400 }), history);
    expect(result.scoreBasis).toBe("profile-history");
    expect(result.score).toBe(4);
  });

  it("marks insufficient-history when the history average is zero", () => {
    const history = Array.from({ length: 5 }, () => post({ views: 0 }));
    const result = scoreAgainstProfileHistory(post({ views: 500 }), history);
    expect(result.scoreBasis).toBe("insufficient-history");
    expect(Number.isNaN(result.score)).toBe(true);
  });
});

describe("scoreAgainstNicheAverage", () => {
  it("marks insufficient-history when the niche average is zero", () => {
    const result = scoreAgainstNicheAverage(post({ views: 500 }), 0);
    expect(result.scoreBasis).toBe("insufficient-history");
    expect(Number.isNaN(result.score)).toBe(true);
  });

  it("scores views against a given niche average", () => {
    const result = scoreAgainstNicheAverage(post({ views: 900 }), 300);
    expect(result.scoreBasis).toBe("niche-average");
    expect(result.score).toBe(3);
  });
});

describe("selectTop", () => {
  function scored(overrides: Partial<ScoredPost> = {}): ScoredPost {
    return { ...post(), score: 1, scoreBasis: "profile-history", ...overrides };
  }

  it("sorts ranked posts by score descending", () => {
    const posts = [scored({ score: 2, url: "a" }), scored({ score: 5, url: "b" }), scored({ score: 1, url: "c" })];
    const result = selectTop(posts, 10);
    expect(result.map((p) => p.url)).toEqual(["b", "a", "c"]);
  });

  it("places unranked (NaN score) posts after all ranked posts", () => {
    const posts = [
      scored({ score: NaN, scoreBasis: "insufficient-history", url: "unranked" }),
      scored({ score: 1, url: "ranked" }),
    ];
    const result = selectTop(posts, 10);
    expect(result.map((p) => p.url)).toEqual(["ranked", "unranked"]);
  });

  it("respects the limit", () => {
    const posts = [scored({ score: 1 }), scored({ score: 2 }), scored({ score: 3 })];
    expect(selectTop(posts, 2)).toHaveLength(2);
  });
});
