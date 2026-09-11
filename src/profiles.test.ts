import { describe, expect, it } from "vitest";
import { detectSuggestions, parseProfiles, type ViralHit } from "./profiles.js";
import type { Profile } from "./types.js";

describe("parseProfiles", () => {
  it("parses a JSON array of profiles", () => {
    const json = JSON.stringify([
      { id: "hormozi", displayName: "Alex Hormozi", handles: { youtube: "@AlexHormozi" }, fixed: true, reviewed: false },
    ]);
    const profiles = parseProfiles(json);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe("hormozi");
  });
});

describe("detectSuggestions", () => {
  const known: Profile[] = [
    { id: "hormozi", displayName: "Alex Hormozi", handles: { youtube: "@AlexHormozi" }, fixed: true, reviewed: true },
  ];

  it("ignores handles already in the fixed bank", () => {
    const hits: ViralHit[] = [
      { platform: "youtube", handle: "@AlexHormozi", displayName: "Alex Hormozi" },
      { platform: "youtube", handle: "@AlexHormozi", displayName: "Alex Hormozi" },
    ];
    expect(detectSuggestions(hits, known)).toEqual([]);
  });

  it("ignores a handle seen only once", () => {
    const hits: ViralHit[] = [{ platform: "tiktok", handle: "@newcreator", displayName: "New Creator" }];
    expect(detectSuggestions(hits, known)).toEqual([]);
  });

  it("surfaces a handle seen at least twice, with an occurrence count", () => {
    const hits: ViralHit[] = [
      { platform: "tiktok", handle: "@newcreator", displayName: "New Creator" },
      { platform: "tiktok", handle: "@newcreator", displayName: "New Creator" },
      { platform: "tiktok", handle: "@newcreator", displayName: "New Creator" },
    ];
    const result = detectSuggestions(hits, known);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ handle: "@newcreator", platform: "tiktok", occurrences: 3 });
  });

  it("keeps different platforms for the same handle text separate", () => {
    const hits: ViralHit[] = [
      { platform: "tiktok", handle: "@dupe", displayName: "Dupe" },
      { platform: "tiktok", handle: "@dupe", displayName: "Dupe" },
      { platform: "youtube", handle: "@dupe", displayName: "Dupe" },
    ];
    const result = detectSuggestions(hits, known);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("tiktok");
  });
});
