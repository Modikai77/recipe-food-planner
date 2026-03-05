"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function sourceLinkText(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

export function RecipeSourceForm({
  recipeId,
  initialSourceUrl,
  initialSourceLabel,
}: {
  recipeId: string;
  initialSourceUrl?: string | null;
  initialSourceLabel?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(initialSourceUrl ?? initialSourceLabel ?? "");
  const [status, setStatus] = useState("");

  const hasSource = useMemo(
    () => Boolean((initialSourceUrl ?? "").trim() || (initialSourceLabel ?? "").trim()),
    [initialSourceLabel, initialSourceUrl],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    const trimmedSource = source.trim();
    const looksLikeUrl = (() => {
      if (!trimmedSource) {
        return false;
      }
      try {
        const parsed = new URL(trimmedSource);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    })();

    const response = await fetch(`/api/recipes/${recipeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl: looksLikeUrl ? trimmedSource : null,
        sourceLabel: looksLikeUrl ? null : trimmedSource || null,
      }),
    });

    if (!response.ok) {
      setStatus("Save failed");
      return;
    }

    setStatus("Saved");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div>
        {initialSourceUrl ? (
          <p>
            <a href={initialSourceUrl} target="_blank" rel="noreferrer">
              {sourceLinkText(initialSourceUrl)}
            </a>
          </p>
        ) : initialSourceLabel ? (
          <p>{initialSourceLabel}</p>
        ) : (
          <p className="muted">No source provided.</p>
        )}
        <button type="button" onClick={() => setEditing(true)}>
          {hasSource ? "Edit" : "Add Source"}
        </button>
        {status ? <p className="muted">{status}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.5rem", maxWidth: 480 }}>
      <input
        type="text"
        placeholder="Source (URL or text, e.g. cookbook name)"
        value={source}
        onChange={(event) => setSource(event.target.value)}
      />
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="submit">Save Source</button>
        <button type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </form>
  );
}
