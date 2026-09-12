import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractYoutubeVideoId,
  fetchYoutubeTimedText,
  transcribeAll,
  transcribePost,
  transcribeWithGroqWhisper,
} from "./transcribe.js";
import type { ScoredPost } from "./types.js";

function post(overrides: Partial<ScoredPost> = {}): ScoredPost {
  return {
    platform: "youtube",
    profileId: "hormozi",
    url: "https://www.youtube.com/watch?v=abcDEFghi12",
    postedAt: "2026-09-01T00:00:00.000Z",
    views: 1000,
    likes: 100,
    caption: "test",
    thumbnailUrl: "https://example.com/thumb.jpg",
    score: 2,
    scoreBasis: "profile-history",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractYoutubeVideoId", () => {
  it("extracts the id from a watch url", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=abcDEFghi12")).toBe("abcDEFghi12");
  });

  it("extracts the id from a youtu.be short url", () => {
    expect(extractYoutubeVideoId("https://youtu.be/abcDEFghi12")).toBe("abcDEFghi12");
  });

  it("returns null for a url without a recognizable video id", () => {
    expect(extractYoutubeVideoId("https://example.com/video")).toBeNull();
  });
});

describe("fetchYoutubeTimedText", () => {
  it("joins caption segments into one string", async () => {
    const body = JSON.stringify({ events: [{ segs: [{ utf8: "Hello " }, { utf8: "world" }] }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => body }));
    await expect(fetchYoutubeTimedText("abc")).resolves.toBe("Hello world");
  });

  it("returns null when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: async () => "" }));
    await expect(fetchYoutubeTimedText("abc")).resolves.toBeNull();
  });

  it("returns null when the response body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
    await expect(fetchYoutubeTimedText("abc")).resolves.toBeNull();
  });
});

describe("transcribeWithGroqWhisper", () => {
  it("downloads the audio and posts it to Groq, returning the transcript text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["audio-bytes"]) })
      .mockResolvedValueOnce({ ok: true, text: async () => "transcribed text" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribeWithGroqWhisper("https://example.com/a.mp4", "groq-key")).resolves.toBe("transcribed text");
  });

  it("throws when the audio download fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(transcribeWithGroqWhisper("https://example.com/a.mp4", "groq-key")).rejects.toThrow(
      "Failed to download audio",
    );
  });

  it("throws when the Groq call fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["audio-bytes"]) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "server error" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribeWithGroqWhisper("https://example.com/a.mp4", "groq-key")).rejects.toThrow(
      "Groq transcription failed",
    );
  });
});

describe("transcribePost", () => {
  it("uses YouTube captions for a youtube post", async () => {
    const body = JSON.stringify({ events: [{ segs: [{ utf8: "captioned" }] }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => body }));
    const result = await transcribePost(post(), "groq-key");
    expect(result.transcriptSource).toBe("youtube-captions");
    expect(result.transcript).toBe("captioned");
  });

  it("marks unavailable when a youtube post has no captions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
    const result = await transcribePost(post(), "groq-key");
    expect(result.transcriptSource).toBe("unavailable");
  });

  it("uses Groq Whisper for a non-youtube post with a videoUrl", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["audio"]) })
      .mockResolvedValueOnce({ ok: true, text: async () => "whisper text" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await transcribePost(post({ platform: "tiktok", videoUrl: "https://tt/video.mp4" }), "groq-key");
    expect(result.transcriptSource).toBe("whisper");
    expect(result.transcript).toBe("whisper text");
  });

  it("marks unavailable for a non-youtube post without a videoUrl", async () => {
    const result = await transcribePost(post({ platform: "instagram", videoUrl: undefined }), "groq-key");
    expect(result.transcriptSource).toBe("unavailable");
  });

  it("marks unavailable when Whisper transcription throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await transcribePost(post({ platform: "tiktok", videoUrl: "https://tt/video.mp4" }), "groq-key");
    expect(result.transcriptSource).toBe("unavailable");
  });
});

describe("transcribeAll", () => {
  it("transcribes every post in order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
    const results = await transcribeAll([post({ url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }), post({ url: "https://www.youtube.com/watch?v=bbbbbbbbbbb" })], "groq-key");
    expect(results).toHaveLength(2);
  });
});
