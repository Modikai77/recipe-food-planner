import { SourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound, serverError } from "@/lib/http";
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
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;

    const recipe = await prisma.recipe.findFirst({
      where: { id, userId: user.id, isArchived: false },
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
            userId: user.id,
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
      userId: user.id,
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
