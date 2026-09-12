import { describe, expect, it } from "vitest";
import { todayIso } from "./date.js";

describe("todayIso", () => {
  it("returns the UTC calendar date portion of the given time", () => {
    expect(todayIso(new Date("2026-09-14T10:00:00.000Z"))).toBe("2026-09-14");
  });

  it("stays on the UTC date even close to midnight", () => {
    expect(todayIso(new Date("2026-09-16T23:59:00.000Z"))).toBe("2026-09-16");
  });
});
