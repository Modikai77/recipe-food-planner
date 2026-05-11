import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forbidden, serverError, unauthorized } from "@/lib/http";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (!hasScope(principal, "recipes:read")) {
      return forbidden("Missing recipes:read scope");
    }
    const { id } = await context.params;

    const job = await prisma.ingestionJob.findFirst({
      where: {
        id,
        householdId: principal.householdId,
      },
    });

    if (!job) {
      const recentJobs = await prisma.ingestionJob.findMany({
        where: { householdId: principal.householdId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, status: true, updatedAt: true },
      });
      return NextResponse.json(
        {
          error: "Job not found for this account. Use the job ID from the current logged-in session.",
          recentJobs,
        },
        { status: 404 },
      );
    }

    const latestVersion = job.recipeId
      ? await prisma.recipeVersion.findFirst({
          where: { recipeId: job.recipeId },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const latestParsed =
      latestVersion && typeof latestVersion.parsedJson === "object" && latestVersion.parsedJson
        ? (latestVersion.parsedJson as {
            title?: string;
            parse_confidence?: number;
            ambiguities?: string[];
          })
        : null;

    return NextResponse.json({
      id: job.id,
      status: job.status,
      recipeId: job.recipeId,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      debug: {
        sourceType: job.sourceType,
        sourceUrl: job.sourceUrl,
        imagePath: job.imagePath,
        latestModel: latestVersion?.model ?? null,
        latestParseConfidence: latestVersion?.parseConfidence ?? latestParsed?.parse_confidence ?? null,
        latestExtractedTitle: latestParsed?.title ?? null,
        ambiguities: latestParsed?.ambiguities ?? [],
      },
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to load ingestion job");
  }
}
