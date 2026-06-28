import { describe, expect, it } from "vitest";
import {
  AutopilotTopicRequestSchema,
  CommentMaintenanceRequestSchema,
  EngagementRecordRequestSchema,
  EngagementSettingsRequestSchema,
  SeriesCreateRequestSchema,
  SeriesEpisodeQueueRequestSchema,
  SeriesEpisodeRequestSchema,
  TraceRequestSchema
} from "./schema.js";

describe("CommentMaintenanceRequestSchema publishUrl", () => {
  it("accepts an empty publishUrl (empty form field)", () => {
    const parsed = CommentMaintenanceRequestSchema.safeParse({ platform: "xhs", publishUrl: "" });
    expect(parsed.success).toBe(true);
  });

  it("defaults publishUrl to empty when omitted", () => {
    const parsed = CommentMaintenanceRequestSchema.safeParse({ platform: "xhs" });
    expect(parsed.success).toBe(true);
    expect(parsed.data.publishUrl).toBe("");
  });

  it("accepts a valid publishUrl", () => {
    const parsed = CommentMaintenanceRequestSchema.safeParse({ platform: "xhs", publishUrl: "https://example.com/post/1" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a malformed publishUrl", () => {
    const parsed = CommentMaintenanceRequestSchema.safeParse({ platform: "xhs", publishUrl: "not-a-url" });
    expect(parsed.success).toBe(false);
  });
});

describe("TraceRequestSchema optional urls", () => {
  it("accepts empty postUrl/draftUrl", () => {
    const parsed = TraceRequestSchema.safeParse({ taskId: "t1", status: "completed", postUrl: "", draftUrl: "" });
    expect(parsed.success).toBe(true);
  });
});

describe("Autopilot topic schemas", () => {
  it("defaults normal topics to standalone and accepts explicit series markers", () => {
    const normal = AutopilotTopicRequestSchema.safeParse({ title: "AI 时代高配 MacBook 能做什么" });
    expect(normal.success).toBe(true);
    expect(normal.data.contentKind).toBe("standalone");
    expect(normal.data.localAssets).toEqual([]);

    const series = AutopilotTopicRequestSchema.safeParse({
      title: "每天三条内容怎么排程",
      contentKind: "series",
      seriesId: "series-local-ai",
      seriesEpisodeId: "episode-2",
      seriesEpisodeIndex: 2,
      localAssets: ["/tmp/product-shot.png"]
    });
    expect(series.success).toBe(true);
    expect(series.data.contentKind).toBe("series");
    expect(series.data.localAssets).toEqual(["/tmp/product-shot.png"]);
  });
});

describe("Engagement schemas", () => {
  it("accepts safe monitor settings", () => {
    const parsed = EngagementSettingsRequestSchema.safeParse({
      enabled: true,
      platform: "xhs",
      accountLabel: "Leo",
      monitorComments: true,
      monitorMessages: true,
      allowCommentAutoReply: true,
      allowMessageAutoReply: false,
      checkIntervalMinutes: 30
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts comment and message records", () => {
    const parsed = EngagementRecordRequestSchema.safeParse({
      taskId: "engagement-xhs-1",
      status: "completed",
      platform: "xhs",
      items: [
        { channel: "comment", author: "u1", text: "这个怎么选？", risk: "medium", requiresHuman: true },
        { channel: "message", author: "u2", text: "想了解更多", replied: false }
      ]
    });

    expect(parsed.success).toBe(true);
  });
});

describe("Series schemas", () => {
  it("accepts a Xiaohongshu series profile", () => {
    const parsed = SeriesCreateRequestSchema.safeParse({
      title: "本机 AI 内容系统从 0 到自动运转",
      platform: "xhs",
      direction: "insight",
      tone: "balanced",
      visualStyle: "html5up-editorial",
      seedTopics: ["每天三条内容怎么排程", "评论区如何变成下一期选题"]
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts planned episodes and high priority queue requests", () => {
    expect(SeriesEpisodeRequestSchema.safeParse({ topic: "每天三条内容怎么排程", notes: "承接评论区问题" }).success).toBe(true);
    expect(SeriesEpisodeQueueRequestSchema.safeParse({ status: "queued", priority: "high" }).success).toBe(true);
  });
});
