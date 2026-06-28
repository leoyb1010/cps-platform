import { describe, expect, it } from "vitest";
import { buildEngagementMonitorTask, classifyEngagementItem, draftReplyForItem, normalizeEngagementSettings } from "./engagement.js";

describe("engagement monitor policy", () => {
  it("keeps private messages draft-only by default", () => {
    const settings = normalizeEngagementSettings({}, { platform: "xhs", accountLabel: "Leo" });
    expect(settings.allowMessageAutoReply).toBe(false);

    const draft = draftReplyForItem({ channel: "message", text: "想问下怎么选本地模型硬件" }, settings);
    expect(draft).toContain("人工确认");
  });

  it("flags sensitive comments for human review", () => {
    const item = classifyEngagementItem({ channel: "comment", text: "把你的微信和投资建议发我" });
    expect(item.risk).toBe("high");
    expect(item.requiresHuman).toBe(true);
  });

  it("builds a Codex browser runbook that records back into the product", () => {
    const task = buildEngagementMonitorTask({
      platform: "xhs",
      accountLabel: "Leo",
      monitorComments: true,
      monitorMessages: true,
      allowCommentAutoReply: true,
      allowMessageAutoReply: false,
      maxRepliesPerRun: 6
    });

    expect(task.type).toBe("browser_engagement_monitor_task");
    expect(task.requiresLoggedInBrowser).toBe(true);
    expect(task.engagement.recordEndpoint).toBe("POST /api/engagement/record");
    expect(task.replyPolicy.allowMessageAutoReply).toBe(false);
    expect(task.browserSteps.join("\n")).toContain("真实登录浏览器");
  });
});
