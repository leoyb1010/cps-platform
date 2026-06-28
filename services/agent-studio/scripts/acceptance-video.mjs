// Quick local preview for HTML→video output. Renders one motion MP4 + frames so you can eyeball
// content density, layout fill, theme and motion before wiring a topic into Autopilot.
//   node scripts/acceptance-video.mjs "<topic>" "<style>" <durationSeconds> <fps>
import { buildPack } from "../src/lib/contentEngine.js";
import { buildVisualPlan, renderMotionHtml } from "../src/lib/visualEngine.js";
import { exportMotionVideo, closeSharedBrowser } from "../server/src/renderer.js";

const topic = process.argv[2] || "Mac 统一内存对比 NVIDIA 显卡在本地模型部署的差异";
const style = process.argv[3] || "baoyu-bold-warning";
const duration = Number(process.argv[4] || 14);
const fps = Number(process.argv[5] || 24);

const pack = buildPack(topic, "insight", "balanced", 1, "");
pack.id = `acceptance-${Date.now()}`;
const plan = buildVisualPlan(pack, "xhs", "motion-video", { ratio: "9:16", style });
const html = renderMotionHtml(pack, plan);

console.log("scenes(videoFrames):", (pack.videoFrames || []).length, "style:", style, "template:", plan.templates["motion-video"]);
const video = await exportMotionVideo({ pack, platform: "xhs", html, duration, fps });
console.log(JSON.stringify({ videoPath: video.videoPath, thumbnailPath: video.thumbnailPath, frameDir: video.frameDir, frames: video.frames }, null, 2));
await closeSharedBrowser();
