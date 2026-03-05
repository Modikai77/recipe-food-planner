import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/http";
import { RecommendSchema } from "@/lib/schemas/api";
import { recommendRecipes } from "@/lib/services/recommendations";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = RecommendSchema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const input = parsed.data;

    const recipes = await prisma.recipe.findMany({
      where: {
        userId: user.id,
        isArchived: false,
      },
      select: {
        id: true,
        title: true,
        adultFavourite: true,
        kidsFavourite: true,
        vegetarian: true,
        glutenFree: true,
        kidFriendlyScore: true,
        prepMinutes: true,
        cuisine: true,
        tags: { include: { tag: true } },
      },
    });

    const recommendations = recommendRecipes(
      recipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        adultFavourite: recipe.adultFavourite,
        kidsFavourite: recipe.kidsFavourite,
        vegetarian: recipe.vegetarian,
        glutenFree: recipe.glutenFree,
        kidFriendlyScore: recipe.kidFriendlyScore,
        prepMinutes: recipe.prepMinutes,
        cuisine: recipe.cuisine,
        tags: recipe.tags.map((recipeTag) => recipeTag.tag.name),
      })),
      {
        count: input.count ?? recipes.length,
        audience: input.audience,
        constraints: input.constraints,
      },
    );

    return NextResponse.json({ recipes: recommendations });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to generate recommendations");
  }
}
