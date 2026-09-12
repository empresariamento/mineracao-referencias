import type { AnalyzedPost, ScoredPost } from "./types.js";

const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

export function extractYoutubeVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

/**
 * Fetches a YouTube video's public timed-text track (captions, including
 * auto-generated ones) via the unofficial but widely used timedtext
 * endpoint. NOT the official Data API — the official captions.download
 * endpoint requires OAuth as the video's owner, which doesn't work for
 * third-party channels. This endpoint can change without notice; a null
 * result degrades to transcriptSource "unavailable" rather than failing
 * the whole run.
 */
export async function fetchYoutubeTimedText(videoId: string, lang = "en"): Promise<string | null> {
  const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = await res.text();
  if (!body.trim()) return null;
  const data = JSON.parse(body) as { events?: { segs?: { utf8?: string }[] }[] };
  const text = (data.events ?? [])
    .flatMap((event) => event.segs ?? [])
    .map((seg) => seg.utf8 ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

export async function transcribeWithGroqWhisper(audioUrl: string, groqApiKey: string): Promise<string> {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
  const audioBlob = await audioRes.blob();
  const form = new FormData();
  form.append("file", audioBlob, "audio.mp4");
  form.append("model", GROQ_WHISPER_MODEL);
  form.append("response_format", "text");
  const res = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${groqApiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq transcription failed: ${res.status} ${await res.text()}`);
  return (await res.text()).trim();
}

export async function transcribePost(post: ScoredPost, groqApiKey: string): Promise<AnalyzedPost> {
  if (post.platform === "youtube") {
    const videoId = extractYoutubeVideoId(post.url);
    const transcript = videoId ? await fetchYoutubeTimedText(videoId).catch(() => null) : null;
    return transcript
      ? { ...post, transcript, transcriptSource: "youtube-captions" }
      : { ...post, transcriptSource: "unavailable" };
  }
  if (post.videoUrl) {
    try {
      const transcript = await transcribeWithGroqWhisper(post.videoUrl, groqApiKey);
      return { ...post, transcript, transcriptSource: "whisper" };
    } catch {
      return { ...post, transcriptSource: "unavailable" };
    }
  }
  return { ...post, transcriptSource: "unavailable" };
}

export async function transcribeAll(posts: ScoredPost[], groqApiKey: string): Promise<AnalyzedPost[]> {
  const results: AnalyzedPost[] = [];
  for (const post of posts) {
    results.push(await transcribePost(post, groqApiKey));
  }
  return results;
}
