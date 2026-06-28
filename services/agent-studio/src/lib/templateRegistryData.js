import registryJson from "../../registry/recipes.json" with { type: "json" };

export const REGISTRY_VERSION = registryJson.version || "1.0.0";
export const RECIPE_LIST = registryJson.recipes || [];