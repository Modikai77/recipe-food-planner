import type { SourceType } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JobStatus, TagSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOpenAIClient } from "@/lib/openai/client";
import { RecipeExtractionSchema, type RecipeExtraction } from "@/lib/schemas/recipeExtraction";
import { resolveVegetarian } from "@/lib/services/dietary";
import { computeAutoTags } from "@/lib/services/tagging";
import { normalizeQuantity } from "@/lib/services/unitConversion";

const PARSE_MODEL = process.env.OPENAI_MODEL_PARSE ?? "gpt-4.1-mini";
const FALLBACK_MODEL = process.env.OPENAI_MODEL_FALLBACK ?? "gpt-4.1";
const MAX_DEBUG_ERROR_MESSAGE_LENGTH = 1800;

function trimDebug(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 220) {
    return singleLine;
  }

  return `${singleLine.slice(0, 217)}...`;
}

function diagnosticsToErrorMessage(diagnostics: string[]): string | null {
  if (diagnostics.length === 0) {
    return null;
  }

  return diagnostics
    .map((line, index) => `${index + 1}. ${line}`)
    .join(" | ")
    .slice(0, MAX_DEBUG_ERROR_MESSAGE_LENGTH);
}

function buildRecipeParsePrompt(rawText: string): string {
  return [
    "Extract a single recipe from this content.",
    "Return valid JSON only. Do not use markdown code fences.",
    "Use exactly these keys:",
    "title, description, servings, prep_minutes, cook_minutes, meal_type, cuisine,",
    "ingredients, steps, dietary, kid_friendly_score, parse_confidence, ambiguities",
    "Do not invent quantities.",
    "Content:",
    rawText,
  ].join("\n");
}

function buildRecipeParseImagePrompt(): string {
  return [
    "Extract a single recipe from this image.",
    "Return valid JSON only. Do not use markdown code fences.",
    "Use exactly these keys:",
    "title, description, servings, prep_minutes, cook_minutes, meal_type, cuisine,",
    "ingredients, steps, dietary, kid_friendly_score, parse_confidence, ambiguities",
    "Do not invent quantities that are not present.",
  ].join("\n");
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }

  if (ext === ".webp") {
    return "image/webp";
  }

  if (ext === ".gif") {
    return "image/gif";
  }

  return "image/jpeg";
}

function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseRecipeExtraction(
  rawOutput: string,
): { extraction: RecipeExtraction | null; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const candidates: string[] = [rawOutput];

  const fenced = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1]);
  }

  const firstObject = extractFirstJsonObject(rawOutput);
  if (firstObject) {
    candidates.push(firstObject);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      return {
        extraction: RecipeExtractionSchema.parse(parsed),
        diagnostics,
      };
    } catch (error) {
      diagnostics.push(
        trimDebug(
          error instanceof Error
            ? `Extraction parse candidate failed: ${error.message}`
            : "Extraction parse candidate failed.",
        ),
      );
    }
  }

  return { extraction: null, diagnostics };
}

async function parseWithOpenAIFromText(
  rawText: string,
  model: string,
  diagnostics?: string[],
): Promise<RecipeExtraction | null> {
  const client = getOpenAIClient();
  if (!client) {
    diagnostics?.push("OpenAI client unavailable (missing OPENAI_API_KEY).");
    return null;
  }

  let rawOutput = "";
  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: buildRecipeParsePrompt(rawText) }],
        },
      ],
    });
    rawOutput = response.output_text?.trim() ?? "";
  } catch (error) {
    diagnostics?.push(
      trimDebug(
        error instanceof Error
          ? `OpenAI text parse failed (${model}): ${error.message}`
          : `OpenAI text parse failed (${model}).`,
      ),
    );
    return null;
  }

  if (!rawOutput) {
    diagnostics?.push(`OpenAI text parse returned empty output (${model}).`);
    return null;
  }

  const parsed = parseRecipeExtraction(rawOutput);
  diagnostics?.push(...parsed.diagnostics.map((message) => `${model}: ${message}`));
  if (!parsed.extraction) {
    diagnostics?.push(`OpenAI text parse output invalid JSON schema (${model}).`);
  }

  return parsed.extraction;
}

