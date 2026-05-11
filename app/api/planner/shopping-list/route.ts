import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/http";
import { ShoppingListSchema } from "@/lib/schemas/api";
import { consolidateShoppingItems } from "@/lib/services/shoppingList";

export async function POST(request: NextRequest) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (!hasScope(principal, "shoppingLists:write")) {
      return forbidden("Missing shoppingLists:write scope");
    }
    const parsed = ShoppingListSchema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const recipes = await prisma.recipe.findMany({
      where: {
        id: { in: parsed.data.recipeIds },
        householdId: principal.householdId,
        isArchived: false,
      },
      include: {
        ingredients: true,
      },
    });

    const scale = parsed.data.servingsScale ?? 1;

    const allIngredients = recipes.flatMap((recipe) =>
      recipe.ingredients.map((ingredient) => ({
        ingredientId: ingredient.ingredientId,
        itemName: ingredient.itemName,
        normalizedQuantity: ingredient.normalizedQuantity
          ? ingredient.normalizedQuantity * scale
          : undefined,
        normalizedUnit: ingredient.normalizedUnit,
      })),
    );

    const measurementPref = principal.measurementPref as "UK" | "US" | "METRIC" | null;
    const conversionPrefs = (principal.conversionPrefs as
      | { keepSmallVolumeUnits?: boolean; forceMetricMass?: boolean }
      | null) ?? {};

    const consolidated = consolidateShoppingItems(
      allIngredients,
      measurementPref ?? "UK",
      conversionPrefs,
    );

    const shoppingList = await prisma.shoppingList.create({
      data: {
        userId: principal.actorType === "user" ? principal.userId : undefined,
        householdId: principal.householdId,
        createdByUserId: principal.actorType === "user" ? principal.userId : undefined,
        createdByTokenId: principal.actorType === "apiToken" ? principal.apiTokenId : undefined,
        title: parsed.data.title ?? "Generated Shopping List",
      },
    });

    if (consolidated.length > 0) {
      await prisma.shoppingListItem.createMany({
        data: consolidated.map((item) => ({
          shoppingListId: shoppingList.id,
          itemName: item.itemName,
          quantity: item.displayQuantity,
          unit: item.displayUnit,
          normalizedQuantity: item.normalizedQuantity,
          normalizedUnit: item.normalizedUnit,
        })),
      });
    }

    return NextResponse.json({
      shoppingListId: shoppingList.id,
      items: consolidated,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to generate shopping list");
  }
}
