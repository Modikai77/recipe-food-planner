import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/http";

export async function DELETE(
  _: NextRequest,
  context: { params: Promise<{ id: string; tagId: string }> },
) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (!hasScope(principal, "recipes:write")) {
      return forbidden("Missing recipes:write scope");
    }
    const { id, tagId } = await context.params;

    const recipe = await prisma.recipe.findFirst({
      where: { id, householdId: principal.householdId, isArchived: false },
    });
    if (!recipe) {
      return notFound("Recipe not found");
    }

    await prisma.recipeTag.deleteMany({
      where: {
        recipeId: recipe.id,
        tagId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to remove tag");
  }
}
