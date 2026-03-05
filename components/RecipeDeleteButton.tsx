"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecipeDeleteButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState("");

  async function onDelete() {
    if (deleting) {
      return;
    }

    const confirmed = window.confirm("Delete this recipe?");
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setStatus("Deleting...");

    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setStatus("Delete failed");
        setDeleting(false);
        return;
      }

      router.push("/recipes");
      router.refresh();
    } catch {
      setStatus("Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <button type="button" onClick={onDelete} disabled={deleting}>
        {deleting ? "Deleting..." : "Delete Recipe"}
      </button>
      {status ? <span className="muted">{status}</span> : null}
    </div>
  );
}
