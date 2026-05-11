import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (!hasScope(principal, "recipes:read")) {
      return forbidden("Missing recipes:read scope");
    }

    const latestJob = await prisma.ingestionJob.findFirst({
      where: { householdId: principal.householdId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (!latestJob) {
      return notFound("No ingestion jobs found for this account.");
    }

    return NextResponse.redirect(new URL(`/api/ingestion/jobs/${latestJob.id}`, request.url));
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to load latest ingestion job");
  }
}
