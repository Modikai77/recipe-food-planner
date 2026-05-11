import { SourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdPrincipal, hasScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/http";
import {
  extractRecipeFromSource,
  replaceRecipeWithExtraction,
} from "@/lib/services/ingestion";
import {
  extractRecipeFromJsonLd,
  extractImageHintFromHtml,
  extractTitleHintFromHtml,
  htmlToText,
  sourceLabelFromUrl,
} from "@/lib/services/urlRecipeExtraction";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await getHouseholdPrincipal();
    if (!principal) {
      return unauthorized();
    }
    if (!hasScope(principal, "recipes:write")) {
      return forbidden("Missing recipes:write scope");
    }
    const { id } = await context.params;

    const recipe = await prisma.recipe.findFirst({
      where: { id, householdId: principal.householdId, isArchived: false },
      include: {
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!recipe) {
      return notFound("Recipe not found");
    }

    let sourceText = recipe.versions[0]?.rawText ?? recipe.title;
    let titleHint = recipe.title;
    let imagePath: string | undefined;
    let sourceLabel = recipe.sourceLabel ?? undefined;

    if (recipe.sourceType === SourceType.URL_IMPORT && recipe.sourceUrl) {
      try {
        const response = await fetch(recipe.sourceUrl);
        const html = await response.text();
        titleHint = extractTitleHintFromHtml(html, recipe.sourceUrl) ?? recipe.title;
        imagePath = extractImageHintFromHtml(html) ?? undefined;
        sourceLabel = sourceLabelFromUrl(recipe.sourceUrl) ?? sourceLabel;

        const structured = extractRecipeFromJsonLd(html);
        if (structured) {
          await replaceRecipeWithExtraction({
            recipeId: recipe.id,
            householdId: principal.householdId,
            userId: principal.actorType === "user" ? principal.userId : undefined,
            sourceText: structured.sourceText,
            extraction: structured.extraction,
            model: "structured-import",
            imagePath: structured.imageUrl ?? imagePath,
            sourceLabel,
          });

          return NextResponse.json({ ok: true, recipeId: recipe.id });
        }

        sourceText = htmlToText(html)
          .replace(/\b(cookie|privacy|subscribe|advertisement)\b/gi, " ")
          .slice(0, 20000);
      } catch {
        // Keep existing sourceText when URL fetch fails.
      }
    }

    const parsed = await extractRecipeFromSource(sourceText, titleHint);

    await replaceRecipeWithExtraction({
      recipeId: recipe.id,
      householdId: principal.householdId,
      userId: principal.actorType === "user" ? principal.userId : undefined,
      sourceText,
      extraction: parsed.extraction,
      model: parsed.model,
      imagePath,
      sourceLabel,
    });

    return NextResponse.json({ ok: true, recipeId: recipe.id });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to reprocess recipe");
  }
}
