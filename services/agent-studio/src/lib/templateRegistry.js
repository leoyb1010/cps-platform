import { hash } from "./contentEngine.js";
import { RECIPE_LIST } from "./templateRegistryData.js";

export const PICK_MODES = ["recommend", "random", "manual"];

export function loadRecipeRegistry() {
  return RECIPE_LIST;
}

export function getRecipeById(id) {
  return RECIPE_LIST.find((r) => r.id === id) || null;
}

export function filterRecipes({ platform, excludeAgpl = true, pickableOnly = true } = {}) {
  return RECIPE_LIST.filter((r) => {
    if (pickableOnly && r.pickable === false) return false;
    if (excludeAgpl && r.agpl) return false;
    if (platform && r.platforms?.length && !r.platforms.includes(platform)) return false;
    return true;
  });
}

export function recommendRecipeId(pack, platform = "xhs") {
  const blob = `${pack?.title || ""} ${pack?.core || ""} ${pack?.domain || ""}`.toLowerCase();
  if (pack?.domain === "product" || /产品|app|工具|saas|软件|实测/.test(blob)) {
    return "xhs-product-real-scene";
  }
  if (/教程|步骤|流程|复盘|操作|上手/.test(blob)) {
    return "xhs-process-storyboard";
  }
  if (/避坑|对比|警示|别踩|坑/.test(blob)) {
    return "baoyu-bold-warning";
  }
  if (/极简|总结|清单|notion/.test(blob)) {
    return "baoyu-notion-minimal";
  }
  if (platform === "douyin") {
    return "xhs-dense-infographic";
  }
  return "xhs-dense-infographic";
}

function effectiveWeight(recipe, weightOverrides = {}) {
  const base = Number(weightOverrides[recipe.id] ?? recipe.weight ?? 1);
  const success = Number(weightOverrides[`${recipe.id}:success`] ?? 0);
  const fail = Number(weightOverrides[`${recipe.id}:fail`] ?? 0);
  const penalty = Math.max(0.2, 1 - fail * 0.15);
  const bonus = 1 + Math.min(success * 0.05, 0.35);
  return Math.max(0.1, base * penalty * bonus);
}

export function pickRecipe({
  mode = "recommend",
  recipeId = null,
  pack = null,
  platform = "xhs",
  excludeAgpl = true,
  weightOverrides = {}
} = {}) {
  const pool = filterRecipes({ platform, excludeAgpl, pickableOnly: mode !== "manual" });

  if (mode === "manual" && recipeId) {
    const found = getRecipeById(recipeId) || pool.find((r) => r.visualStyle === recipeId);
    if (found) return { ...found, pickMode: "manual", pickReason: "用户指定模板" };
  }

  if (mode === "recommend" || !mode) {
    const id = recommendRecipeId(pack, platform);
    const found = pool.find((r) => r.id === id) || pool.find((r) => r.visualStyle === id) || pool[0];
    return {
      ...found,
      pickMode: "recommend",
      pickReason: `按主题推荐：${found?.label || id}`
    };
  }

  const candidates = pool.length ? pool : filterRecipes({ platform, excludeAgpl: false });
  if (!candidates.length) {
    return {
      id: "xhs-dense-infographic",
      visualStyle: "xhs-dense-infographic",
      label: "默认",
      pickMode: "random",
      pickReason: "回退默认"
    };
  }

  const seed = `${pack?.id || "pack"}:${pack?.title || ""}:${Date.now()}`;
  const total = candidates.reduce((sum, r) => sum + effectiveWeight(r, weightOverrides), 0);
  let roll = (hash(seed) % 10000) / 10000 * total;
  for (const recipe of candidates) {
    roll -= effectiveWeight(recipe, weightOverrides);
    if (roll <= 0) {
      return { ...recipe, pickMode: "random", pickReason: "加权随机" };
    }
  }
  return { ...candidates[candidates.length - 1], pickMode: "random", pickReason: "加权随机" };
}

export function resolveVisualStyleFromRecipe(recipe) {
  if (!recipe) return "auto-diverse";
  return recipe.visualStyle || recipe.id || "auto-diverse";
}

export const TEMPLATE_PREFS_STORAGE_KEY = "content-os-template-prefs";

export function defaultTemplatePrefs() {
  return {
    pickMode: "recommend",
    recipeId: null,
    excludeAgpl: true,
    pinRecipe: false,
    weightOverrides: {}
  };
}

export function loadTemplatePrefs() {
  if (typeof localStorage === "undefined") return defaultTemplatePrefs();
  try {
    const raw = localStorage.getItem(TEMPLATE_PREFS_STORAGE_KEY);
    if (!raw) return defaultTemplatePrefs();
    return { ...defaultTemplatePrefs(), ...JSON.parse(raw) };
  } catch {
    return defaultTemplatePrefs();
  }
}

export function saveTemplatePrefs(prefs) {
  if (typeof localStorage === "undefined") return prefs;
  const merged = { ...defaultTemplatePrefs(), ...prefs };
  localStorage.setItem(TEMPLATE_PREFS_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function resolveStyleForPack(pack, platform, prefs) {
  const p = prefs || defaultTemplatePrefs();
  const mode = p.pinRecipe && p.recipeId ? "manual" : p.pickMode || "recommend";
  const recipe = pickRecipe({
    mode,
    recipeId: p.recipeId,
    pack,
    platform,
    excludeAgpl: p.excludeAgpl !== false,
    weightOverrides: p.weightOverrides || {}
  });
  return {
    recipe,
    visualStyle: resolveVisualStyleFromRecipe(recipe)
  };
}

export function recordRecipeOutcome(prefs, recipeId, success) {
  const key = `${recipeId}:${success ? "success" : "fail"}`;
  const weightOverrides = { ...(prefs.weightOverrides || {}) };
  weightOverrides[key] = (weightOverrides[key] || 0) + 1;
  return saveTemplatePrefs({ ...prefs, weightOverrides });
}