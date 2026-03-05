import { SourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/http";
import { RecipeCreateSchema } from "@/lib/schemas/api";
import { normalizeQuantity } from "@/lib/services/unitConversion";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);

    const q = searchParams.get("q")?.trim();
    const vegetarian = searchParams.get("vegetarian");
    const glutenFree = searchParams.get("glutenFree");
    const tags = searchParams.getAll("tags").filter(Boolean);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "20");

    const where = {
      userId: user.id,
      isArchived: false,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(vegetarian !== null ? { vegetarian: vegetarian === "true" } : {}),
      ...(glutenFree !== null ? { glutenFree: glutenFree === "true" } : {}),
      ...(tags.length > 0
        ? {
            tags: {
              some: {
                tag: {
                  name: {
                    in: tags,
                  },
                },
              },
            },
          }
        : {}),
    };

    const [total, recipes] = await Promise.all([
      prisma.recipe.count({ where }),
      prisma.recipe.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
          ingredients: true,
          steps: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      page,
      pageSize,
      total,
      recipes,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to list recipes");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json = await request.json();
    const parsed = RecipeCreateSchema.safeParse(json);

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const payload = parsed.data;

    const recipe = await prisma.recipe.create({
      data: {
        userId: user.id,
        sourceType: SourceType.MANUAL,
        title: payload.title,
        description: payload.description,
        notes: payload.notes,
        sourceLabel: payload.sourceLabel,
        sourceUrl: payload.sourceUrl,
        imagePath: payload.imagePath,
        rating: payload.rating,
        favourite: payload.favourite ?? false,
        adultFavourite: payload.adultFavourite ?? false,
        kidsFavourite: payload.kidsFavourite ?? false,
        servings: payload.servings,
        prepMinutes: payload.prepMinutes,
        cookMinutes: payload.cookMinutes,
        cuisine: payload.cuisine,
        vegetarian: payload.vegetarian,
        glutenFree: payload.glutenFree,
        kidFriendlyScore: payload.kidFriendlyScore,
      },
    });

    if (payload.ingredients.length > 0) {
      await prisma.recipeIngredient.createMany({
        data: payload.ingredients.map((ingredient, index) => {
          const normalized = normalizeQuantity(ingredient.quantity, ingredient.unit);

          return {
            recipeId: recipe.id,
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

    if (payload.steps.length > 0) {
      await prisma.recipeStep.createMany({
        data: payload.steps.map((step) => ({
          recipeId: recipe.id,
          stepNumber: step.stepNumber,
          instruction: step.instruction,
          timerMinutes: step.timerMinutes,
        })),
      });
    }

    const created = await prisma.recipe.findUnique({
      where: { id: recipe.id },
      include: {
        ingredients: true,
        steps: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to create recipe");
  }
}