async function parseWithOpenAIFromImagePath(
  filePath: string,
  model: string,
  diagnostics?: string[],
): Promise<RecipeExtraction | null> {
  const client = getOpenAIClient();
  if (!client) {
    diagnostics?.push("OpenAI client unavailable (missing OPENAI_API_KEY).");
    return null;
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = await readFile(filePath);
  } catch (error) {
    diagnostics?.push(
      trimDebug(
        error instanceof Error
          ? `Image read failed: ${filePath} (${error.message})`
          : `Image read failed: ${filePath}`,
      ),
    );
    return null;
  }

  const mime = mimeFromPath(filePath);
  const imageDataUrl = `data:${mime};base64,${imageBuffer.toString("base64")}`;

  let rawOutput = "";
  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: buildRecipeParseImagePrompt() },
            { type: "input_image", image_url: imageDataUrl, detail: "auto" },
          ],
        },
      ],
    });

    rawOutput = response.output_text?.trim() ?? "";
  } catch (error) {
    diagnostics?.push(
      trimDebug(
        error instanceof Error
          ? `OpenAI image parse failed (${model}): ${error.message}`
          : `OpenAI image parse failed (${model}).`,
      ),
    );
    return null;
  }

  if (!rawOutput) {
    diagnostics?.push(`OpenAI image parse returned empty output (${model}).`);
    return null;
  }

  const parsed = parseRecipeExtraction(rawOutput);
  diagnostics?.push(...parsed.diagnostics.map((message) => `${model}: ${message}`));
  if (!parsed.extraction) {
    diagnostics?.push(`OpenAI image parse output invalid JSON schema (${model}).`);
  }

  return parsed.extraction;
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferTitle(sourceText: string, titleHint?: string): string {
  const cleanedHint = titleHint?.trim();
  if (cleanedHint) {
    return cleanedHint;
  }

  const titleLine = sourceText.match(/(?:^|\n)\s*title\s*:\s*(.+)/i)?.[1]?.trim();
  if (titleLine) {
    return titleLine;
  }

  const firstSentence = sourceText
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^(ingredients?|method|instructions?)\s*:?\s*$/i.test(line));
  if (firstSentence) {
    return firstSentence.slice(0, 80);
  }

  return "Untitled Recipe";
}

function fallbackExtraction(sourceText: string, titleHint?: string): RecipeExtraction {
  return {
    title: toTitleCase(inferTitle(sourceText, titleHint)),
    description: "Review and edit this draft recipe.",
    meal_type: "unknown",
    ingredients: [
      {
        original_text: "1 item",
        item_name: "item",
        quantity: 1,
        unit: "count",
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: sourceText.slice(0, 250) || "Review imported text and add steps.",
      },
    ],
    dietary: {
      vegetarian: "unknown",
      gluten_free: "unknown",
    },
    parse_confidence: 0.3,
    ambiguities: ["Auto-parse unavailable; manual review needed"],
  };
}

async function parseSource(
  sourceText: string,
  titleHint?: string,
): Promise<{ extraction: RecipeExtraction; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const primary = await parseWithOpenAIFromText(sourceText, PARSE_MODEL, diagnostics);
  if (primary) {
    if (!primary.title?.trim()) {
      primary.title = inferTitle(sourceText, titleHint);
    }
    return { extraction: primary, diagnostics };
  }

  diagnostics.push(`Falling back to ${FALLBACK_MODEL} for text parse.`);
  const fallback = await parseWithOpenAIFromText(sourceText, FALLBACK_MODEL, diagnostics);
  if (fallback) {
    if (!fallback.title?.trim()) {
      fallback.title = inferTitle(sourceText, titleHint);
    }
    return { extraction: fallback, diagnostics };
  }

  diagnostics.push("Using hard fallback extraction for text parse.");
  return { extraction: fallbackExtraction(sourceText, titleHint), diagnostics };
}

function extractionToSourceText(extraction: RecipeExtraction, fallback: string): string {
  const ingredientLines = extraction.ingredients.map((ingredient) => `- ${ingredient.original_text}`);
  const stepLines = extraction.steps.map((step) => `${step.step_number}. ${step.instruction}`);

  const text = [
    `Title: ${extraction.title}`,
    extraction.description ? `Description: ${extraction.description}` : "",
    ingredientLines.length > 0 ? "Ingredients:" : "",
    ...ingredientLines,
    stepLines.length > 0 ? "Method:" : "",
    ...stepLines,
  ]
    .filter(Boolean)
    .join("\n");

  return text || fallback;
}

