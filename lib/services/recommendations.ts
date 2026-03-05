export type RecipeForRecommendation = {
  id: string;
  title: string;
  adultFavourite?: boolean | null;
  kidsFavourite?: boolean | null;
  vegetarian?: boolean | null;
  glutenFree?: boolean | null;
  kidFriendlyScore?: number | null;
  prepMinutes?: number | null;
  cuisine?: string | null;
  tags: string[];
};

export type RecommendationRequest = {
  count?: number;
  audience?: string;
  constraints?: {
    vegetarian?: boolean;
    glutenFree?: boolean;
    adultFavourite?: boolean;
    kidsFavourite?: boolean;
    maxPrepMinutes?: number;
    includeTags?: string[];
    excludeTags?: string[];
  };
};

export type RecommendationResult = {
  recipeId: string;
  title: string;
  score: number;
  reasons: string[];
};

function normalizeTags(tags: string[] | undefined): string[] {
  return (tags ?? []).map((t) => t.trim().toLowerCase());
}

function hardFilter(
  recipes: RecipeForRecommendation[],
  request: RecommendationRequest,
): RecipeForRecommendation[] {
  const includeTags = normalizeTags(request.constraints?.includeTags);
  const excludeTags = normalizeTags(request.constraints?.excludeTags);

  return recipes.filter((recipe) => {
    if (
      request.constraints?.vegetarian !== undefined &&
      recipe.vegetarian !== request.constraints.vegetarian
    ) {
      return false;
    }

    if (
      request.constraints?.glutenFree !== undefined &&
      recipe.glutenFree !== request.constraints.glutenFree
    ) {
      return false;
    }

    if (
      request.constraints?.adultFavourite !== undefined &&
      recipe.adultFavourite !== request.constraints.adultFavourite
    ) {
      return false;
    }

    if (
      request.constraints?.kidsFavourite !== undefined &&
      recipe.kidsFavourite !== request.constraints.kidsFavourite
    ) {
      return false;
    }

    if (
      request.constraints?.maxPrepMinutes !== undefined &&
      recipe.prepMinutes !== null &&
      recipe.prepMinutes !== undefined &&
      recipe.prepMinutes > request.constraints.maxPrepMinutes
    ) {
      return false;
    }

    const tags = normalizeTags(recipe.tags);

    if (excludeTags.some((tag) => tags.includes(tag))) {
      return false;
    }

    if (includeTags.length > 0 && !includeTags.some((tag) => tags.includes(tag))) {
      return false;
    }

    return true;
  });
}

function computeScore(recipe: RecipeForRecommendation, request: RecommendationRequest): number {
  const tags = normalizeTags(recipe.tags);
  const kid = recipe.kidFriendlyScore ?? 0.5;
  const kidsFavouriteBoost = tags.includes("kids_favourite") ? 1 : 0;

  let prepFit = 0.5;
  if (request.constraints?.maxPrepMinutes && recipe.prepMinutes) {
    prepFit = Math.max(0, 1 - recipe.prepMinutes / request.constraints.maxPrepMinutes);
  }

  const includeTags = normalizeTags(request.constraints?.includeTags);
  const includeTagFit = includeTags.length
    ? includeTags.filter((tag) => tags.includes(tag)).length / includeTags.length
    : 0.5;

  return 0.35 * kid + 0.2 * kidsFavouriteBoost + 0.15 * prepFit + 0.2 * 0.5 + 0.1 * includeTagFit;
}

export function recommendRecipes(
  recipes: RecipeForRecommendation[],
  request: RecommendationRequest,
): RecommendationResult[] {
  const candidates = hardFilter(recipes, request)
    .map((recipe) => ({
      recipe,
      score: computeScore(recipe, request),
    }))
    .sort((a, b) => b.score - a.score);

  const selected: RecommendationResult[] = [];
  const maxCount = request.count ?? candidates.length;
  const cuisines = new Set<string>();

  for (const candidate of candidates) {
    if (selected.length >= maxCount) {
      break;
    }

    const cuisine = candidate.recipe.cuisine?.toLowerCase();
    if (cuisine && cuisines.has(cuisine) && candidates.length > maxCount) {
      continue;
    }

    if (cuisine) {
      cuisines.add(cuisine);
    }

    const reasons: string[] = [];
    if ((candidate.recipe.kidFriendlyScore ?? 0) >= 0.7) {
      reasons.push("Kid-friendly");
    }

    if (
      request.constraints?.maxPrepMinutes &&
      candidate.recipe.prepMinutes &&
      candidate.recipe.prepMinutes <= request.constraints.maxPrepMinutes
    ) {
      reasons.push(`Under ${request.constraints.maxPrepMinutes} min`);
    }

    if (candidate.recipe.tags.map((t) => t.toLowerCase()).includes("kids_favourite")) {
      reasons.push("Kids favourite");
    }

    if (candidate.recipe.adultFavourite) {
      reasons.push("Adult favourite");
    }

    selected.push({
      recipeId: candidate.recipe.id,
      title: candidate.recipe.title,
      score: Number(candidate.score.toFixed(2)),
      reasons,
    });
  }

  return selected;
}
