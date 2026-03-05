"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecipeScoreForm(props: {
  recipeId: string;
  initialRating?: number | null;
  initialAdultFavourite?: boolean;
  initialKidsFavourite?: boolean;
  initialVegetarian?: boolean | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(props.initialRating?.toString() ?? "");
  const [adultFavourite, setAdultFavourite] = useState(Boolean(props.initialAdultFavourite));
  const [kidsFavourite, setKidsFavourite] = useState(Boolean(props.initialKidsFavourite));
  const [vegetarian, setVegetarian] = useState(Boolean(props.initialVegetarian));
  const [status, setStatus] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    const response = await fetch(`/api/recipes/${props.recipeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: rating === "" ? null : Number(rating),
        adultFavourite,
        kidsFavourite,
        vegetarian,
      }),
    });

    if (!response.ok) {
      setStatus("Save failed");
      return;
    }

    setStatus("Saved");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem", maxWidth: 360 }}>
      <label>
        Rating (0-10)
        <input
          type="number"
          min={0}
          max={10}
          value={rating}
          onChange={(event) => setRating(event.target.value)}
        />
      </label>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={adultFavourite}
          onChange={(event) => setAdultFavourite(event.target.checked)}
        />
        Adult favourite
      </label>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={kidsFavourite}
          onChange={(event) => setKidsFavourite(event.target.checked)}
        />
        Kids favourite
      </label>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={vegetarian}
          onChange={(event) => setVegetarian(event.target.checked)}
        />
        Vegetarian
      </label>
      <button type="submit">Save Rating</button>
      {status ? <span className="muted">{status}</span> : null}
    </form>
  );
}
