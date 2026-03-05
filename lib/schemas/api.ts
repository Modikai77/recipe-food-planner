import { z } from "zod";

export const UploadIngestionSchema = z.object({
  filePath: z.string().min(1),
  sourceType: z.enum(["IMAGE_UPLOAD", "CAMERA_CAPTURE"]),
  sourceText: z.string().optional(),
});

export const UrlIngestionSchema = z.object({
  url: z.string().url(),
});

export const RecipeCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  imagePath: z.string().nullable().optional(),
  rating: z.number().int().min(0).max(10).nullable().optional(),
  favourite: z.boolean().optional(),
  adultFavourite: z.boolean().optional(),
  kidsFavourite: z.boolean().optional(),
  servings: z.number().int().positive().optional(),
  prepMinutes: z.number().int().nonnegative().optional(),
  cookMinutes: z.number().int().nonnegative().optional(),
  cuisine: z.string().optional(),
  vegetarian: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  kidFriendlyScore: z.number().min(0).max(1).optional(),
  ingredients: z.array(
    z.object({
      originalText: z.string().min(1),
      itemName: z.string().min(1),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  steps: z.array(
    z.object({
      stepNumber: z.number().int().positive(),
      instruction: z.string().min(1),
      timerMinutes: z.number().int().nonnegative().optional(),
    }),
  ),
});

export const RecipeUpdateSchema = RecipeCreateSchema.partial();

export const AddTagSchema = z.object({
  tag: z.string().min(1),
});

export const RecommendSchema = z.object({
  count: z.number().int().positive().max(500).optional(),
  audience: z.string().optional(),
  constraints: z
    .object({
      vegetarian: z.boolean().optional(),
      glutenFree: z.boolean().optional(),
      adultFavourite: z.boolean().optional(),
      kidsFavourite: z.boolean().optional(),
      maxPrepMinutes: z.number().int().positive().optional(),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
    })
    .optional(),
});

export const ShoppingListSchema = z.object({
  recipeIds: z.array(z.string().min(1)).min(1),
  servingsScale: z.number().positive().optional(),
  title: z.string().optional(),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ProfileUpdateSchema = z.object({
  measurementPref: z.enum(["UK", "US", "METRIC"]),
  conversionPrefs: z.object({
    keepSmallVolumeUnits: z.boolean().optional(),
    forceMetricMass: z.boolean().optional(),
  }),
});
