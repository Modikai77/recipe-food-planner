"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecipeNotesForm({ recipeId, initialNotes }: { recipeId: string; initialNotes?: string | null }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [status, setStatus] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    const response = await fetch(`/api/recipes/${recipeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes.trim() || null }),
    });

    if (!response.ok) {
      setStatus("Save failed");
      return;
    }

    setStatus("Saved");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <textarea
        placeholder="Add notes about changes or tips"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={4}
      />
      <button type="submit">Save Notes</button>
      {status ? <p className="muted">{status}</p> : null}
    </form>
  );
}
