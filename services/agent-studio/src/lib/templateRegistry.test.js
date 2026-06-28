import { describe, expect, it } from "vitest";
import {
  filterRecipes,
  loadRecipeRegistry,
  pickRecipe,
  recommendRecipeId,
  resolveVisualStyleFromRecipe
} from "./templateRegistry.js";

describe("templateRegistry", () => {
  it("loads at least 10 pickable recipes", () => {
    const all = loadRecipeRegistry();
    const pickable = filterRecipes({ platform: "xhs", excludeAgpl: true });
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(pickable.length).toBeGreaterThanOrEqual(8);
  });

  it("recommends product scene for product domain", () => {
    const id = recommendRecipeId({ title: "我的 SaaS 工具", core: "产品", domain: "product" }, "xhs");
    expect(id).toBe("xhs-product-real-scene");
  });

  it("recommends process storyboard for tutorial topics", () => {
    const id = recommendRecipeId({ title: "三步上手教程", core: "流程" }, "xhs");
    expect(id).toBe("xhs-process-storyboard");
  });

  it("manual pick returns pinned recipe", () => {
    const recipe = pickRecipe({
      mode: "manual",
      recipeId: "baoyu-notion-minimal",
      pack: { id: "p1", title: "test" },
      platform: "xhs"
    });
    expect(recipe.id).toBe("baoyu-notion-minimal");
    expect(resolveVisualStyleFromRecipe(recipe)).toBe("baoyu-minimal");
  });

  it("random pick stays in pool", () => {
    const pool = filterRecipes({ platform: "xhs", excludeAgpl: true });
    const recipe = pickRecipe({
      mode: "random",
      pack: { id: "p2", title: "随机测试" },
      platform: "xhs"
    });
    expect(pool.some((r) => r.id === recipe.id)).toBe(true);
  });

  it("excludeAgpl removes guizang recipes", () => {
    const withAgpl = filterRecipes({ platform: "xhs", excludeAgpl: false });
    const noAgpl = filterRecipes({ platform: "xhs", excludeAgpl: true });
    expect(withAgpl.some((r) => r.agpl)).toBe(true);
    expect(noAgpl.some((r) => r.agpl)).toBe(false);
  });
});