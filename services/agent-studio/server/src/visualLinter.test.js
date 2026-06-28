import { describe, expect, it } from "vitest";
import { lintVisualHtml } from "./visualLinter.js";

describe("visualLinter", () => {
  it("flags tiny font sizes", () => {
    const html = `<!doctype html><html><body style="font-family:Noto Sans SC"><p style="font-size:12px">这是一段用于检测字号过小的正文内容。</p></body></html>`;
    const result = lintVisualHtml(html, { minBodyPx: 28, minTextChars: 8 });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "small_text")).toBe(true);
  });

  it("passes well-formed export html", () => {
    const html = `<!doctype html><html><head><style></style></head><body style="font-family:Noto Sans SC">
      <main class="visual-root"><section class="sheet"><h1 style="font-size:52px">标题足够长</h1>
      <p style="font-size:32px">正文内容超过十二个汉字用于检测密度问题。</p></section></main></body></html>`;
    const result = lintVisualHtml(html, { minBodyPx: 28 });
    expect(result.ok).toBe(true);
  });

  it("legacy deck profile ignores stylesheet small fonts", () => {
    const html = `<!doctype html><html><head><style>.label{font-size:18px}</style></head><body>
      <section class="card"><h1>标题</h1><p>足够长的正文用于 legacy deck 检测。</p></section></body></html>`;
    const result = lintVisualHtml(html, { profile: "legacy-deck", minTextChars: 4 });
    expect(result.ok).toBe(true);
  });
});