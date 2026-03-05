import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound, serverError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const latestJob = await prisma.ingestionJob.findFirst({
      where: { userId: user.id },
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
