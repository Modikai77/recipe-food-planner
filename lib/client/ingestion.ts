type IngestionJobStatus = "QUEUED" | "PROCESSING" | "NEEDS_REVIEW" | "COMPLETED" | "FAILED";

type IngestionJobResponse = {
  id: string;
  status: IngestionJobStatus;
  recipeId: string | null;
  errorMessage: string | null;
};

const TERMINAL_STATUSES: IngestionJobStatus[] = ["NEEDS_REVIEW", "COMPLETED", "FAILED"];

export async function waitForIngestionJob(jobId: string): Promise<IngestionJobResponse | null> {
  const maxAttempts = 25;
  const delayMs = 1200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`/api/ingestion/jobs/${jobId}`, { cache: "no-store" });
      if (response.ok) {
        const job = (await response.json()) as IngestionJobResponse;
        if (TERMINAL_STATUSES.includes(job.status)) {
          return job;
        }
      }
    } catch {
      // Ignore transient polling failures and continue polling.
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}