async function extractRecipeFromImage(
  filePath: string,
  titleHint?: string,
): Promise<{ extraction: RecipeExtraction; model: string; sourceText: string; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const primary = await parseWithOpenAIFromImagePath(filePath, PARSE_MODEL, diagnostics);
  if (primary) {
    if (!primary.title?.trim()) {
      primary.title = inferTitle(`Image import from ${filePath}`, titleHint);
    }

    return {
      extraction: primary,
      model: modelFromExtraction(primary, PARSE_MODEL),
      sourceText: extractionToSourceText(primary, `Image import from ${filePath}`),
      diagnostics,
    };
  }

  diagnostics.push(`Falling back to ${FALLBACK_MODEL} for image parse.`);
  const fallback = await parseWithOpenAIFromImagePath(filePath, FALLBACK_MODEL, diagnostics);
  if (fallback) {
    if (!fallback.title?.trim()) {
      fallback.title = inferTitle(`Image import from ${filePath}`, titleHint);
    }

    return {
      extraction: fallback,
      model: modelFromExtraction(fallback, FALLBACK_MODEL),
      sourceText: extractionToSourceText(fallback, `Image import from ${filePath}`),
      diagnostics,
    };
  }

  diagnostics.push("Using hard fallback extraction for image parse.");
  const extraction = fallbackExtraction(`Image import from ${filePath}`, titleHint);
  return {
    extraction,
    model: FALLBACK_MODEL,
    sourceText: extractionToSourceText(extraction, `Image import from ${filePath}`),
    diagnostics,
  };
}

function modelFromExtraction(extraction: RecipeExtraction, defaultModel: string): string {
  return extraction.parse_confidence >= 0.9 ? "structured-import" : defaultModel;
}

async function upsertAutoTagsForRecipe(params: {
  userId: string;
  recipeId: string;
  extraction: RecipeExtraction;
}): Promise<void> {
  const autoTags = computeAutoTags(params.extraction);
  for (const tagName of autoTags) {
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId: params.userId, name: tagName } },
      update: {},
      create: {
        userId: params.userId,
        name: tagName,
        source: TagSource.AUTO,
      },
    });

    await prisma.recipeTag.upsert({
      where: {
        recipeId_tagId: {
          recipeId: params.recipeId,
          tagId: tag.id,
        },
      },
      update: {},
      create: {
        recipeId: params.recipeId,
        tagId: tag.id,
        confidence: params.extraction.parse_confidence,
      },
    });
  }
}

export async function replaceRecipeWithExtraction(params: {
  recipeId: string;
  userId: string;
  sourceText: string;
  extraction: RecipeExtraction;
  model: string;
  imagePath?: string;
  sourceLabel?: string;
}): Promise<void> {
  const { recipeId, userId, sourceText, extraction, model, imagePath, sourceLabel } = params;

  await prisma.recipe.update({
    where: { id: recipeId },
    data: {
      title: extraction.title,
      description: extraction.description,
      servings: extraction.servings,
      prepMinutes: extraction.prep_minutes,
      cookMinutes: extraction.cook_minutes,
      cuisine: extraction.cuisine,
      mealType: extraction.meal_type === "unknown" ? null : extraction.meal_type,
      vegetarian: resolveVegetarian(extraction),
      glutenFree:
        extraction.dietary.gluten_free === "unknown" ? null : extraction.dietary.gluten_free === "yes",
      kidFriendlyScore: extraction.kid_friendly_score,
      parseConfidence: extraction.parse_confidence,
      ...(imagePath ? { imagePath } : {}),
      ...(sourceLabel ? { sourceLabel } : {}),
    },
  });

  await prisma.recipeVersion.create({
    data: {
      recipeId,
      rawText: sourceText,
      parsedJson: extraction,
      model,
      parseConfidence: extraction.parse_confidence,
    },
  });

  await prisma.recipeIngredient.deleteMany({ where: { recipeId } });
  await prisma.recipeStep.deleteMany({ where: { recipeId } });

  if (extraction.ingredients.length > 0) {
    await prisma.recipeIngredient.createMany({
      data: extraction.ingredients.map((ingredient, index) => {
        const normalized = normalizeQuantity(ingredient.quantity, ingredient.unit);

        return {
          recipeId,
          originalText: ingredient.original_text,
          itemName: ingredient.item_name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          normalizedQuantity: normalized.normalizedQuantity,
          normalizedUnit: normalized.normalizedUnit,
          notes: ingredient.preparation,
          sortOrder: index,
        };
      }),
    });
  }

  if (extraction.steps.length > 0) {
    await prisma.recipeStep.createMany({
      data: extraction.steps.map((step) => ({
        recipeId,
        stepNumber: step.step_number,
        instruction: step.instruction,
        timerMinutes: step.timer_minutes,
      })),
    });
  }

  await upsertAutoTagsForRecipe({ userId, recipeId, extraction });
}

export async function extractRecipeFromSource(
  sourceText: string,
  titleHint?: string,
): Promise<{ extraction: RecipeExtraction; model: string; diagnostics: string[] }> {
  const parsed = await parseSource(sourceText, titleHint);
  return {
    extraction: parsed.extraction,
    model: modelFromExtraction(parsed.extraction, PARSE_MODEL),
    diagnostics: parsed.diagnostics,
  };
}

