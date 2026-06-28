/** Build server-authoritative template fields (omit client-resolved style unless pinned). */
export function buildTemplateApiPayload({ pack, platform, prefs }) {
  const pin = Boolean(prefs?.pinRecipe && prefs?.recipeId);
  return {
    pack,
    platform,
    pickMode: pin ? "manual" : (prefs?.pickMode || "recommend"),
    templateRecipeId: pin ? prefs.recipeId : null,
    pinRecipe: pin,
    excludeAgpl: prefs?.excludeAgpl !== false
  };
}