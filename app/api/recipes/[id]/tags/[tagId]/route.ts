import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound, serverError } from "@/lib/http";

export async function DELETE(
  _: NextRequest,
  context: { params: Promise<{ id: string; tagId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, tagId } = await context.params;

    const recipe = await prisma.recipe.findFirst({ where: { id, userId: user.id, isArchived: false } });
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
