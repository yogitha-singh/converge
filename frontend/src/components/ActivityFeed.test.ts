import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "../api/workspaces";
import { groupByDay } from "./ActivityFeed";

const NOW = new Date("2026-10-30T15:00:00").getTime();
const entry = (id: string, iso: string): ActivityEntry => ({
  id, action: "document.edited", description: "Edited", actor_id: "u", actor_name: "Ada", document_id: null, created_at: iso,
});

describe("groupByDay", () => {
  it("groups consecutive entries by calendar day, newest first", () => {
    const groups = groupByDay(
      [
        entry("1", "2026-10-30T14:00:00"),
        entry("2", "2026-10-30T09:00:00"),
        entry("3", "2026-10-29T18:00:00"),
      ],
      NOW
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["1", "2"]);
    expect(groups[1].entries.map((e) => e.id)).toEqual(["3"]);
  });

  it("returns nothing for an empty feed", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
