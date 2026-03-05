"use client";

import { useState } from "react";

type FormState = {
  title: string;
  description: string;
  sourceLabel: string;
  sourceUrl: string;
  notes: string;
  rating: string;
  adultFavourite: boolean;
  kidsFavourite: boolean;
  vegetarian: boolean;
  servings: string;
  ingredientLines: string;
  stepLines: string;
};

const initialState: FormState = {
  title: "",
  description: "",
  sourceLabel: "",
  sourceUrl: "",
  notes: "",
  rating: "",
  adultFavourite: false,
  kidsFavourite: false,
  vegetarian: false,
  servings: "",
  ingredientLines: "",
  stepLines: "",
};

export function AddRecipeForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [message, setMessage] = useState<string>("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Saving...");

    const ingredients = form.ingredientLines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        originalText: line,
        itemName: line,
      }));

    const steps = form.stepLines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
        stepNumber: index + 1,
        instruction: line,
      }));

    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        sourceLabel: form.sourceLabel || undefined,
        sourceUrl: form.sourceUrl || undefined,
        notes: form.notes || undefined,
        rating: form.rating === "" ? undefined : Number(form.rating),
        adultFavourite: form.adultFavourite,
        kidsFavourite: form.kidsFavourite,
        vegetarian: form.vegetarian,
        servings: form.servings ? Number(form.servings) : undefined,
        ingredients,
        steps,
      }),
    });

    if (!response.ok) {
      setMessage("Failed to save recipe");
      return;
    }

    setForm(initialState);
    setMessage("Recipe created");
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h3>Add Recipe Manually</h3>
      <input
        placeholder="Recipe title"
        value={form.title}
        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
        required
      />
      <textarea
        placeholder="Short description"
        value={form.description}
        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
      />
      <input
        placeholder="Source (e.g. Family recipe, NYTimes)"
        value={form.sourceLabel}
        onChange={(event) => setForm((prev) => ({ ...prev, sourceLabel: event.target.value }))}
      />
      <input
        type="url"
        placeholder="Source URL (optional)"
        value={form.sourceUrl}
        onChange={(event) => setForm((prev) => ({ ...prev, sourceUrl: event.target.value }))}
      />
      <input
        type="number"
        min={1}
        placeholder="Servings (e.g. 2)"
        value={form.servings}
        onChange={(event) => setForm((prev) => ({ ...prev, servings: event.target.value }))}
      />
      <input
        type="number"
        min={0}
        max={10}
        placeholder="Rating out of 10"
        value={form.rating}
        onChange={(event) => setForm((prev) => ({ ...prev, rating: event.target.value }))}
      />
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={form.adultFavourite}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, adultFavourite: event.target.checked }))
          }
        />
        Adult favourite
      </label>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={form.kidsFavourite}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, kidsFavourite: event.target.checked }))
          }
        />
        Kids favourite
      </label>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={form.vegetarian}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, vegetarian: event.target.checked }))
          }
        />
        Vegetarian
      </label>
      <textarea
        placeholder="Recipe notes (optional)"
        value={form.notes}
        onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
      />
      <textarea
        placeholder="Ingredients (one per line)"
        value={form.ingredientLines}
        onChange={(event) => setForm((prev) => ({ ...prev, ingredientLines: event.target.value }))}
      />
      <textarea
        placeholder="Method steps (one per line)"
        value={form.stepLines}
        onChange={(event) => setForm((prev) => ({ ...prev, stepLines: event.target.value }))}
      />
      <button type="submit">Save Recipe</button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
