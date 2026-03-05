"use client";

import { useState } from "react";
import { waitForIngestionJob } from "@/lib/client/ingestion";

export function UrlImportForm() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setStatus("Importing...");

    try {
      const response = await fetch("/api/ingestion/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Import failed" }));
        setStatus(body.error ?? "Import failed");
        return;
      }

      const data = await response.json();
      setLastJobId(data.jobId);
      setStatus(data.deduped ? `Using existing import: ${data.jobId}` : `Job started: ${data.jobId}`);
      setUrl("");

      const completedJob = await waitForIngestionJob(data.jobId);
      if (completedJob?.status === "FAILED") {
        setStatus(completedJob.errorMessage || "Import failed");
        return;
      }

      setStatus("Imported. Refreshing...");
      window.location.href = `/recipes?ingestionJobId=${encodeURIComponent(data.jobId)}`;
    } catch {
      setStatus("Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h3>Import Recipe URL</h3>
      <input
        placeholder="https://example.com/recipe"
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? "Importing..." : "Import URL"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
      {lastJobId ? (
        <p className="muted">
          <a href={`/api/ingestion/jobs/${lastJobId}`} target="_blank" rel="noreferrer">
            View import debug
          </a>
        </p>
      ) : null}
    </form>
  );
}
