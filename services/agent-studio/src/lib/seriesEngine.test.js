import { describe, expect, it } from "vitest";
import { buildSeriesContext, buildSeriesEpisodePack, normalizeSeriesProfile } from "./seriesEngine.js";

describe("seriesEngine", () => {
  it("normalizes a series profile with a stable visual style", () => {
    const profile = normalizeSeriesProfile({
      title: "本机 AI 内容系统从 0 到自动运转",
      visualStyle: "admin-tabler",
      seedTopics: ["每天三条内容怎么排程", "", "评论区如何变成下一期选题"]
    });

    expect(profile.platform).toBe("xhs");
    expect(profile.visualStyle).toBe("admin-tabler");
    expect(profile.seedTopics).toEqual(["每天三条内容怎么排程", "评论区如何变成下一期选题"]);
  });

  it("builds an episode that connects to the previous one and invites discussion", () => {
    const series = {
      id: "series-local-ai",
      title: "本机 AI 内容系统从 0 到自动运转",
      description: "连续拆解本机 Agent 内容系统。",
      platform: "xhs",
      direction: "insight",
      tone: "balanced",
      visualStyle: "html5up-editorial",
      episodes: [
        {
          id: "episode-1",
          index: 1,
          title: "为什么要本机运行内容系统",
          recap: "本机运行的核心价值是登录态、文件和浏览器都在自己机器上。",
          status: "published"
        }
      ]
    };

    const context = buildSeriesContext(series, "每天三条内容怎么排程", "承接评论区排程问题");
    const pack = buildSeriesEpisodePack({
      series,
      topic: "每天三条内容怎么排程",
      notes: "承接评论区排程问题",
      generation: 1
    });

    expect(context.episodeNo).toBe(2);
    expect(context.previousLine).toContain("为什么要本机运行内容系统");
    expect(pack.series.episodeNo).toBe(2);
    expect(pack.series.previousEpisodeId).toBe("episode-1");
    expect(pack.series.visualStyle).toBe("html5up-editorial");
    expect(pack.cards[0].body).toContain("接上上一期");
    expect(pack.platformCopy.xhs.body).toContain("上一期");
    expect(pack.platformCopy.xhs.body).toContain("评论区");
    expect(pack.platformCopy.xhs.tags.some((tag) => tag.includes("本机AI内容系统"))).toBe(true);
  });
});
