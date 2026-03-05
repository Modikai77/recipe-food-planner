import { TagSource } from "@prisma/client";
import type { RecipeExtraction } from "@/lib/schemas/recipeExtraction";

export function computeAutoTags(extraction: RecipeExtraction): string[] {
  const tags: string[] = [];

  if (extraction.dietary.vegetarian === "yes") {
    tags.push("vegetarian");
  }

  if (extraction.dietary.vegetarian === "no") {
    tags.push("non_vegetarian");
  }

  if (extraction.dietary.gluten_free === "yes") {
    tags.push("gluten_free");
  }

  if (extraction.dietary.gluten_free === "no") {
    tags.push("contains_gluten");
  }

  if ((extraction.kid_friendly_score ?? 0) >= 0.7) {
    tags.push("kid_friendly");
  }

  return Array.from(new Set(tags));
}

export const AUTO_TAG_SOURCE = TagSource.AUTO;
export const MANUAL_TAG_SOURCE = TagSource.MANUAL;
