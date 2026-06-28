import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { chromium } from "playwright";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportRoot = path.join(serverRoot, "exports");

// Reuse a single headless Chromium across exports instead of launching/closing one per asset
// (Autopilot renders cover + info + infographic per image slot = 3 launches otherwise). The
// browser is relaunched automatically if it ever disconnects.
let sharedBrowser = null;
async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  sharedBrowser = await chromium.launch({ headless: true });
  sharedBrowser.on("disconnected", () => { sharedBrowser = null; });
  return sharedBrowser;
}

export async function closeSharedBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    await sharedBrowser.close().catch(() => {});
  }
  sharedBrowser = null;
}

function safeName(value) {
  return String(value || "asset").replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function normalizeViewport(viewport = {}) {
  return {
    width: Number(viewport.width || viewport.w || 1200),
    height: Number(viewport.height || viewport.h || 1600)
  };
}

export async function writeHtmlAndScreenshot({ id, category, html, selectors = [".visual-root"], viewport = { width: 1200, height: 1600 }, filePrefix = "asset" }) {
  const outDir = path.join(exportRoot, safeName(category), safeName(id));
  await mkdir(outDir, { recursive: true });

  const htmlPath = path.join(outDir, `${safeName(filePrefix)}.html`);
  await writeFile(htmlPath, html, "utf8");

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: normalizeViewport(viewport), deviceScaleFactor: 1 });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
    const files = [];
    for (let index = 0; index < selectors.length; index += 1) {
      const locator = page.locator(selectors[index]);
      const count = await locator.count();
      if (count === 0) continue;
      for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
        const suffix = selectors.length === 1 && count === 1 ? "" : `-${String(files.length + 1).padStart(2, "0")}`;
        const file = path.join(outDir, `${safeName(filePrefix)}${suffix}.png`);
        await locator.nth(itemIndex).screenshot({ path: file });
        files.push(file);
      }
    }
    return { htmlPath, files };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function exportVisualPng({ id, category, html, selector = ".visual-root", fileName = "asset", viewport = { width: 1200, height: 1600 } }) {
  const result = await writeHtmlAndScreenshot({ id, category, html, selectors: [selector], viewport, filePrefix: fileName });
  return { htmlPath: result.htmlPath, pngPath: result.files[0] || null, files: result.files };
}