export async function createIngestionJob(params: {
  userId: string;
  sourceType: SourceType;
  sourceUrl?: string;
  imagePath?: string;
}): Promise<{ jobId: string; wasDeduped: boolean }> {
  const dedupeWindowStart = new Date(Date.now() - 2 * 60 * 1000);
  const existingActive = await prisma.ingestionJob.findFirst({
    where: {
      userId: params.userId,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl ?? null,
      imagePath: params.imagePath ?? null,
      createdAt: { gte: dedupeWindowStart },
      status: {
        in: [JobStatus.QUEUED, JobStatus.PROCESSING],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingActive) {
    return { jobId: existingActive.id, wasDeduped: true };
  }

  const existingCompleted = await prisma.ingestionJob.findFirst({
    where: {
      userId: params.userId,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl ?? null,
      imagePath: params.imagePath ?? null,
      createdAt: { gte: dedupeWindowStart },
      recipeId: { not: null },
      status: {
        in: [JobStatus.NEEDS_REVIEW, JobStatus.COMPLETED],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingCompleted) {
    return { jobId: existingCompleted.id, wasDeduped: true };
  }

  const job = await prisma.ingestionJob.create({
    data: {
      userId: params.userId,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl,
      imagePath: params.imagePath,
      status: JobStatus.QUEUED,
    },
  });

  return { jobId: job.id, wasDeduped: false };
}

async function findRecentlyCreatedMatchingRecipe(params: {
  userId: string;
  sourceType: SourceType;
  sourceUrl?: string | null;
  imagePath?: string | null;
}): Promise<{ id: string } | null> {
  const dedupeWindowStart = new Date(Date.now() - 5 * 60 * 1000);
  return prisma.recipe.findFirst({
    where: {
      userId: params.userId,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl ?? null,
      imagePath: params.imagePath ?? null,
      createdAt: { gte: dedupeWindowStart },
      // Only reuse recipes that were parsed with reasonable confidence.
      // Low-confidence fallback recipes should be reprocessed on subsequent imports.
      parseConfidence: { gte: 0.7 },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function processIngestionJob(
  jobId: string,
  sourceText: string,
  titleHint?: string,
  imagePathOverride?: string,
  sourceLabelOverride?: string,
  imageFilePathForVision?: string,
): Promise<void> {
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: { status: JobStatus.PROCESSING },
  });

  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error("Ingestion job not found");
  }

  try {
    let extraction: RecipeExtraction;
    let model: string;
    let persistedSourceText = sourceText;
    let diagnostics: string[] = [];

    if (imageFilePathForVision) {
      const parsed = await extractRecipeFromImage(imageFilePathForVision, titleHint);
      extraction = parsed.extraction;
      model = parsed.model;
      persistedSourceText = parsed.sourceText;
      diagnostics = parsed.diagnostics;
    } else {
      const parsed = await extractRecipeFromSource(sourceText, titleHint);
      extraction = parsed.extraction;
      model = parsed.model;
      diagnostics = parsed.diagnostics;
    }

    const resolvedImagePath = imagePathOverride ?? job.imagePath;
    const existingRecipe = await findRecentlyCreatedMatchingRecipe({
      userId: job.userId,
      sourceType: job.sourceType,
      sourceUrl: job.sourceUrl,
      imagePath: resolvedImagePath,
    });
    if (existingRecipe) {
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          recipeId: existingRecipe.id,
          status: JobStatus.COMPLETED,
        },
      });
      return;
    }

    const isLowConfidence = extraction.parse_confidence < 0.7;

    const recipe = await prisma.recipe.create({
      data: {
        userId: job.userId,
        title: extraction.title,
        description: extraction.description,
        servings: extraction.servings,
        prepMinutes: extraction.prep_minutes,
        cookMinutes: extraction.cook_minutes,
        sourceType: job.sourceType,
        sourceLabel: sourceLabelOverride,
        sourceUrl: job.sourceUrl,
        imagePath: resolvedImagePath,
        cuisine: extraction.cuisine,
        mealType: extraction.meal_type === "unknown" ? null : extraction.meal_type,
        vegetarian: resolveVegetarian(extraction),
        glutenFree:
          extraction.dietary.gluten_free === "unknown"
            ? null
            : extraction.dietary.gluten_free === "yes",
        kidFriendlyScore: extraction.kid_friendly_score,
        parseConfidence: extraction.parse_confidence,
      },
    });

    await prisma.recipeVersion.create({
      data: {
        recipeId: recipe.id,
        rawText: persistedSourceText,
        parsedJson: extraction,
        model,
        parseConfidence: extraction.parse_confidence,
      },
    });

    if (extraction.ingredients.length > 0) {
      await prisma.recipeIngredient.createMany({
        data: extraction.ingredients.map((ingredient, index) => {
          const normalized = normalizeQuantity(ingredient.quantity, ingredient.unit);

          return {
            recipeId: recipe.id,
            originalText: ingredient.original_text,
            itemName: ingredient.item_name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            normalizedQuantity: normalized.normalizedQuantity,
            normalizedUnit: normalized.normalizedUnit,
            notes: ingredient.preparation,
            sortOrder: index,
          };
        }),
      });
    }

    if (extraction.steps.length > 0) {
      await prisma.recipeStep.createMany({
        data: extraction.steps.map((step) => ({
          recipeId: recipe.id,
          stepNumber: step.step_number,
          instruction: step.instruction,
          timerMinutes: step.timer_minutes,
        })),
      });
    }

    await upsertAutoTagsForRecipe({ userId: job.userId, recipeId: recipe.id, extraction });

    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        recipeId: recipe.id,
        status: isLowConfidence ? JobStatus.NEEDS_REVIEW : JobStatus.COMPLETED,
        errorMessage: diagnosticsToErrorMessage(diagnostics),
      },
    });
  } catch (error) {
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown ingestion error",
      },
    });
  }
}

