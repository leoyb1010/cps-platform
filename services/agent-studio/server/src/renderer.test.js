import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderMotionHtml } from "../../src/lib/visualEngine.js";
import { exportMotionVideo } from "./renderer.js";

describe("exportMotionVideo", () => {
  it("exports distinct scene frames instead of freezing on one frame", async () => {
    const pack = {
      id: "renderer-motion-regression",
      title: "Motion regression",
      core: "HTML video scene export",
      videoFrames: [
        { time: "00:00", shot: "One", overlay: "第一屏", voice: "scene one", visual: "first" },
        { time: "00:01", shot: "Two", overlay: "第二屏", voice: "scene two", visual: "second" },
        { time: "00:02", shot: "Three", overlay: "第三屏", voice: "scene three", visual: "third" }
      ]
    };
    const outDir = path.resolve("server/exports/videos", pack.id);
    await rm(outDir, { recursive: true, force: true });

    try {
      const html = renderMotionHtml(pack, {});
      const result = await exportMotionVideo({ pack, platform: "xhs", html, duration: 3, fps: 1 });
      const hashes = await Promise.all(
        [1, 2, 3].map(async (index) => {
          const frame = await readFile(path.join(result.frameDir, `frame-${String(index).padStart(5, "0")}.png`));
          return createHash("sha256").update(frame).digest("hex");
        })
      );

      expect(new Set(hashes).size).toBe(3);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 30000);
});
