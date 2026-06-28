import { describe, expect, it } from "vitest";
import { buildTemplateApiPayload } from "./templateApiPayload.js";

describe("buildTemplateApiPayload", () => {
  it("omits style and sends manual when pinned", () => {
    const payload = buildTemplateApiPayload({
      pack: { id: "p1" },
      platform: "xhs",
      prefs: { pickMode: "random", pinRecipe: true, recipeId: "baoyu-notion-minimal", excludeAgpl: true }
    });
    expect(payload.pickMode).toBe("manual");
    expect(payload.templateRecipeId).toBe("baoyu-notion-minimal");
    expect(payload.style).toBeUndefined();
  });

  it("does not send recipe id when not pinned", () => {
    const payload = buildTemplateApiPayload({
      pack: { id: "p1" },
      platform: "xhs",
      prefs: { pickMode: "random", pinRecipe: false, recipeId: "baoyu-notion-minimal" }
    });
    expect(payload.pickMode).toBe("random");
    expect(payload.templateRecipeId).toBeNull();
  });
});