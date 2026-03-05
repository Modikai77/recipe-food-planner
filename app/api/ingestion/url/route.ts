import { JobStatus, SourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/http";
import { UrlIngestionSchema } from "@/lib/schemas/api";
import {
  createIngestionJob,
  processIngestionJob,
  processIngestionJobWithExtraction,
} from "@/lib/services/ingestion";
import {
  extractRecipeFromJsonLd,
  extractImageHintFromHtml,
  extractTitleHintFromHtml,
  htmlToText,
  sourceLabelFromUrl,
} from "@/lib/services/urlRecipeExtraction";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = UrlIngestionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const { jobId, wasDeduped } = await createIngestionJob({
      userId: user.id,
      sourceType: SourceType.URL_IMPORT,
      sourceUrl: parsed.data.url,
    });
    const sourceLabel = sourceLabelFromUrl(parsed.data.url);
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

    let sourceText = `Recipe import from ${parsed.data.url}`;

    try {
      const response = await fetch(parsed.data.url);
      const html = await response.text();
      const titleHint = extractTitleHintFromHtml(html, parsed.data.url);
      const imageHint = extractImageHintFromHtml(html);
      const extracted = extractRecipeFromJsonLd(html);
      if (extracted) {
        await processIngestionJobWithExtraction(
          jobId,
          extracted.sourceText,
          extracted.extraction,
          extracted.imageUrl ?? imageHint,
          sourceLabel,
        );
        return NextResponse.json({ jobId, status: "QUEUED", deduped: false }, { status: 202 });
      }

      sourceText = htmlToText(html).replace(/\b(cookie|privacy|subscribe|advertisement)\b/gi, " ").slice(0, 20000);
      await processIngestionJob(jobId, sourceText, titleHint, imageHint, sourceLabel);
      return NextResponse.json({ jobId, status: "QUEUED", deduped: false }, { status: 202 });
    } catch {
      sourceText = `Failed to fetch URL content for ${parsed.data.url}. User must review manually.`;
    }

    await processIngestionJob(jobId, sourceText, undefined, undefined, sourceLabel);

    return NextResponse.json({ jobId, status: "QUEUED", deduped: false }, { status: 202 });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to start URL ingestion");
  }
}
