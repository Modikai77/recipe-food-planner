import { z } from "zod";

function coerceNumber(value: unknown): unknown {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    const normalized = trimmed.replace(/,/g, "");
    const direct = Number(normalized);
    if (Number.isFinite(direct)) {
      return direct;
    }

    const match = normalized.match(/-?\d+(\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return value;
}

const numeric = z.preprocess(coerceNumber, z.number());
const optionalNumeric = z.preprocess(
  (value) => (value === "" || value === null ? undefined : coerceNumber(value)),
  z.number().optional(),
);

function normalizeMealType(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (["main", "main course", "entree", "entrée"].includes(normalized)) {
    return "dinner";
  }

  if (["breakfast", "lunch", "dinner", "dessert", "snack", "unknown"].includes(normalized)) {
    return normalized;
  }

  return "unknown";
}

function toIngredientObject(entry: unknown, index: number): unknown {
  if (typeof entry === "string") {
    const text = entry.trim();
    return {
      original_text: text || `ingredient ${index + 1}`,
      item_name: text || `ingredient ${index + 1}`,
    };
  }

  if (!entry || typeof entry !== "object") {
    return entry;
  }

  const input = entry as Record<string, unknown>;
  const originalText =
    (typeof input.original_text === "string" ? input.original_text : undefined) ||
    (typeof input.text === "string" ? input.text : undefined) ||
    (typeof input.ingredient === "string" ? input.ingredient : undefined) ||
    (typeof input.item_name === "string" ? input.item_name : undefined) ||
    "";
  const itemName =
    (typeof input.item_name === "string" ? input.item_name : undefined) ||
    (typeof input.name === "string" ? input.name : undefined) ||
    (typeof input.ingredient === "string" ? input.ingredient : undefined) ||
    originalText ||
    `ingredient ${index + 1}`;

  return {
    ...input,
    original_text: originalText || itemName,
    item_name: itemName,
    unit:
      (typeof input.unit === "string" ? input.unit : undefined) ||
      (typeof input.units === "string" ? input.units : undefined),
  };
}

function normalizeIngredients(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((entry, index) => toIngredientObject(entry, index));
}

function toStepObject(entry: unknown, index: number): unknown {
  if (typeof entry === "string") {
    const text = entry.trim();
    return {
      step_number: index + 1,
      instruction: text || `Step ${index + 1}`,
    };
  }

  if (!entry || typeof entry !== "object") {
    return entry;
  }

  const input = entry as Record<string, unknown>;
  const instruction =
    (typeof input.instruction === "string" ? input.instruction : undefined) ||
    (typeof input.step === "string" ? input.step : undefined) ||
    (typeof input.text === "string" ? input.text : undefined) ||
    "";
  const stepNumber = input.step_number ?? input.stepNumber ?? input.number ?? index + 1;

  return {
    ...input,
    step_number: stepNumber,
    instruction: instruction || `Step ${index + 1}`,
  };
}

function normalizeSteps(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((entry, index) => toStepObject(entry, index));
}

function toDietaryToken(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .toLowerCase()
    .split(/[,/;|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDietary(value: unknown): unknown {
  const normalized = {
    vegetarian: "unknown" as "yes" | "no" | "unknown",
    gluten_free: "unknown" as "yes" | "no" | "unknown",
  };

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;
    const vegRaw = typeof input.vegetarian === "string" ? input.vegetarian.toLowerCase() : "";
    const gfRaw =
      (typeof input.gluten_free === "string" ? input.gluten_free.toLowerCase() : "") ||
      (typeof input.glutenFree === "string" ? input.glutenFree.toLowerCase() : "");

    if (["yes", "no", "unknown"].includes(vegRaw)) {
      normalized.vegetarian = vegRaw as "yes" | "no" | "unknown";
    } else if (vegRaw.includes("true")) {
      normalized.vegetarian = "yes";
    } else if (vegRaw.includes("false")) {
      normalized.vegetarian = "no";
    }

    if (["yes", "no", "unknown"].includes(gfRaw)) {
      normalized.gluten_free = gfRaw as "yes" | "no" | "unknown";
    } else if (gfRaw.includes("true")) {
      normalized.gluten_free = "yes";
    } else if (gfRaw.includes("false")) {
      normalized.gluten_free = "no";
    }

    return normalized;
  }

  const tokens = Array.isArray(value)
    ? value.flatMap((entry) => toDietaryToken(entry))
    : toDietaryToken(value);

  if (tokens.some((token) => token.includes("vegetarian"))) {
    normalized.vegetarian = "yes";
  }
  if (tokens.some((token) => token.includes("non-vegetarian") || token.includes("not vegetarian"))) {
    normalized.vegetarian = "no";
  }

  if (tokens.some((token) => token.includes("gluten-free") || token.includes("gluten free"))) {
    normalized.gluten_free = "yes";
  }
  if (tokens.some((token) => token.includes("contains gluten") || token.includes("not gluten free"))) {
    normalized.gluten_free = "no";
  }

  return normalized;
}

function normalizeFractionScore(value: unknown): unknown {
  const numericValue = coerceNumber(value);
  if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
    return value;
  }

  if (numericValue <= 1) {
    return numericValue;
  }

  if (numericValue <= 10) {
    return numericValue / 10;
  }

  if (numericValue <= 100) {
    return numericValue / 100;
  }

  return 1;
}

const ingredientSchema = z.object({
  original_text: z.string().min(1),
  item_name: z.string().min(1),
  quantity: optionalNumeric.pipe(z.number().positive().optional()),
  unit: z.string().optional(),
  preparation: z.string().optional(),
  optional: z.boolean().optional(),
});

const stepSchema = z.object({
  step_number: numeric.pipe(z.number().int().positive()),
  instruction: z.string().min(1),
  timer_minutes: optionalNumeric.pipe(z.number().int().nonnegative().optional()),
});

export const RecipeExtractionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  servings: optionalNumeric.pipe(z.number().int().positive().optional()),
  prep_minutes: optionalNumeric.pipe(z.number().int().nonnegative().optional()),
  cook_minutes: optionalNumeric.pipe(z.number().int().nonnegative().optional()),
  meal_type: z.preprocess(
    normalizeMealType,
    z.enum(["breakfast", "lunch", "dinner", "dessert", "snack", "unknown"]).default("unknown"),
  ),
  cuisine: z.string().optional(),
  ingredients: z.preprocess(normalizeIngredients, z.array(ingredientSchema).min(1)),
  steps: z.preprocess(normalizeSteps, z.array(stepSchema).min(1)),
  dietary: z.preprocess(
    normalizeDietary,
    z.object({
      vegetarian: z.enum(["yes", "no", "unknown"]),
      gluten_free: z.enum(["yes", "no", "unknown"]),
    }),
  ),
  kid_friendly_score: z.preprocess(normalizeFractionScore, z.number().min(0).max(1).optional()),
  parse_confidence: z.preprocess(normalizeFractionScore, z.number().min(0).max(1)),
  ambiguities: z.array(z.string()).default([]),
});

export type RecipeExtraction = z.infer<typeof RecipeExtractionSchema>;
