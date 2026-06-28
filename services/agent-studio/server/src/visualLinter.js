/**
 * Pre-export HTML lint (no DOM). Complements Playwright layout checks in renderer.js.
 */

const PLACEHOLDER_RE = /(?:lorem ipsum|占位(?:文案|符)?|待补充|(?:^|\s)TODO(?:\s|$)|(?:^|\s)TBD(?:\s|$)|示例文案)/i;

const INLINE_CONTENT_FONT_RE = /<(?:p|span|li|h1|h2|h3)\b[^>]*\bstyle="[^"]*font-size:\s*(\d+(?:\.\d+)?)px/gi;

export function lintVisualHtml(html, options = {}) {
  const minBodyPx = options.minBodyPx ?? 28;
  const minTextChars = options.minTextChars ?? 12;
  const profile = options.profile || "strict";
  const violations = [];

  if (!html || String(html).length < 120) {
    violations.push({ code: "empty_html", message: "HTML 过短或为空" });
    return { ok: false, violations };
  }

  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const visibleText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (visibleText.length < minTextChars) {
    violations.push({ code: "low_text_density", message: `可见文字少于 ${minTextChars} 字` });
  }

  if (profile === "strict" && PLACEHOLDER_RE.test(visibleText)) {
    violations.push({ code: "placeholder_copy", message: "检测到占位/模板腔文案" });
  }

  if (profile === "strict") {
    const htmlNoStyle = html.replace(/<style[\s\S]*?<\/style>/gi, "");
    for (const match of htmlNoStyle.matchAll(INLINE_CONTENT_FONT_RE)) {
      const px = Number.parseFloat(match[1]);
      if (px > 0 && px < minBodyPx) {
        violations.push({ code: "small_text", message: `正文字号 ${px}px 低于 ${minBodyPx}px`, px });
      }
    }
  }

  if (profile === "strict") {
    const sheetBlocks = html.match(/class="[^"]*sheet[^"]*"[^>]*>[\s\S]*?<\/section>/gi) || [];
    for (const block of sheetBlocks) {
      const inner = block.replace(/<[^>]+>/g, " ").trim();
      if (inner.length < 8 && !/product-real-scene|data-recipe/.test(block)) {
        violations.push({ code: "empty_center", message: "检测到疑似空内容分镜" });
        break;
      }
    }
  }

  if (profile === "strict" && !/PingFang|Noto Sans|Source Han|Microsoft YaHei|system-ui/i.test(html)) {
    violations.push({ code: "font_stack_weak", message: "未声明 CJK 字体栈（建议 Noto Sans SC）", severity: "warn" });
  }

  const errors = violations.filter((v) => v.severity !== "warn");
  return { ok: errors.length === 0, violations, errorCount: errors.length };
}

export function lintOrThrow(html, options) {
  const result = lintVisualHtml(html, options);
  if (!result.ok) {
    const err = new Error(`visual_lint_failed: ${result.violations.map((v) => v.code).join(", ")}`);
    err.checks = result.violations;
    throw err;
  }
  return result;
}