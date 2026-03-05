import type { RecipeExtraction } from "@/lib/schemas/recipeExtraction";
import { parseIngredientLine } from "@/lib/services/ingredientParsing";

type JsonLdNode = Record<string, unknown>;

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractTitleHintFromHtml(html: string, pageUrl: string): string | undefined {
  const ogTitle = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  )?.[1];
  if (ogTitle?.trim()) {
    return decodeHtmlEntities(stripTags(ogTitle));
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (titleTag?.trim()) {
    return decodeHtmlEntities(stripTags(titleTag)).split("|")[0]?.split("-")[0]?.trim();
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1?.trim()) {
    return decodeHtmlEntities(stripTags(h1));
  }

  try {
    const url = new URL(pageUrl);
    const slug = url.pathname.split("/").filter(Boolean).pop();
    if (slug) {
      return slug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  } catch {
    // Ignore URL parse failure.
  }

  return undefined;
}

export function extractImageHintFromHtml(html: string): string | undefined {
  const ogImage = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  )?.[1];
  if (ogImage?.trim()) {
    return decodeHtmlEntities(stripTags(ogImage));
  }

  return undefined;
}

export function sourceLabelFromUrl(pageUrl: string): string | undefined {
  try {
    const hostname = new URL(pageUrl).hostname.replace(/^www\./i, "");
    if (!hostname) {
      return undefined;
    }

    const firstPart = hostname.split(".")[0] ?? hostname;
    return firstPart
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return undefined;
  }
}

function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function asNodeArray(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonLdNode => typeof item === "object" && item !== null);
  }

  if (typeof value === "object" && value !== null) {
    return [value as JsonLdNode];
  }

  return [];
}

function flattenJsonLdNodes(value: unknown): JsonLdNode[] {
  const roots = asNodeArray(value);
  const out: JsonLdNode[] = [];

  for (const root of roots) {
    out.push(root);
    const graph = root["@graph"];
    out.push(...asNodeArray(graph));
  }

  return out;
}

function hasRecipeType(node: JsonLdNode): boolean {
  const recipeType = node["@type"];
  if (typeof recipeType === "string") {
    return recipeType.toLowerCase() === "recipe";
  }

  if (Array.isArray(recipeType)) {
    return recipeType.some((value) => typeof value === "string" && value.toLowerCase() === "recipe");
  }

  return false;
}

function normalizeInstruction(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry.trim() || null;
  }

  if (typeof entry === "object" && entry !== null) {
    const text = (entry as Record<string, unknown>).text;
    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }

  return null;
}

function parseIsoDurationToMinutes(value: string | unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) {
    return undefined;
  }

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  return hours * 60 + minutes;
}

function parseServings(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }

  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return undefined;
}

function imageFromJsonLdValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = imageFromJsonLdValue(entry);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (typeof value === "object" && value !== null) {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim()) {
      return url.trim();
    }
  }

  return undefined;
}

function recipeNodeToExtraction(node: JsonLdNode): RecipeExtraction | null {
  const title = typeof node.name === "string" ? node.name.trim() : "";
  const description = typeof node.description === "string" ? node.description.trim() : undefined;

  const ingredientLines = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const instructionLines = Array.isArray(node.recipeInstructions)
    ? node.recipeInstructions.map(normalizeInstruction).filter((line): line is string => Boolean(line))
    : typeof node.recipeInstructions === "string"
      ? [node.recipeInstructions.trim()].filter(Boolean)
      : [];

  if (!title || ingredientLines.length === 0 || instructionLines.length === 0) {
    return null;
  }

  return {
    title,
    description,
    servings: parseServings(node.recipeYield),
    prep_minutes: parseIsoDurationToMinutes(node.prepTime),
    cook_minutes: parseIsoDurationToMinutes(node.cookTime),
    meal_type: "unknown",
    cuisine: typeof node.recipeCuisine === "string" ? node.recipeCuisine : undefined,
    ingredients: ingredientLines.map((line) => {
      const parsed = parseIngredientLine(line);
      return {
        original_text: line.trim(),
        item_name: parsed.itemName,
        quantity: parsed.quantity,
        unit: parsed.unit,
      };
    }),
    steps: instructionLines.map((line, index) => ({
      step_number: index + 1,
      instruction: line,
    })),
    dietary: {
      vegetarian: "unknown",
      gluten_free: "unknown",
    },
    parse_confidence: 0.95,
    ambiguities: [],
  };
}

export function extractRecipeFromJsonLd(html: string): {
  extraction: RecipeExtraction;
  sourceText: string;
  imageUrl?: string;
} | null {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi);
  if (!scripts || scripts.length === 0) {
    return null;
  }

  for (const script of scripts) {
    const body = script
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    const parsed = safeJsonParse(body);
    if (!parsed) {
      continue;
    }

    const nodes = flattenJsonLdNodes(parsed);
    const recipeNode = nodes.find(hasRecipeType);
    if (!recipeNode) {
      continue;
    }

    const extraction = recipeNodeToExtraction(recipeNode);
    if (extraction) {
      const imageUrl = imageFromJsonLdValue(recipeNode.image);
      const sourceText = [
        `Title: ${extraction.title}`,
        extraction.description ? `Description: ${extraction.description}` : "",
        "Ingredients:",
        ...extraction.ingredients.map((item) => `- ${item.original_text}`),
        "Method:",
        ...extraction.steps.map((step) => `${step.step_number}. ${step.instruction}`),
      ]
        .filter(Boolean)
        .join("\n");

      return { extraction, sourceText, imageUrl };
    }
  }

  return null;
}
