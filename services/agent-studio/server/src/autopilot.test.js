import { describe, expect, it } from "vitest";
import { buildDailyPlan, dateKeyFor, randomTimeInWindow, slotAutoQueueCutoff } from "./autopilot.js";

describe("autopilot daily plan", () => {
  it("creates the three required local posting windows", () => {
    const dateKey = "2026-05-28";
    const plan = buildDailyPlan({
      dateKey,
      settings: { platform: "xhs", mode: "publish", timezone: "Asia/Shanghai" },
      topicQueue: [{ id: "topic-1", title: "手动主题", status: "queued", created_at: "2026-05-28T00:00:00.000Z" }],
      now: new Date("2026-05-28T00:05:00+08:00")
    });

    expect(plan.slots).toHaveLength(3);
    expect(plan.slots.map((slot) => slot.contentType)).toEqual(["image", "video", "image"]);
    expect(plan.slots[0].scheduledTime >= "08:00").toBe(true);
    expect(plan.slots[0].scheduledTime < "09:00").toBe(true);
    expect(plan.slots[1].scheduledTime >= "12:00").toBe(true);
    expect(plan.slots[1].scheduledTime < "13:00").toBe(true);
    expect(plan.slots[2].scheduledTime >= "20:00").toBe(true);
    expect(plan.slots[2].scheduledTime < "21:00").toBe(true);
    expect(plan.slots[0].mode).toBe("publish");
    expect(plan.slots[0].contentKind).toBe("standalone");
  });

  it("uses a flexible, user-configured set of posting windows", () => {
    const plan = buildDailyPlan({
      dateKey: "2026-05-28",
      settings: {
        platform: "xhs",
        mode: "draft",
        timezone: "Asia/Shanghai",
        windows: [
          { id: "early", label: "清晨", start: "07:00", end: "07:30", contentType: "image", direction: "insight", tone: "balanced" },
          { id: "lunch", label: "午间视频", start: "11:30", end: "12:00", contentType: "video", direction: "howto", tone: "expert" },
          { id: "night", label: "深夜", start: "22:00", end: "22:30", contentType: "image", direction: "story", tone: "human" },
          { id: "late", label: "凌晨", start: "23:30", end: "23:59", contentType: "image", direction: "insight", tone: "sharp" }
        ]
      },
      topicQueue: [],
      now: new Date("2026-05-28T00:05:00+08:00")
    });

    expect(plan.slots).toHaveLength(4);
    expect(plan.slots.map((slot) => slot.contentType)).toEqual(["image", "video", "image", "image"]);
    expect(plan.slots[0].id).toBe("2026-05-28-early");
    expect(plan.slots[0].scheduledTime >= "07:00" && plan.slots[0].scheduledTime < "07:30").toBe(true);
    expect(plan.slots[3].scheduledTime >= "23:30").toBe(true);
  });

  it("falls back to default windows when the configured list is empty", () => {
    const plan = buildDailyPlan({
      dateKey: "2026-05-28",
      settings: { platform: "xhs", mode: "draft", timezone: "Asia/Shanghai", windows: [] },
      topicQueue: [],
      now: new Date("2026-05-28T00:05:00+08:00")
    });
    expect(plan.slots).toHaveLength(3);
  });

  it("marks only explicitly queued series episodes as series content", () => {
    const plan = buildDailyPlan({
      dateKey: "2026-05-28",
      settings: { platform: "xhs", mode: "publish", timezone: "Asia/Shanghai" },
      topicQueue: [{
        id: "topic-series-1",
        title: "每天三条内容怎么排程",
        status: "locked",
        contentKind: "series",
        seriesId: "series-local-ai",
        seriesTitle: "本机 AI 内容系统从 0 到自动运转",
        seriesEpisodeId: "episode-2",
        seriesEpisodeIndex: 2,
        created_at: "2026-05-28T00:00:00.000Z"
      }],
      now: new Date("2026-05-28T00:05:00+08:00")
    });

    expect(plan.slots[0].contentKind).toBe("series");
    expect(plan.slots[0].seriesId).toBe("series-local-ai");
    expect(plan.slots[1].contentKind).toBe("series");
  });

  it("keeps random window choices stable for the same date and slot", () => {
    const a = randomTimeInWindow({ dateKey: "2026-05-28", slotId: "morning", start: "08:00", end: "09:00" });
    const b = randomTimeInWindow({ dateKey: "2026-05-28", slotId: "morning", start: "08:00", end: "09:00" });

    expect(a).toBe(b);
  });

  it("keeps exact-time slots queueable until the stale cutoff", () => {
    const slot = {
      id: "2026-06-02-noon",
      window: { start: "13:15", end: "13:15" },
      scheduledFor: "2026-06-02T05:15:00.000Z"
    };

    expect(slotAutoQueueCutoff(slot, "Asia/Shanghai", 90).toISOString()).toBe("2026-06-02T06:45:00.000Z");
  });

  it("uses the requested timezone date key", () => {
    expect(dateKeyFor(new Date("2026-05-27T16:30:00.000Z"), "Asia/Shanghai")).toBe("2026-05-28");
  });
});
