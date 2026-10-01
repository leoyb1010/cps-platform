import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExportSegment } from "./renderSafety.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportRoot = process.env.AGENT_STUDIO_EXPORTS_DIR ? path.resolve(process.env.AGENT_STUDIO_EXPORTS_DIR) : path.join(serverRoot, "exports");

function safeName(value) {
  return safeExportSegment(value);
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

async function loadProducer() {
  try {
    return await import("@hyperframes/producer");
  } catch (error) {
    throw new Error(`Hyperframes producer unavailable: ${error.message || String(error)}`);
  }
}

export async function exportHyperframesMotionVideo({
  pack,
  platform = "xhs",
  html,
  duration = 14,
  fps = 24
}) {
  const { createRenderJob, executeRenderJob } = await loadProducer();
  const outDir = path.join(exportRoot, "videos", safeName(pack.id));
  await mkdir(outDir, { recursive: true });

  const htmlPath = path.join(outDir, `${safeName(platform)}-motion-video.html`);
  const indexPath = path.join(outDir, "index.html");
  const videoPath = path.join(outDir, `${safeName(platform)}-motion-video.mp4`);
  await writeFile(htmlPath, html, "utf8");
  await writeFile(indexPath, html, "utf8");

  const renderFps = normalizeNumber(fps, 24);
  const renderDuration = normalizeNumber(duration, 14);
  const job = createRenderJob({
    fps: renderFps,
    quality: "standard",
    format: "mp4",
    entryFile: "index.html",
    workers: 1,
    useGpu: false,
    variables: {
      agentStudioPackId: pack.id,
      duration: renderDuration
    }
  });

  await executeRenderJob(job, outDir, videoPath);

  return {
    htmlPath,
    videoPath,
    thumbnailPath: null,
    frameDir: null,
    duration: job.duration || renderDuration,
    fps: renderFps,
    frames: job.totalFrames || Math.round(renderDuration * renderFps),
    renderer: "hyperframes-producer",
    renderBackend: "hyperframes",
    hyperframesJobId: job.id,
    perfSummary: job.perfSummary || null
  };
}