export async function exportXhsCarouselPng({ pack, platform = "xhs", html, viewport = { width: 1080, height: 1440 } }) {
  const outDir = path.join(exportRoot, "xhs-carousel", safeName(pack.id));
  await mkdir(outDir, { recursive: true });

  const htmlPath = path.join(outDir, `${safeName(platform)}-carousel.html`);
  await writeFile(htmlPath, html, "utf8");

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: normalizeViewport(viewport), deviceScaleFactor: 1 });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
    const cards = await page.locator(".xhs-card").all();
    const checks = await page.locator(".xhs-card").evaluateAll((nodes) => nodes.map((node, index) => {
      const cardRect = node.getBoundingClientRect();
      const textNodes = Array.from(node.querySelectorAll("h1,p,span,b,footer"))
        .filter((item) => !item.closest(".product-shot"));
      const violations = [];
      const warnings = [];
      if (Math.round(cardRect.width) !== 1080 || Math.round(cardRect.height) !== 1440) violations.push("invalid_card_size");
      for (const item of textNodes) {
        const rect = item.getBoundingClientRect();
        const style = window.getComputedStyle(item);
        const fontSize = Number.parseFloat(style.fontSize || "0");
        const label = item.textContent?.trim().slice(0, 20) || item.tagName;
        if (rect.left < cardRect.left + 72 || rect.right > cardRect.right - 72 || rect.top < cardRect.top + 72 || rect.bottom > cardRect.bottom - 72) {
          violations.push(`safe_area:${label}`);
        }
        if (["P", "SPAN"].includes(item.tagName) && fontSize < 28) violations.push(`small_text:${label}`);
      }
      // "Empty card" guard. The 6 cards stack vertically and the viewport is only one card tall, so
      // cards 2..6 render BELOW the fold where elementFromPoint(center) always returns null — that
      // made every non-first editorial card a false "empty_center" and 500'd the endpoint. Instead
      // of probing the geometric center, verify the card actually carries content: real copy in its
      // body region or a visual. Editorial cards that use intentional whitespace pass as long as
      // they have text; product-real-scene cards are validated by their own image rules below.
      const contentRoot = node.querySelector(".content") || node;
      const contentText = (contentRoot.textContent || "").replace(/\s+/g, "");
      const hasVisual = Boolean(node.querySelector("img, .product-shot, .mock-body, svg"));
      if (contentText.length < 16 && !hasVisual && node.dataset.recipe !== "product-real-scene") {
        violations.push("empty_center");
      }

      if (node.dataset.recipe === "product-real-scene") {
        const shot = node.querySelector(".product-shot");
        if (!shot) {
          violations.push("missing_product_shot");
        } else {
          const shotRect = shot.getBoundingClientRect();
          const image = shot.querySelector("img");
          const areaRatio = (shotRect.width * shotRect.height) / (cardRect.width * cardRect.height);
          if (areaRatio < 0.28) violations.push("product_shot_too_small");
          if (shot.dataset.fallback === "true") warnings.push("fallback_product_shot_used");
          if (image) {
            const style = window.getComputedStyle(image);
            const imageRect = image.getBoundingClientRect();
            const visibleRatio = (imageRect.width * imageRect.height) / (shotRect.width * shotRect.height);
            if (style.objectFit === "cover") violations.push("product_shot_uses_cover_crop");
            if (visibleRatio < 0.55) violations.push("product_image_too_small_in_frame");
            if (imageRect.left < shotRect.left || imageRect.right > shotRect.right || imageRect.top < shotRect.top || imageRect.bottom > shotRect.bottom) {
              violations.push("product_image_overflows_frame");
            }
          }
        }
      }
      return { page: index + 1, ok: violations.length === 0, violations, warnings };
    }));
    const failed = checks.filter((check) => !check.ok);
    if (failed.length) {
      throw new Error(`XHS carousel layout check failed: ${JSON.stringify(failed)}`);
    }
    const files = [];
    for (let index = 0; index < cards.length; index += 1) {
      const file = path.join(outDir, `${safeName(platform)}-carousel-${String(index + 1).padStart(2, "0")}.png`);
      await cards[index].screenshot({ path: file });
      files.push(file);
    }
    return { htmlPath, files, checks };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function exportMotionPreview({ pack, platform, html }) {
  const result = await writeHtmlAndScreenshot({
    id: pack.id,
    category: "motion",
    html,
    selectors: [".visual-root"],
    viewport: { width: 1080, height: 1920 },
    filePrefix: `${platform}-motion-preview`
  });
  return { htmlPath: result.htmlPath, thumbnailPath: result.files[0] || null, files: result.files };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg.path, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with ${code}`));
    });
  });
}

function resolveVideoBackend(backend) {
  return backend || globalThis.process?.env?.VIDEO_RENDER_BACKEND || "local";
}

async function exportLocalMotionVideo({ pack, platform, html, duration = 14, fps = 24 }) {
  const outDir = path.join(exportRoot, "videos", safeName(pack.id));
  const frameDir = path.join(outDir, "frames");
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });

  const htmlPath = path.join(outDir, `${safeName(platform)}-motion-video.html`);
  const videoPath = path.join(outDir, `${safeName(platform)}-motion-video.mp4`);
  const thumbnailPath = path.join(outDir, `${safeName(platform)}-motion-video-cover.png`);
  await writeFile(htmlPath, html, "utf8");

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
    // Prefer the deterministic timeline (__seek) the content renderer exposes: it animates *within*
    // each scene (staggered reveals, growing bars, eased entrances) so the MP4 reads like real
    // motion instead of hard opacity cuts. Older templates without __seek fall back to the legacy
    // scene-by-scene stepper.
    const usesSeek = await page.evaluate(() => {
      if (typeof globalThis.__seek === "function") {
        globalThis.__controlled = true; // stop the standalone autoplay loop; we drive frames manually
        return true;
      }
      for (const animation of document.getAnimations()) animation.pause();
      const scenes = Array.from(document.querySelectorAll(".scene"));
      globalThis.__agentSetMotionScene = (sceneIndex) => {
        scenes.forEach((scene, index) => {
          scene.style.animation = "none";
          scene.style.opacity = index === sceneIndex ? "1" : "0";
          scene.style.transform = index === sceneIndex ? "translateY(0)" : "translateY(-24px)";
        });
      };
      return false;
    });
    const coverT = await page.evaluate(() => (typeof globalThis.__coverT === "number" ? globalThis.__coverT : 0));

    const frameCount = Math.max(1, Math.round(duration * fps));
    const sceneCount = Math.max(1, pack.videoFrames?.length || 1);
    const root = page.locator(".visual-root");
    for (let index = 0; index < frameCount; index += 1) {
      if (usesSeek) {
        const t = (index + 0.5) / frameCount; // sample scene centres: no blank edges, continuous motion
        await page.evaluate((value) => globalThis.__seek(value), t);
      } else {
        const sceneIndex = Math.min(sceneCount - 1, Math.floor((index / frameCount) * sceneCount));
        await page.evaluate((activeSceneIndex) => globalThis.__agentSetMotionScene?.(activeSceneIndex), sceneIndex);
      }
      const framePath = path.join(frameDir, `frame-${String(index + 1).padStart(5, "0")}.png`);
      await root.screenshot({ path: framePath });
    }
    // Cover thumbnail: a fully-built first scene (not the mid-fade-in frame 0).
    if (usesSeek) await page.evaluate((value) => globalThis.__seek(value), coverT);
    else await page.evaluate(() => globalThis.__agentSetMotionScene?.(0));
    await root.screenshot({ path: thumbnailPath });
  } finally {
    await page.close().catch(() => {});
  }

  await runFfmpeg([
    "-y",
    "-framerate", String(fps),
    "-i", path.join(frameDir, "frame-%05d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    "-movflags", "+faststart",
    videoPath
  ]);

  return {
    htmlPath,
    videoPath,
    thumbnailPath,
    frameDir,
    duration,
    fps,
    frames: Math.round(duration * fps),
    renderer: "agent-studio-local",
    renderBackend: "local"
  };
}

export async function exportMotionVideo({ backend, ...input }) {
  const requestedBackend = resolveVideoBackend(backend);
  if (requestedBackend === "hyperframes") {
    try {
      const { exportHyperframesMotionVideo } = await import("./hyperframesRenderer.js");
      return await exportHyperframesMotionVideo(input);
    } catch (error) {
      if (globalThis.process?.env?.HYPERFRAMES_STRICT === "true") throw error;
      const local = await exportLocalMotionVideo(input);
      return {
        ...local,
        requestedBackend,
        fallbackReason: error.message || String(error)
      };
    }
  }
  return exportLocalMotionVideo(input);
}

export async function exportDeckPng({ pack, platform, html }) {
  const outDir = path.join(exportRoot, safeName(pack.id));
  await mkdir(outDir, { recursive: true });

  const htmlPath = path.join(outDir, `${platform}-deck.html`);
  await writeFile(htmlPath, html, "utf8");

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
    const cards = await page.locator(".card").all();
    const files = [];
    for (let index = 0; index < cards.length; index += 1) {
      const file = path.join(outDir, `${platform}-card-${String(index + 1).padStart(2, "0")}.png`);
      await cards[index].screenshot({ path: file });
      files.push(file);
    }
    return { htmlPath, files };
  } finally {
    await page.close().catch(() => {});
  }
}
