import { TagSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, notFound, serverError } from "@/lib/http";
import { AddTagSchema } from "@/lib/schemas/api";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;

    const recipe = await prisma.recipe.findFirst({ where: { id, userId: user.id, isArchived: false } });
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
        userId_name: {
          userId: user.id,
          name: tagName,
        },
      },
      update: {},
      create: {
        userId: user.id,
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
