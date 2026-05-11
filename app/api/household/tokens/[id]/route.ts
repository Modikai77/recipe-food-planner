import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/http";

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (principal.actorType !== "user" || !hasScope(principal, "household:admin")) {
      return forbidden("Only household owners can revoke API tokens");
    }

    const { id } = await context.params;
    const token = await prisma.apiToken.findFirst({
      where: { id, householdId: principal.householdId },
      select: { id: true },
    });

    if (!token) {
      return notFound("API token not found");
    }

    await prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to revoke API token");
  }
}
