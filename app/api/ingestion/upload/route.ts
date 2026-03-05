import { access } from "node:fs/promises";
import { JobStatus, SourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/http";
import { UploadIngestionSchema } from "@/lib/schemas/api";
import { createIngestionJob, processIngestionJob } from "@/lib/services/ingestion";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = UploadIngestionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    if (!process.env.OPENAI_API_KEY) {
      return badRequest("OPENAI_API_KEY is missing. Photo parsing requires OpenAI vision.");
    }

    try {
      await access(parsed.data.filePath);
    } catch {
      return badRequest(
        `Image file not found or unreadable at path: ${parsed.data.filePath}. Use full absolute path.`,
      );
    }

    const sourceType = parsed.data.sourceType as SourceType;

    const { jobId, wasDeduped } = await createIngestionJob({
      userId: user.id,
      sourceType,
      imagePath: parsed.data.filePath,
    });

    const sourceText =
      parsed.data.sourceText ??
      `Image imported from ${parsed.data.filePath}. OCR text not available in this request.`;

    if (wasDeduped) {
      const existingJob = await prisma.ingestionJob.findUnique({
        where: { id: jobId },
        select: { status: true, recipeId: true },
      });

      if (
        existingJob &&
        ((existingJob.status === JobStatus.COMPLETED || existingJob.status === JobStatus.NEEDS_REVIEW) &&
          existingJob.recipeId)
      ) {
        return NextResponse.json({ jobId, status: existingJob.status, deduped: true }, { status: 202 });
      }

      if (existingJob?.status === JobStatus.PROCESSING) {
        return NextResponse.json({ jobId, status: existingJob.status, deduped: true }, { status: 202 });
      }
    }

    await processIngestionJob(
      jobId,
      sourceText,
      undefined,
      undefined,
      undefined,
      parsed.data.filePath,
    );

    return NextResponse.json({ jobId, status: "QUEUED", deduped: false }, { status: 202 });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to start upload ingestion");
  }
}
