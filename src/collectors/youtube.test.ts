import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchChannelUploadIds,
  fetchVideoDetails,
  fetchYoutubeChannelPosts,
  normalizeYoutubeVideo,
  resolveChannelIdForHandle,
  searchYoutubeByKeyword,
} from "./youtube.js";

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

describe("resolveChannelIdForHandle", () => {
  it("returns the channel id from the forHandle lookup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ items: [{ id: "UC123" }] })),
    );
    await expect(resolveChannelIdForHandle("@AlexHormozi", "key")).resolves.toBe("UC123");
  });

  it("throws when no channel is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [] })));
    await expect(resolveChannelIdForHandle("@nobody", "key")).rejects.toThrow("No YouTube channel found");
  });

  it("throws when the API call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 403)));
    await expect(resolveChannelIdForHandle("@AlexHormozi", "key")).rejects.toThrow("YouTube channel lookup failed");
  });
});

describe("fetchChannelUploadIds", () => {
  it("extracts video ids from the search response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ items: [{ id: { videoId: "abc" } }, { id: { videoId: "def" } }] })),
    );
    await expect(fetchChannelUploadIds("UC123", "key")).resolves.toEqual(["abc", "def"]);
  });
});

describe("fetchVideoDetails", () => {
  it("returns an empty array without calling fetch when given no ids", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchVideoDetails([], "key")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("normalizeYoutubeVideo", () => {
  it("maps a YouTube video item to a RawPost", () => {
    const item = {
      id: "abc",
      snippet: {
        channelId: "UC123",
        channelTitle: "Alex Hormozi",
        publishedAt: "2026-09-01T00:00:00Z",
        title: "How to scale",
        thumbnails: { high: { url: "https://example.com/hi.jpg" } },
      },
      statistics: { viewCount: "1000", likeCount: "50" },
    };
    const result = normalizeYoutubeVideo(item, "hormozi");
    expect(result).toMatchObject({
      platform: "youtube",
      profileId: "hormozi",
      url: "https://www.youtube.com/watch?v=abc",
      views: 1000,
      likes: 50,
      caption: "How to scale",
      thumbnailUrl: "https://example.com/hi.jpg",
    });
  });
});

describe("fetchYoutubeChannelPosts", () => {
  it("resolves the handle, then fetches ids, then details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "UC123" }] }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: { videoId: "abc" } }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "abc",
              snippet: {
                channelId: "UC123",
                channelTitle: "Alex Hormozi",
                publishedAt: "2026-09-01T00:00:00Z",
                title: "Title",
                thumbnails: {},
              },
              statistics: { viewCount: "10", likeCount: "1" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const posts = await fetchYoutubeChannelPosts("@AlexHormozi", "hormozi", "key");
    expect(posts).toHaveLength(1);
    expect(posts[0].profileId).toBe("hormozi");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("searchYoutubeByKeyword", () => {
  it("tags results with profileId unknown and records the uploading channel", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: { videoId: "xyz" } }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "xyz",
              snippet: {
                channelId: "UC999",
                channelTitle: "Some Creator",
                publishedAt: "2026-09-01T00:00:00Z",
                title: "Viral video",
                thumbnails: {},
              },
              statistics: { viewCount: "50000", likeCount: "2000" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const posts = await searchYoutubeByKeyword("marketing digital", "key");
    expect(posts).toHaveLength(1);
    expect(posts[0].profileId).toBe("unknown");
    expect(posts[0].authorHandle).toBe("UC999");
    expect(posts[0].authorDisplayName).toBe("Some Creator");
  });
});
