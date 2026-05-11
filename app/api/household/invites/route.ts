import { randomBytes } from "node:crypto";
import { HouseholdRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope, sha256 } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/http";
import { HouseholdInviteCreateSchema } from "@/lib/schemas/api";

const INVITE_DAYS = 14;

export async function POST(request: NextRequest) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (principal.actorType !== "user" || !hasScope(principal, "household:admin")) {
      return forbidden("Only household owners can create invites");
    }

    const parsed = HouseholdInviteCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const token = randomBytes(32).toString("base64url");
    const invite = await prisma.householdInvite.create({
      data: {
        householdId: principal.householdId,
        email: parsed.data.email.trim().toLowerCase(),
        role: parsed.data.role as HouseholdRole,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
        createdByUserId: principal.userId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({ invite, token }, { status: 201 });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to create invite");
  }
}
