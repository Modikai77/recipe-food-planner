import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, notFound, serverError } from "@/lib/http";
import { RecipeUpdateSchema } from "@/lib/schemas/api";
import { normalizeQuantity } from "@/lib/services/unitConversion";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;

    const recipe = await prisma.recipe.findFirst({
      where: { id, userId: user.id, isArchived: false },
      include: {
        ingredients: { orderBy: { sortOrder: "asc" } },
        steps: { orderBy: { stepNumber: "asc" } },
        tags: { include: { tag: true } },
      },
    });

    if (!recipe) {
      return notFound("Recipe not found");
    }

    return NextResponse.json(recipe);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to load recipe");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;

    const existing = await prisma.recipe.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return notFound("Recipe not found");
    }

    const json = await request.json();
    const parsed = RecipeUpdateSchema.safeParse(json);

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const payload = parsed.data;

    await prisma.recipe.update({
      where: { id: existing.id },
      data: {
        title: payload.title,
        description: payload.description,
        notes: payload.notes,
        sourceLabel: payload.sourceLabel,
        sourceUrl: payload.sourceUrl,
        imagePath: payload.imagePath,
        rating: payload.rating,
        favourite: payload.favourite,
        adultFavourite: payload.adultFavourite,
        kidsFavourite: payload.kidsFavourite,
        servings: payload.servings,
        prepMinutes: payload.prepMinutes,
        cookMinutes: payload.cookMinutes,
        cuisine: payload.cuisine,
        vegetarian: payload.vegetarian,
        glutenFree: payload.glutenFree,
        kidFriendlyScore: payload.kidFriendlyScore,
      },
    });

    if (payload.ingredients) {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: existing.id } });

      if (payload.ingredients.length > 0) {
        await prisma.recipeIngredient.createMany({
          data: payload.ingredients.map((ingredient, index) => {
            const normalized = normalizeQuantity(ingredient.quantity, ingredient.unit);

            return {
              recipeId: existing.id,
              originalText: ingredient.originalText,
              itemName: ingredient.itemName,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              normalizedQuantity: normalized.normalizedQuantity,
              normalizedUnit: normalized.normalizedUnit,
              notes: ingredient.notes,
              sortOrder: index,
            };
          }),
        });
      }
    }

    if (payload.steps) {
      await prisma.recipeStep.deleteMany({ where: { recipeId: existing.id } });

      if (payload.steps.length > 0) {
        await prisma.recipeStep.createMany({
          data: payload.steps.map((step) => ({
            recipeId: existing.id,
            stepNumber: step.stepNumber,
            instruction: step.instruction,
            timerMinutes: step.timerMinutes,
          })),
        });
      }
    }

    const recipe = await prisma.recipe.findUnique({
      where: { id: existing.id },
      include: {
        ingredients: { orderBy: { sortOrder: "asc" } },
        steps: { orderBy: { stepNumber: "asc" } },
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json(recipe);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to update recipe");
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;

    const existing = await prisma.recipe.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return notFound("Recipe not found");
    }

    await prisma.recipe.update({
      where: { id: existing.id },
      data: { isArchived: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to archive recipe");
  }
}
