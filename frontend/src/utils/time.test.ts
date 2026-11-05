import { describe, expect, it } from "vitest";
import { dayLabel, relativeTime } from "./time";

const NOW = new Date("2026-10-30T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("relativeTime", () => {
  it("formats recent times", () => {
    expect(relativeTime(ago(2_000), NOW)).toBe("just now");
    expect(relativeTime(ago(30_000), NOW)).toBe("30s ago");
    expect(relativeTime(ago(60_000), NOW)).toBe("1 min ago");
    expect(relativeTime(ago(2 * 60_000), NOW)).toBe("2 mins ago");
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3 hrs ago");
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe("2 days ago");
  });
  it("never goes negative for clock skew", () => {
    expect(relativeTime(new Date(NOW + 5_000).toISOString(), NOW)).toBe("just now");
  });
  it("returns an empty string for garbage", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});

describe("dayLabel", () => {
  it("labels today and yesterday", () => {
    expect(dayLabel(ago(60_000), NOW)).toBe("Today");
    expect(dayLabel(ago(86_400_000), NOW)).toBe("Yesterday");
  });
});
