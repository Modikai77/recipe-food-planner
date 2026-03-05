import { AddRecipeForm } from "@/components/AddRecipeForm";
import { ImageImportForm } from "@/components/ImageImportForm";
import { UrlImportForm } from "@/components/UrlImportForm";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ ingestionJobId?: string }>;
}) {
  const user = await requireCurrentUser();
  const query = await searchParams;
  const ingestionJobId = query.ingestionJobId?.trim();
  const requestedJob = ingestionJobId
    ? await prisma.ingestionJob.findFirst({
        where: { id: ingestionJobId, userId: user.id },
        select: { id: true },
      })
    : null;
  const latestJob = await prisma.ingestionJob.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const debugJobId = requestedJob?.id ?? latestJob?.id ?? null;
  const usedFallbackLatest = Boolean(ingestionJobId && !requestedJob && latestJob);

  const recipes = await prisma.recipe.findMany({
    where: { userId: user.id, isArchived: false },
    include: {
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div style={{ padding: "1rem 0 2rem" }}>
      <h2>Recipes</h2>
      <p className="muted">Create manually, import from URL, or ingest from a captured recipe image.</p>
      <section className="card" style={{ marginBottom: "1rem" }}>
        <h3>Import Debug</h3>
        <p>
          <a href="/api/ingestion/jobs/latest" target="_blank" rel="noreferrer">
            View latest import debug
          </a>
        </p>
      </section>
      {debugJobId ? (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <h3>Latest Import</h3>
          {usedFallbackLatest ? (
            <p className="muted">Requested import ID was unavailable for this account; showing latest import.</p>
          ) : null}
          <p className="muted">
            Job ID: <code>{debugJobId}</code>
          </p>
          <p>
            <a href={`/api/ingestion/jobs/${debugJobId}`} target="_blank" rel="noreferrer">
              View latest import debug
            </a>
          </p>
        </section>
      ) : null}

      <div className="grid" style={{ marginBottom: "1rem" }}>
        <AddRecipeForm />
        <UrlImportForm />
        <ImageImportForm />
      </div>

      <section className="card">
        <h3>Saved Recipes</h3>
        {recipes.length === 0 ? <p className="muted">No recipes saved yet.</p> : null}
        <ul className="clean">
          {recipes.map((recipe) => (
            <li key={recipe.id} style={{ padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
              <a href={`/recipes/${recipe.id}`}>
                <strong>{recipe.title}</strong>
              </a>
              {recipe.adultFavourite ? <span className="badge">Adult favourite</span> : null}
              {recipe.kidsFavourite ? <span className="badge">Kids favourite</span> : null}
              {recipe.vegetarian ? <span className="badge">Vegetarian</span> : null}
              {recipe.rating !== null && recipe.rating !== undefined ? (
                <span className="badge">{recipe.rating}/10</span>
              ) : null}
              {recipe.servings ? <span className="badge">{recipe.servings} servings</span> : null}
              <div>
                {recipe.tags.map((tag) => (
                  <span key={tag.tagId} className="badge">
                    {tag.tag.name}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
