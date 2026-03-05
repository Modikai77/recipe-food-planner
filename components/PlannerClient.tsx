"use client";

import { useState } from "react";

type Recommendation = {
  recipeId: string;
  title: string;
  score: number;
  reasons: string[];
};

type ShoppingItem = {
  key: string;
  itemName: string;
  displayQuantity?: number;
  displayUnit?: string;
};

function formatMatchScore(score: number): string {
  const outOfTen = Math.max(0, Math.min(10, score * 10));
  return `${outOfTen.toFixed(1)}/10`;
}

export function PlannerClient() {
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [adultFavouriteOnly, setAdultFavouriteOnly] = useState(false);
  const [kidsFavouriteOnly, setKidsFavouriteOnly] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [checkedShoppingKeys, setCheckedShoppingKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function runPlanner() {
    setLoading(true);
    setStatus("");
    setShoppingItems([]);

    const response = await fetch("/api/planner/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience: "parents_and_kids",
        constraints: {
          ...(vegetarianOnly ? { vegetarian: true } : {}),
          ...(adultFavouriteOnly ? { adultFavourite: true } : {}),
          ...(kidsFavouriteOnly ? { kidsFavourite: true } : {}),
          includeTags: [],
          excludeTags: [],
        },
      }),
    });

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: "Failed to fetch recommendations." }));
      setStatus(body.error ?? "Failed to fetch recommendations.");
      setLoading(false);
      return;
    }

    const data = await response.json();
    const recipes: Recommendation[] = data.recipes ?? [];
    setRecommendations(recipes);
    setSelectedRecipeIds([]);
    if (recipes.length === 0) {
      setStatus("No matching recipes found. Try loosening filters.");
    }

    setLoading(false);
  }

  function toggleRecipe(recipeId: string, checked: boolean) {
    setSelectedRecipeIds((prev) => {
      if (checked) {
        return prev.includes(recipeId) ? prev : [...prev, recipeId];
      }
      return prev.filter((id) => id !== recipeId);
    });
  }

  async function generateShoppingList() {
    if (selectedRecipeIds.length === 0) {
      setStatus("Select at least one recipe.");
      return;
    }

    setListLoading(true);
    setStatus("");

    const listResponse = await fetch("/api/planner/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipeIds: selectedRecipeIds,
        title: "Planner List",
      }),
    });

    if (!listResponse.ok) {
      setStatus("Failed to generate ingredient list.");
      setListLoading(false);
      return;
    }

    const listData = await listResponse.json();
    const items: ShoppingItem[] = listData.items ?? [];
    setShoppingItems(items);
    setCheckedShoppingKeys([]);
    setListLoading(false);
  }

  function toggleShoppingItem(key: string, checked: boolean) {
    setCheckedShoppingKeys((prev) => {
      if (checked) {
        return prev.includes(key) ? prev : [...prev, key];
      }

      return prev.filter((entry) => entry !== key);
    });
  }

  function exportShoppingList() {
    const checkedItems = shoppingItems.filter((item) => checkedShoppingKeys.includes(item.key));
    if (checkedItems.length === 0) {
      setStatus("Tick at least one shopping item to export.");
      return;
    }

    const lines = checkedItems.map((item) => {
      const prefix =
        item.displayQuantity !== undefined && item.displayUnit
          ? `${item.displayQuantity} ${item.displayUnit} `
          : "";
      return `${prefix}${item.itemName}`;
    });

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `shopping-list-${date}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid" style={{ marginTop: "1rem" }}>
      <section className="card">
        <h3>Planner Input</h3>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={vegetarianOnly}
            onChange={(event) => setVegetarianOnly(event.target.checked)}
          />
          Vegetarian only
        </label>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={adultFavouriteOnly}
            onChange={(event) => setAdultFavouriteOnly(event.target.checked)}
          />
          Adult favourites only
        </label>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={kidsFavouriteOnly}
            onChange={(event) => setKidsFavouriteOnly(event.target.checked)}
          />
          Kids favourites only
        </label>

        <button type="button" onClick={runPlanner} disabled={loading}>
          {loading ? "Planning..." : "Find Recommendations"}
        </button>
      </section>

      <section className="card">
        <h3>Ranked Recommendations</h3>
        {recommendations.length === 0 ? <p className="muted">No recommendations yet.</p> : null}
        <ul className="clean">
          {recommendations.map((recipe, index) => (
            <li key={recipe.recipeId} style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: "0.5rem", alignItems: "start" }}>
                <input
                  type="checkbox"
                  checked={selectedRecipeIds.includes(recipe.recipeId)}
                  onChange={(event) => toggleRecipe(recipe.recipeId, event.target.checked)}
                />
                <span>
                  <strong>{recipe.title}</strong>
                  {recipe.score !== undefined ? ` - Match score: ${formatMatchScore(recipe.score)}` : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button type="button" onClick={generateShoppingList} disabled={listLoading}>
          {listLoading ? "Building..." : "Create Ingredient List"}
        </button>
        {status ? <p className="muted">{status}</p> : null}
      </section>

      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <h3>Consolidated Shopping List</h3>
        {shoppingItems.length === 0 ? <p className="muted">No list generated yet.</p> : null}
        <ul className="clean">
          {shoppingItems.map((item) => (
            <li key={item.key} style={{ marginBottom: "0.5rem" }}>
              <label style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: "0.5rem", alignItems: "start" }}>
                <input
                  type="checkbox"
                  checked={checkedShoppingKeys.includes(item.key)}
                  onChange={(event) => toggleShoppingItem(item.key, event.target.checked)}
                />
                <span>
                  {item.displayQuantity ? `${item.displayQuantity} ${item.displayUnit} ` : ""}
                  {item.itemName}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button type="button" onClick={exportShoppingList} disabled={shoppingItems.length === 0}>
          Export Shopping List
        </button>
      </section>
    </div>
  );
}
