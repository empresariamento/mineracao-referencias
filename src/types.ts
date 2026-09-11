export type Platform = "youtube" | "instagram" | "tiktok";

export interface Profile {
  id: string;
  displayName: string;
  handles: Partial<Record<Platform, string>>;
  fixed: boolean;
  /** True once the user has confirmed the handles are correct in the Perfis tab. */
  reviewed: boolean;
}

export interface RawPost {
  platform: Platform;
  /** Matches a Profile.id from the fixed bank, or "unknown" for a niche-search
   * hit that isn't tied to a fixed profile. */
  profileId: string;
  /** Populated only when profileId is "unknown" — used for suggestion detection. */
  authorHandle?: string;
  authorDisplayName?: string;
  url: string;
  postedAt: string;
  views: number;
  likes: number;
  caption: string;
  thumbnailUrl: string;
  /** A direct, fetchable video file URL, when the source exposes one — needed
   * for Whisper transcription of non-YouTube posts. */
  videoUrl?: string;
}

export type ScoreBasis = "profile-history" | "niche-average" | "insufficient-history";

export interface ScoredPost extends RawPost {
  score: number;
  scoreBasis: ScoreBasis;
}

export type TranscriptSource = "youtube-captions" | "whisper" | "unavailable";

export interface AnalyzedPost extends ScoredPost {
  transcript?: string;
  transcriptSource: TranscriptSource;
}

export interface SuggestedProfile {
  profileId: string;
  displayName: string;
  platform: Platform;
  handle: string;
  occurrences: number;
}

export interface WeeklyRunResult {
  weekOf: string;
  items: AnalyzedPost[];
  sourceErrors: { platform: Platform; message: string }[];
  suggestedProfiles: SuggestedProfile[];
}
