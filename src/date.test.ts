import { describe, expect, it } from "vitest";
import { mondayOfCurrentWeekIso } from "./date.js";

describe("mondayOfCurrentWeekIso", () => {
  it("returns the same date when now is already a Monday", () => {
    expect(mondayOfCurrentWeekIso(new Date("2026-09-14T10:00:00.000Z"))).toBe("2026-09-14");
  });

  it("returns the preceding Monday for a mid-week date", () => {
    expect(mondayOfCurrentWeekIso(new Date("2026-09-16T23:59:00.000Z"))).toBe("2026-09-14");
  });

  it("returns the preceding Monday for a Sunday", () => {
    expect(mondayOfCurrentWeekIso(new Date("2026-09-20T00:00:00.000Z"))).toBe("2026-09-14");
  });
});
