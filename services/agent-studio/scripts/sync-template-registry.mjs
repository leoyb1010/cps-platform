#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "registry/recipes.json");

const data = JSON.parse(readFileSync(registryPath, "utf8"));
const recipes = data.recipes || [];
const errors = [];

for (const recipe of recipes) {
  if (!recipe.id || !recipe.visualStyle) errors.push(`${recipe.id}: missing visualStyle`);
  if (!recipe.platforms?.length) errors.push(`${recipe.id}: missing platforms`);
  if (!recipe.canvas?.w) errors.push(`${recipe.id}: missing canvas`);
}

const pickable = recipes.filter((r) => r.pickable !== false);
console.log(`registry/recipes.json · ${recipes.length} total · ${pickable.length} pickable`);
if (errors.length) {
  console.error("Validation errors:");
  errors.forEach((e) => console.error(" -", e));
  process.exit(1);
}
console.log("OK");