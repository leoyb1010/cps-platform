import { useEffect, useMemo, useState } from "react";
import { Dices, Pin, Sparkles, Wand2 } from "lucide-react";
import { fetchTemplateRegistry } from "../lib/apiClient.js";
import {
  defaultTemplatePrefs,
  loadTemplatePrefs,
  pickRecipe,
  saveTemplatePrefs
} from "../lib/templateRegistry.js";

export function TemplateGallery({ pack, platform, prefs, onChange, onResolved }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activePrefs = prefs || loadTemplatePrefs();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTemplateRegistry({ platform, excludeAgpl: activePrefs.excludeAgpl })
      .then((data) => {
        if (!cancelled) {
          setRecipes(data.recipes || []);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "模板库加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [platform, activePrefs.excludeAgpl]);

  const resolved = useMemo(
    () => pickRecipe({
      mode: activePrefs.pinRecipe && activePrefs.recipeId ? "manual" : activePrefs.pickMode,
      recipeId: activePrefs.recipeId,
      pack,
      platform,
      excludeAgpl: activePrefs.excludeAgpl !== false,
      weightOverrides: activePrefs.weightOverrides
    }),
    [activePrefs, pack, platform]
  );

  useEffect(() => {
    onResolved?.(resolved);
  }, [resolved.id, resolved.pickMode, resolved.pickReason, onResolved]);

  function updatePrefs(patch) {
    const next = saveTemplatePrefs({ ...activePrefs, ...patch });
    onChange?.(next);
  }

  function selectRecipe(id) {
    updatePrefs({ recipeId: id, pickMode: "manual", pinRecipe: true });
  }

  function randomize() {
    updatePrefs({ pickMode: "random", pinRecipe: false, recipeId: null });
  }

  return (
    <div className="templateGallery">
      <div className="templateGallery__head">
        <div className="hLeft"><Sparkles size={14} /><span>模板库</span></div>
        <span className="cardHint">{loading ? "加载中…" : `${recipes.length} 款可选`}</span>
      </div>

      <div className="templateGallery__modes">
        {[
          ["recommend", "智能推荐", Wand2],
          ["random", "随机探索", Dices],
          ["manual", "手动指定", Pin]
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={activePrefs.pickMode === id && !(id === "manual" && !activePrefs.pinRecipe) ? "on" : ""}
            onClick={() => updatePrefs({
              pickMode: id,
              pinRecipe: id === "manual" ? Boolean(activePrefs.recipeId) : false,
              recipeId: id === "random" ? null : activePrefs.recipeId
            })}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
        <button type="button" className="templateGallery__randomBtn" onClick={randomize}>
          <Dices size={12} /> 再随机一款
        </button>
      </div>

      <label className="templateGallery__agpl">
        <input
          type="checkbox"
          checked={activePrefs.excludeAgpl !== false}
          onChange={(e) => updatePrefs({ excludeAgpl: e.target.checked })}
        />
        排除 AGPL 模板（歸藏系，企业友好）
      </label>

      {error && <p className="templateGallery__error">{error}</p>}

      <p className="templateGallery__resolved">
        当前生效：<b>{resolved.label || resolved.id}</b>
        <span className="muted"> · {resolved.pickReason}</span>
      </p>

      <div className="templateGallery__grid">
        {recipes.map((recipe) => (
          <button
            key={recipe.id}
            type="button"
            className={
              activePrefs.recipeId === recipe.id && activePrefs.pinRecipe
                ? "templateGallery__card on"
                : "templateGallery__card"
            }
            onClick={() => selectRecipe(recipe.id)}
          >
            <strong>{recipe.label}</strong>
            <span>{recipe.provider}</span>
            <div className="templateGallery__tags">
              {(recipe.tags || []).slice(0, 3).map((t) => <em key={t}>{t}</em>)}
            </div>
            {recipe.agpl && <span className="templateGallery__agplTag">AGPL</span>}
          </button>
        ))}
      </div>

      {!loading && !recipes.length && (
        <p className="templateGallery__empty">无可用模板（可关闭「排除 AGPL」或切换平台）</p>
      )}
    </div>
  );
}

export function useTemplatePrefs() {
  const [prefs, setPrefs] = useState(() => loadTemplatePrefs());
  return {
    prefs,
    setPrefs: (patch) => setPrefs(saveTemplatePrefs({ ...defaultTemplatePrefs(), ...prefs, ...patch }))
  };
}