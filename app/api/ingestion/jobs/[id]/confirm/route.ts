import { JobStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, notFound, serverError } from "@/lib/http";
import { RecipeExtractionSchema } from "@/lib/schemas/recipeExtraction";
import { resolveVegetarian } from "@/lib/services/dietary";
import { normalizeQuantity } from "@/lib/services/unitConversion";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;

    const job = await prisma.ingestionJob.findFirst({ where: { id, userId: user.id } });
    if (!job) {
      return notFound("Job not found");
    }

    if (!job.recipeId) {
      return badRequest("Job has no draft recipe");
    }

    const parsed = RecipeExtractionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const data = parsed.data;

    await prisma.recipe.update({
      where: { id: job.recipeId },
      data: {
        title: data.title,
        description: data.description,
        servings: data.servings,
        prepMinutes: data.prep_minutes,
        cookMinutes: data.cook_minutes,
        mealType: data.meal_type === "unknown" ? null : data.meal_type,
        cuisine: data.cuisine,
        vegetarian: resolveVegetarian(data),
        glutenFree:
          data.dietary.gluten_free === "unknown" ? null : data.dietary.gluten_free === "yes",
        kidFriendlyScore: data.kid_friendly_score,
        parseConfidence: data.parse_confidence,
      },
    });

    await prisma.recipeIngredient.deleteMany({ where: { recipeId: job.recipeId } });
    await prisma.recipeStep.deleteMany({ where: { recipeId: job.recipeId } });

    if (data.ingredients.length > 0) {
      await prisma.recipeIngredient.createMany({
        data: data.ingredients.map((ingredient, index) => {
          const normalized = normalizeQuantity(ingredient.quantity, ingredient.unit);

          return {
            recipeId: job.recipeId!,
            originalText: ingredient.original_text,
            itemName: ingredient.item_name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            normalizedQuantity: normalized.normalizedQuantity,
            normalizedUnit: normalized.normalizedUnit,
            notes: ingredient.preparation,
            sortOrder: index,
          };
        }),
      });
    }

    if (data.steps.length > 0) {
      await prisma.recipeStep.createMany({
        data: data.steps.map((step) => ({
          recipeId: job.recipeId!,
          stepNumber: step.step_number,
          instruction: step.instruction,
          timerMinutes: step.timer_minutes,
        })),
      });
    }

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: JobStatus.COMPLETED },
    });

    return NextResponse.json({ ok: true, recipeId: job.recipeId });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to confirm ingestion");
  }
}
