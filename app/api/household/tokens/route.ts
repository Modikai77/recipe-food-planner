import { NextRequest, NextResponse } from "next/server";
import {
  createApiTokenSecret,
  getHouseholdPrincipal,
  hasScope,
  sha256,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/http";
import { ApiTokenCreateSchema } from "@/lib/schemas/api";

export async function POST(request: NextRequest) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (principal.actorType !== "user" || !hasScope(principal, "household:admin")) {
      return forbidden("Only household owners can create API tokens");
    }

    const parsed = ApiTokenCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    if (parsed.data.scopes.includes("recipes:delete") || parsed.data.scopes.includes("recipes:archive")) {
      return badRequest("Machine tokens for Jarvis must not include recipe delete/archive scopes");
    }

    const secret = createApiTokenSecret();
    const apiToken = await prisma.apiToken.create({
      data: {
        householdId: principal.householdId,
        name: parsed.data.name.trim(),
        scopes: parsed.data.scopes,
        tokenHash: sha256(secret),
        createdByUserId: principal.userId,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });

    return NextResponse.json({ apiToken, token: secret }, { status: 201 });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to create API token");
  }
}
