"use client";

import { useState } from "react";
import { waitForIngestionJob } from "@/lib/client/ingestion";

export function ImageImportForm() {
  const [filePath, setFilePath] = useState("");
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
      const response = await fetch("/api/ingestion/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          sourceType: "IMAGE_UPLOAD",
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Import failed" }));
        setStatus(body.error ?? "Import failed");
        return;
      }

      const data = await response.json();
      setLastJobId(data.jobId);
      setStatus(data.deduped ? `Using existing import: ${data.jobId}` : `Job started: ${data.jobId}`);
      setFilePath("");

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
      <h3>Import Image Path</h3>
      <input
        placeholder="/path/to/image.jpg"
        value={filePath}
        onChange={(event) => setFilePath(event.target.value)}
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? "Importing..." : "Import Image"}
      </button>
      <p className="muted">In production, this should be wired to camera/photo upload storage.</p>
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
