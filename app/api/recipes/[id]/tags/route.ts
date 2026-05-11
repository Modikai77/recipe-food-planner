import { TagSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "@/lib/http";
import { AddTagSchema } from "@/lib/schemas/api";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (!hasScope(principal, "recipes:write")) {
      return forbidden("Missing recipes:write scope");
    }
    const { id } = await context.params;

    const recipe = await prisma.recipe.findFirst({
      where: { id, householdId: principal.householdId, isArchived: false },
    });
    if (!recipe) {
      return notFound("Recipe not found");
    }

    const parsed = AddTagSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const tagName = parsed.data.tag.trim().toLowerCase();

    const tag = await prisma.tag.upsert({
      where: {
        householdId_name: {
          householdId: principal.householdId,
          name: tagName,
        },
      },
      update: {},
      create: {
        userId: principal.actorType === "user" ? principal.userId : undefined,
        householdId: principal.householdId,
        name: tagName,
        source: TagSource.MANUAL,
      },
    });

    await prisma.recipeTag.upsert({
      where: {
        recipeId_tagId: {
          recipeId: recipe.id,
          tagId: tag.id,
        },
      },
      update: {},
      create: {
        recipeId: recipe.id,
        tagId: tag.id,
      },
    });

    return NextResponse.json({ ok: true, tag });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to add tag");
  }
}
