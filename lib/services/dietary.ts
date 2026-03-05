import type { RecipeExtraction } from "@/lib/schemas/recipeExtraction";

const NON_VEG_KEYWORDS = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "turkey",
  "bacon",
  "ham",
  "sausage",
  "fish",
  "salmon",
  "tuna",
  "anchovy",
  "shrimp",
  "prawn",
  "crab",
  "lobster",
  "gelatin",
  "meat",
];

function looksNonVegetarian(text: string): boolean {
  const lower = text.toLowerCase();
  return NON_VEG_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function resolveVegetarian(extraction: RecipeExtraction): boolean | null {
  if (extraction.dietary.vegetarian === "yes") {
    return true;
  }

  if (extraction.dietary.vegetarian === "no") {
    return false;
  }

  const ingredientText = extraction.ingredients
    .map((ingredient) => `${ingredient.item_name} ${ingredient.original_text}`)
    .join(" ");

  if (!ingredientText.trim()) {
    return null;
  }

  return !looksNonVegetarian(ingredientText);
}