export async function processIngestionJobWithExtraction(
  jobId: string,
  sourceText: string,
  extraction: RecipeExtraction,
  imagePathOverride?: string,
  sourceLabelOverride?: string,
): Promise<void> {
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: { status: JobStatus.PROCESSING },
  });

  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error("Ingestion job not found");
  }

  try {
    const isLowConfidence = extraction.parse_confidence < 0.7;
    const resolvedImagePath = imagePathOverride ?? job.imagePath;
    const existingRecipe = await findRecentlyCreatedMatchingRecipe({
      userId: job.userId,
      sourceType: job.sourceType,
      sourceUrl: job.sourceUrl,
      imagePath: resolvedImagePath,
    });
    if (existingRecipe) {
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          recipeId: existingRecipe.id,
          status: JobStatus.COMPLETED,
        },
      });
      return;
    }

    const recipe = await prisma.recipe.create({
      data: {
        userId: job.userId,
        title: extraction.title,
        description: extraction.description,
        servings: extraction.servings,
        prepMinutes: extraction.prep_minutes,
        cookMinutes: extraction.cook_minutes,
        sourceType: job.sourceType,
        sourceLabel: sourceLabelOverride,
        sourceUrl: job.sourceUrl,
        imagePath: resolvedImagePath,
        cuisine: extraction.cuisine,
        mealType: extraction.meal_type === "unknown" ? null : extraction.meal_type,
        vegetarian: resolveVegetarian(extraction),
        glutenFree:
          extraction.dietary.gluten_free === "unknown"
            ? null
            : extraction.dietary.gluten_free === "yes",
        kidFriendlyScore: extraction.kid_friendly_score,
        parseConfidence: extraction.parse_confidence,
      },
    });

    await prisma.recipeVersion.create({
      data: {
        recipeId: recipe.id,
        rawText: sourceText,
        parsedJson: extraction,
        model: "structured-import",
        parseConfidence: extraction.parse_confidence,
      },
    });

    if (extraction.ingredients.length > 0) {
      await prisma.recipeIngredient.createMany({
        data: extraction.ingredients.map((ingredient, index) => {
          const normalized = normalizeQuantity(ingredient.quantity, ingredient.unit);

          return {
            recipeId: recipe.id,
            originalText: ingredient.original_text,
            itemName: ingredient.item_name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            normalizedQuantity: normalized.normalizedQuantity,
            normalizedUnit: normalized.normalizedUnit,
            notes: ingredient.preparation,
            sortOrder: index,
          };
        }),
      });
    }

    if (extraction.steps.length > 0) {
      await prisma.recipeStep.createMany({
        data: extraction.steps.map((step) => ({
          recipeId: recipe.id,
          stepNumber: step.step_number,
          instruction: step.instruction,
          timerMinutes: step.timer_minutes,
        })),
      });
    }

    await upsertAutoTagsForRecipe({ userId: job.userId, recipeId: recipe.id, extraction });

    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        recipeId: recipe.id,
        status: isLowConfidence ? JobStatus.NEEDS_REVIEW : JobStatus.COMPLETED,
      },
    });
  } catch (error) {
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown ingestion error",
      },
    });
  }
}
