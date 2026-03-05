"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReprocessRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    setStatus("Reprocessing...");

    const response = await fetch(`/api/recipes/${recipeId}/reprocess`, {
      method: "POST",
    });

    if (!response.ok) {
      setStatus("Reprocess failed");
      setLoading(false);
      return;
    }

    setStatus("Updated");
    setLoading(false);
    router.refresh();
  }

  return (
    <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <button type="button" onClick={onClick} disabled={loading}>
        {loading ? "Reprocessing..." : "Reprocess"}
      </button>
      {status ? <span className="muted">{status}</span> : null}
    </div>
  );
}
