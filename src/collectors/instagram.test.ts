import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInstagramProfilePosts, normalizeInstagramMedia, resolveOwnBusinessAccountId } from "./instagram.js";

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

describe("resolveOwnBusinessAccountId", () => {
  it("returns the first page's linked instagram business account id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "page1" }, { id: "page2" }] }))
      .mockResolvedValueOnce(jsonResponse({ instagram_business_account: { id: "ig123" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveOwnBusinessAccountId("token")).resolves.toBe("ig123");
  });

  it("skips pages without a linked instagram account", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "page1" }, { id: "page2" }] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ instagram_business_account: { id: "ig456" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveOwnBusinessAccountId("token")).resolves.toBe("ig456");
  });

  it("throws when no page has a linked instagram account", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "page1" }] }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveOwnBusinessAccountId("token")).rejects.toThrow("No page with a linked Instagram business account");
  });
});

describe("normalizeInstagramMedia", () => {
  it("maps a photo item, leaving videoUrl undefined", () => {
    const result = normalizeInstagramMedia(
      { caption: "hi", like_count: 10, timestamp: "2026-09-01T00:00:00Z", media_type: "IMAGE", media_url: "https://x/img.jpg", permalink: "https://x/p" },
      "hormozi",
    );
    expect(result.videoUrl).toBeUndefined();
    expect(result.views).toBe(10);
    expect(result.likes).toBe(10);
  });

  it("maps a video item, populating videoUrl from media_url", () => {
    const result = normalizeInstagramMedia(
      { like_count: 5, timestamp: "2026-09-01T00:00:00Z", media_type: "VIDEO", media_url: "https://x/vid.mp4", permalink: "https://x/p" },
      "hormozi",
    );
    expect(result.videoUrl).toBe("https://x/vid.mp4");
  });
});

describe("fetchInstagramProfilePosts", () => {
  it("parses business_discovery media into RawPosts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          business_discovery: {
            media: {
              data: [{ caption: "a", like_count: 20, timestamp: "2026-09-01T00:00:00Z", media_type: "IMAGE", permalink: "https://x/1" }],
            },
          },
        }),
      ),
    );
    const posts = await fetchInstagramProfilePosts("hormozi", "hormozi", "ig123", "token");
    expect(posts).toHaveLength(1);
    expect(posts[0].platform).toBe("instagram");
  });

  it("throws with the response body when the call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad token" }, false, 400)));
    await expect(fetchInstagramProfilePosts("hormozi", "hormozi", "ig123", "token")).rejects.toThrow(
      "Instagram business_discovery failed",
    );
  });
});
