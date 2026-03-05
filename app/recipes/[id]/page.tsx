import { notFound } from "next/navigation";
import { RecipeNotesForm } from "@/components/RecipeNotesForm";
import { RecipeDeleteButton } from "@/components/RecipeDeleteButton";
import { RecipeImageForm } from "@/components/RecipeImageForm";
import { RecipeScoreForm } from "@/components/RecipeScoreForm";
import { RecipeSourceForm } from "@/components/RecipeSourceForm";
import { ReprocessRecipeButton } from "@/components/ReprocessRecipeButton";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  toDisplayUnit,
  type ConversionPrefs,
  type MeasurementPreference,
} from "@/lib/services/unitConversion";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const userProfile = await prisma.user.findUnique({ where: { id: user.id } });
  const preference = (userProfile?.measurementPref as MeasurementPreference | null) ?? "UK";
  const conversionPrefs = (userProfile?.conversionPrefs as ConversionPrefs | null) ?? {};

  const recipe = await prisma.recipe.findFirst({
    where: { id, userId: user.id, isArchived: false },
    include: {
      ingredients: { orderBy: { sortOrder: "asc" } },
      steps: { orderBy: { stepNumber: "asc" } },
      tags: { include: { tag: true } },
    },
  });

  if (!recipe) {
    notFound();
  }

  return (
    <article style={{ padding: "1rem 0 2rem" }}>
      <a href="/recipes">Back to recipes</a>
      <h2>{recipe.title}</h2>
      <div>
        {recipe.adultFavourite ? <span className="badge">Adult favourite</span> : null}
        {recipe.kidsFavourite ? <span className="badge">Kids favourite</span> : null}
        {recipe.vegetarian ? <span className="badge">Vegetarian</span> : null}
        {recipe.rating !== null && recipe.rating !== undefined ? (
          <span className="badge">{recipe.rating}/10</span>
        ) : null}
      </div>
      {recipe.description ? <p>{recipe.description}</p> : null}
      {recipe.imagePath ? (
        <img
          src={recipe.imagePath}
          alt={recipe.title}
          style={{
            width: "100%",
            maxWidth: 560,
            borderRadius: 12,
            border: "1px solid var(--border)",
            objectFit: "cover",
            marginTop: "0.75rem",
          }}
        />
      ) : null}
      <RecipeImageForm recipeId={recipe.id} hasImage={Boolean(recipe.imagePath)} />
      <ReprocessRecipeButton recipeId={recipe.id} />
      <RecipeDeleteButton recipeId={recipe.id} />
      <RecipeScoreForm
        recipeId={recipe.id}
        initialRating={recipe.rating}
        initialAdultFavourite={recipe.adultFavourite}
        initialKidsFavourite={recipe.kidsFavourite}
        initialVegetarian={recipe.vegetarian}
      />
      <p className="muted">
        {recipe.servings ? `Serves ${recipe.servings} | ` : ""}
        {recipe.prepMinutes ? `Prep ${recipe.prepMinutes}m` : "Prep time n/a"} | {recipe.cookMinutes ? `Cook ${recipe.cookMinutes}m` : "Cook time n/a"}
      </p>
      <div>
        {recipe.tags.map((tag) => (
          <span key={tag.tagId} className="badge">
            {tag.tag.name}
          </span>
        ))}
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h3>Source</h3>
        <RecipeSourceForm
          recipeId={recipe.id}
          initialSourceUrl={recipe.sourceUrl}
          initialSourceLabel={recipe.sourceLabel}
        />
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h3>Ingredients</h3>
        <ul>
          {recipe.ingredients.map((ingredient) => {
            const display = toDisplayUnit(
              ingredient.normalizedQuantity,
              ingredient.normalizedUnit,
              preference,
              conversionPrefs,
            );

            const amountText =
              display.quantity !== undefined && display.unit
                ? `${display.quantity} ${display.unit}`
                : ingredient.quantity !== null && ingredient.quantity !== undefined
                  ? `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ""}`
                  : "";

            return (
              <li key={ingredient.id}>
                {amountText ? `${amountText} ` : ""}
                {ingredient.itemName}
                {ingredient.notes ? ` (${ingredient.notes})` : ""}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h3>Method</h3>
        <ol>
          {recipe.steps.map((step) => (
            <li key={step.id}>{step.instruction}</li>
          ))}
        </ol>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h3>Notes</h3>
        <RecipeNotesForm recipeId={recipe.id} initialNotes={recipe.notes} />
      </section>
    </article>
  );
}
