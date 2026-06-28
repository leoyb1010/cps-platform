import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./store.js", () => ({
  getSetting: vi.fn(() => ({})),
  putSetting: vi.fn()
}));

const { pickRecipe, resolveVisualStyleFromRecipe } = await import("../../src/lib/templateRegistry.js");

// Mirror production helper (tested in isolation to avoid booting the HTTP server).
function resolveExportStyle(data, pack, platform) {
  const weightOverrides = {};
  const pickMode = data.pickMode || "recommend";
  const pinned = Boolean(data.templateRecipeId) && (pickMode === "manual" || data.pinRecipe === true);

  if (pinned) {
    const recipe = pickRecipe({
      mode: "manual",
      recipeId: data.templateRecipeId,
      pack,
      platform,
      excludeAgpl: data.excludeAgpl !== false,
      weightOverrides
    });
    return { visualStyle: recipe.visualStyle || recipe.id, recipe };
  }

  if (pickMode === "random" || pickMode === "recommend" || !data.style || data.style === "auto-diverse" || data.style === "sharp-editorial") {
    const recipe = pickRecipe({
      mode: pickMode,
      recipeId: null,
      pack,
      platform,
      excludeAgpl: data.excludeAgpl !== false,
      weightOverrides
    });
    return { visualStyle: resolveVisualStyleFromRecipe(recipe), recipe };
  }

  const recipe = pickRecipe({ mode: "recommend", pack, platform, weightOverrides });
  return { visualStyle: data.style, recipe };
}

describe("resolveExportStyle", () => {
  const pack = { id: "p1", title: "SaaS 产品实测", domain: "product", core: "测试" };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores client style when pickMode is random", () => {
    vi.setSystemTime(new Date("2026-06-05T08:15:00.000Z"));
    const a = resolveExportStyle({ pickMode: "random", style: "baoyu-minimal" }, pack, "xhs");
    const b = resolveExportStyle({ pickMode: "random", style: "guizang-swiss" }, pack, "xhs");
    expect(a.recipe.id).toBe(b.recipe.id);
    expect(a.visualStyle).toBe(b.visualStyle);
  });

  it("uses pinned recipe when pinRecipe + templateRecipeId", () => {
    const { recipe, visualStyle } = resolveExportStyle({
      pickMode: "recommend",
      pinRecipe: true,
      templateRecipeId: "baoyu-notion-minimal"
    }, pack, "xhs");
    expect(recipe.id).toBe("baoyu-notion-minimal");
    expect(visualStyle).toBe("baoyu-minimal");
  });
});
