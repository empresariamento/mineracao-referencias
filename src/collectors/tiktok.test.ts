import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTiktokProfilePosts, normalizeTikTokItem, runApifyActor, searchTiktokByHashtag } from "./tiktok.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runApifyActor", () => {
  it("posts to the run-sync-get-dataset-items endpoint and returns the items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ a: 1 }]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runApifyActor("some-actor", { foo: "bar" }, "token");
    expect(result).toEqual([{ a: 1 }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("some-actor/run-sync-get-dataset-items?token=token");
    expect(options.method).toBe("POST");
  });

  it("throws with the response body when the actor call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "quota" }, false, 429)));
    await expect(runApifyActor("some-actor", {}, "token")).rejects.toThrow("Apify actor some-actor failed");
  });
});

describe("normalizeTikTokItem", () => {
  it("maps a fixed-profile item without author fields", () => {
    const result = normalizeTikTokItem(
      { webVideoUrl: "https://tt/1", text: "caption", createTimeISO: "2026-09-01T00:00:00Z", playCount: 1000, diggCount: 50 },
      "hormozi",
    );
    expect(result.authorHandle).toBeUndefined();
    expect(result.views).toBe(1000);
  });

  it("populates authorHandle/authorDisplayName for unknown-profile items", () => {
    const result = normalizeTikTokItem({ authorMeta: { name: "@newcreator" }, webVideoUrl: "https://tt/2" }, "unknown");
    expect(result.authorHandle).toBe("@newcreator");
    expect(result.authorDisplayName).toBe("@newcreator");
  });

  it("defaults missing numeric fields to 0", () => {
    const result = normalizeTikTokItem({ webVideoUrl: "https://tt/3" }, "hormozi");
    expect(result.views).toBe(0);
    expect(result.likes).toBe(0);
  });
});

describe("fetchTiktokProfilePosts", () => {
  it("normalizes dataset items under the given profileId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ webVideoUrl: "https://tt/1", playCount: 500 }])),
    );
    const posts = await fetchTiktokProfilePosts("hormozi1", "hormozi", "token");
    expect(posts).toHaveLength(1);
    expect(posts[0].profileId).toBe("hormozi");
  });
});

describe("searchTiktokByHashtag", () => {
  it("tags results as profileId unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ webVideoUrl: "https://tt/1", authorMeta: { name: "@creator" } }])),
    );
    const posts = await searchTiktokByHashtag("marketingtips", "token");
    expect(posts[0].profileId).toBe("unknown");
    expect(posts[0].authorHandle).toBe("@creator");
  });
});
