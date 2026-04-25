# Recipe Database + Meal Planning App

## 1. Product Scope

### 1.1 Goals
- Ingest recipes from:
  - Camera photo capture (book/page photos)
  - Photo upload (photo library)
  - Recipe URL
- Parse and store recipes in machine-readable form:
  - Ingredients (structured)
  - Method steps (ordered)
  - Metadata (servings, prep/cook time, tags)
- Build personal recipe database with:
  - Auto-generated dietary/meal tags
  - Manual custom tags
- Provide meal planning recommendations based on constraints.
- Produce consolidated shopping list with normalized units and locale-specific display conversions.

### 1.2 Non-Goals (MVP)
- Real-time collaborative editing.
- Barcode/receipt scanning.
- Nutrition calculations (can be Phase 2).
- Native mobile app (web-first, mobile-responsive).

---

## 2. Technology Stack

- Frontend: `Next.js 15` + `TypeScript` + `Tailwind CSS`
- Backend API: `Next.js Route Handlers` (or `tRPC` optional)
- DB: `PostgreSQL 16`
- ORM: `Prisma`
- Auth + object storage: `Supabase` (Auth + Storage buckets)
- Background jobs: `BullMQ` + `Redis`
- LLM/OCR:
  - Default: `OpenAI API`
  - Primary model for parse/classification: `gpt-5.5`
  - Retry fallback for low confidence/failure: `gpt-5.5`
- Web extraction for URL recipes: `@mozilla/readability` + `cheerio`
- Validation: `Zod`
- Testing: `Vitest` + `Playwright`
- Deployment: `Vercel` (web/API) + managed Postgres + managed Redis

---

## 3. System Architecture

### 3.1 High-Level Components
1. Ingestion UI
- Accepts image upload/camera capture/URL
- Creates ingestion job and polls status

2. Ingestion Service (async)
- Fetches source content
- OCR/extract text
- Calls OpenAI to parse into strict JSON schema
- Runs validation + normalization
- Upserts recipe and related records

3. Recipe Service
- CRUD recipes
- Versioning (raw extraction + parsed payload)
- Tag management (auto + manual)

4. Planning Service
- Filter + rank recipes by constraints
- Return recommended set
- Generate consolidated shopping list

5. Unit Normalization Service
- Converts ingredient quantities to canonical base units
- Converts display units to user locale preference (US/UK)

### 3.2 Data Flow (Image)
1. User uploads photo -> object storage
2. API creates `ingestion_jobs` row (status: `queued`)
3. Worker reads image and sends to OpenAI Vision extraction prompt
4. Worker receives structured parse JSON
5. Worker validates with Zod schema
6. Worker normalizes ingredients + units
7. Worker computes auto-tags
8. Worker saves recipe + recipe_version + ingredient rows
9. Job status updated to `completed` (or `needs_review`)

### 3.3 Data Flow (URL)
1. User submits URL
2. Worker fetches URL and attempts structured extraction (`ld+json` Recipe first)
3. If missing/low quality, fallback to readability text extraction
4. Send extracted text to OpenAI parse prompt
5. Continue same validation/persistence pipeline

---

## 4. Data Model (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SourceType {
  IMAGE_UPLOAD
  CAMERA_CAPTURE
  URL_IMPORT
  MANUAL
}

enum JobStatus {
  QUEUED
  PROCESSING
  NEEDS_REVIEW
  COMPLETED
  FAILED
}

enum TagSource {
  AUTO
  MANUAL
}

model User {
  id               String            @id @default(cuid())
  email            String            @unique
  locale           String            @default("en-GB")
  measurementPref  String            @default("UK") // UK | US | METRIC
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  recipes          Recipe[]
  mealPlans        MealPlan[]
  customTags       Tag[]
}

model Recipe {
  id                   String               @id @default(cuid())
  userId               String
  title                String
  description          String?
  servings             Int?
  prepMinutes          Int?
  cookMinutes          Int?
  sourceType           SourceType
  sourceUrl            String?
  imagePath            String?
  cuisine              String?
  mealType             String? // breakfast/lunch/dinner/dessert/snack
  vegetarian           Boolean?
  glutenFree           Boolean?
  kidFriendlyScore     Float?
  parseConfidence      Float?
  isArchived           Boolean              @default(false)
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt

  user                 User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  versions             RecipeVersion[]
  ingredients          RecipeIngredient[]
  steps                RecipeStep[]
  tags                 RecipeTag[]
  mealPlanItems        MealPlanItem[]

  @@index([userId, mealType])
  @@index([userId, vegetarian, glutenFree])
}

model RecipeVersion {
  id                   String     @id @default(cuid())
  recipeId             String
  rawText              String
  parsedJson           Json
  model                String
  parseConfidence      Float?
  createdAt            DateTime   @default(now())

  recipe               Recipe     @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@index([recipeId, createdAt])
}

model Ingredient {
  id                   String              @id @default(cuid())
  canonicalName        String              @unique
  defaultDensityGPerMl Float?
  category             String?
  aliases              IngredientAlias[]
  recipeLinks          RecipeIngredient[]
}

model IngredientAlias {
  id                   String      @id @default(cuid())
  ingredientId         String
  alias                String

  ingredient           Ingredient  @relation(fields: [ingredientId], references: [id], onDelete: Cascade)

  @@unique([ingredientId, alias])
  @@index([alias])
}

model RecipeIngredient {
  id                   String      @id @default(cuid())
  recipeId             String
  ingredientId         String?
  originalText         String
  itemName             String
  quantity             Float?
  unit                 String?
  normalizedQuantity   Float?
  normalizedUnit       String? // g|ml|count
  notes                String?
  sortOrder            Int

  recipe               Recipe      @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  ingredient           Ingredient? @relation(fields: [ingredientId], references: [id], onDelete: SetNull)

  @@index([recipeId, sortOrder])
}

model RecipeStep {
  id                   String     @id @default(cuid())
  recipeId             String
  stepNumber           Int
  instruction          String
  timerMinutes         Int?

  recipe               Recipe     @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@unique([recipeId, stepNumber])
}

model Tag {
  id                   String      @id @default(cuid())
  userId               String
  name                 String
  source               TagSource

  user                 User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  recipes              RecipeTag[]

  @@unique([userId, name])
}

model RecipeTag {
  recipeId             String
  tagId                String
  confidence           Float?

  recipe               Recipe      @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  tag                  Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([recipeId, tagId])
}

model IngestionJob {
  id                   String     @id @default(cuid())
  userId               String
  sourceType           SourceType
  sourceUrl            String?
  imagePath            String?
  status               JobStatus  @default(QUEUED)
  errorMessage         String?
  recipeId             String?
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt

  @@index([userId, status, createdAt])
}

model MealPlan {
  id                   String        @id @default(cuid())
  userId               String
  title                String
  startDate            DateTime
  endDate              DateTime
  createdAt            DateTime      @default(now())

  user                 User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  items                MealPlanItem[]
}

model MealPlanItem {
  id                   String      @id @default(cuid())
  mealPlanId           String
  recipeId             String
  plannedFor           DateTime
  mealSlot             String      // breakfast|lunch|dinner
  servingsOverride     Int?

  mealPlan             MealPlan    @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  recipe               Recipe      @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@index([mealPlanId, plannedFor])
}

model ShoppingList {
  id                   String              @id @default(cuid())
  userId               String
  mealPlanId           String?
  title                String
  createdAt            DateTime            @default(now())

  items                ShoppingListItem[]
}

model ShoppingListItem {
  id                   String      @id @default(cuid())
  shoppingListId       String
  ingredientId         String?
  itemName             String
  quantity             Float?
  unit                 String?
  normalizedQuantity   Float?
  normalizedUnit       String?
  checked              Boolean     @default(false)

  shoppingList         ShoppingList @relation(fields: [shoppingListId], references: [id], onDelete: Cascade)
}
```

---

## 5. OpenAI Integration Spec

### 5.1 API Defaults
- Endpoint: `POST /v1/responses`
- Auth: `OPENAI_API_KEY`
- Model defaults:
  - Parse/tag flow: `gpt-5.5`
  - Retry fallback (low confidence/failure): `gpt-5.5`

### 5.2 Parse Prompt Contract
System prompt goals:
- Extract a single recipe only.
- Return strict JSON matching provided schema.
- Preserve ingredient semantics.
- Separate `ingredients[]` from `steps[]`.
- Include confidence scores and ambiguities.
- Do not hallucinate missing quantities.

Input variants:
- Image: include image input plus instruction text.
- URL/manual text: include extracted text in delimited block.

Output format:
- Must be valid JSON object only (no markdown).
- Must conform to `RecipeExtractionSchema`.

### 5.3 JSON Schema (Zod/TS)

```ts
import { z } from "zod";

export const RecipeExtractionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  servings: z.number().int().positive().optional(),
  prep_minutes: z.number().int().nonnegative().optional(),
  cook_minutes: z.number().int().nonnegative().optional(),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "dessert", "snack", "unknown"]).default("unknown"),
  cuisine: z.string().optional(),
  ingredients: z.array(
    z.object({
      original_text: z.string().min(1),
      item_name: z.string().min(1),
      quantity: z.number().positive().optional(),
      unit: z.string().optional(),
      preparation: z.string().optional(),
      optional: z.boolean().optional(),
    })
  ).min(1),
  steps: z.array(
    z.object({
      step_number: z.number().int().positive(),
      instruction: z.string().min(1),
      timer_minutes: z.number().int().nonnegative().optional(),
    })
  ).min(1),
  dietary: z.object({
    vegetarian: z.enum(["yes", "no", "unknown"]),
    gluten_free: z.enum(["yes", "no", "unknown"]),
  }),
  kid_friendly_score: z.number().min(0).max(1).optional(),
  parse_confidence: z.number().min(0).max(1),
  ambiguities: z.array(z.string()).default([]),
});
```

### 5.4 Classification/Auto-Tagging
- Same parse response can include dietary/meal fields.
- Secondary lightweight classification prompt if missing values.
- Auto-create tags per recipe:
  - `vegetarian` or `non_vegetarian`
  - `gluten_free` or `contains_gluten`
  - `breakfast` / `lunch` / `dinner` / `dessert`
  - `kid_friendly` if score >= 0.7

### 5.5 Confidence + Human Review
- If `parse_confidence < 0.7` OR missing core fields, job => `NEEDS_REVIEW`.
- UI shows editable parse form before final save.

---

## 6. API Contracts

### 6.1 Auth
All endpoints require authenticated user context.

### 6.2 Ingestion

`POST /api/ingestion/upload`
- Body: `{ filePath: string, sourceType: "IMAGE_UPLOAD" | "CAMERA_CAPTURE" }`
- Response: `{ jobId: string, status: "QUEUED" }`

`POST /api/ingestion/url`
- Body: `{ url: string }`
- Response: `{ jobId: string, status: "QUEUED" }`

`GET /api/ingestion/jobs/:id`
- Response: `{ id, status, recipeId?, errorMessage? }`

`POST /api/ingestion/jobs/:id/confirm`
- Body: edited parsed payload
- Action: persist reviewed parse and mark `COMPLETED`

### 6.3 Recipes

`GET /api/recipes`
- Query:
  - `q`, `mealType`, `vegetarian`, `glutenFree`, `tags[]`, `page`, `pageSize`
- Response: paginated recipes

`GET /api/recipes/:id`
- Response: recipe with ingredients, steps, tags

`POST /api/recipes`
- Body: manual recipe payload

`PATCH /api/recipes/:id`
- Body: partial update

`DELETE /api/recipes/:id`
- Soft delete (`isArchived = true`)

### 6.4 Tags

`POST /api/recipes/:id/tags`
- Body: `{ tag: string }`
- Creates manual tag if missing, attaches to recipe

`DELETE /api/recipes/:id/tags/:tagId`

### 6.5 Planner

`POST /api/planner/recommend`
- Body:
```json
{
  "count": 3,
  "mealType": "dinner",
  "audience": "parents_and_kids",
  "constraints": {
    "vegetarian": false,
    "glutenFree": false,
    "maxPrepMinutes": 45,
    "includeTags": ["kids_favourite"],
    "excludeTags": []
  }
}
```
- Response:
```json
{
  "recipes": [
    {
      "recipeId": "...",
      "title": "...",
      "score": 0.84,
      "reasons": ["Kid-friendly", "Dinner", "Under 45 min"]
    }
  ]
}
```

`POST /api/planner/shopping-list`
- Body: `{ recipeIds: string[], servingsScale?: number, title?: string }`
- Response: consolidated list with normalized + display units

---

## 7. Unit Normalization & Conversion Spec

### 7.1 Canonical Storage
- `normalizedUnit` allowed: `g`, `ml`, `count`
- Store both original (`quantity`, `unit`) and normalized values.

### 7.2 Conversion Table (initial)
Volume:
- 1 tsp = 4.92892 ml
- 1 tbsp = 14.7868 ml
- 1 cup (US) = 236.588 ml
- 1 fl oz (US) = 29.5735 ml

Mass:
- 1 oz = 28.3495 g
- 1 lb = 453.592 g

### 7.3 Ingredient-Specific Conversions
- For volume->mass needs density; use `Ingredient.defaultDensityGPerMl` when available.
- If density unavailable, do not cross-convert; keep same dimension.

### 7.4 Display Rules
- User preference:
  - `UK`: prefer `ml`, `g`, and metric-friendly fractions
  - `US`: prefer cups/tbsp/tsp for volume and oz/lb when suitable
- Round for display only; keep full precision in storage.

---

## 8. Recommendation Engine

### 8.1 Hard Filters
- Meal type match (e.g., dinner)
- Dietary constraints
- Excluded tags
- Archived recipes excluded

### 8.2 Soft Score (0..1)
- `kidFriendlyScore` (weight 0.35)
- manual tag `kids_favourite` boost (0.20)
- prep time target proximity (0.15)
- novelty/diversity (not recently suggested) (0.20)
- user explicit include tags match (0.10)

### 8.3 Diversity Rule
- Avoid same main ingredient/cuisine duplicates in same recommendation set where possible.

---

## 9. Security, Privacy, and Compliance

- Encrypt all data in transit (`HTTPS`) and at rest (provider default).
- Signed URLs for private image objects.
- PII minimization: only auth profile + recipe content.
- Data deletion endpoint to remove user recipes + associated images.
- Audit fields on ingestion jobs/errors.

---

## 10. Observability & Reliability

- Structured logs with `jobId`, `userId`, `recipeId`.
- Metrics:
  - Parse success rate
  - Needs-review rate
  - Avg job latency
  - Planner API latency
- Retries:
  - OpenAI/API transient failures: exponential backoff (max 3)
- Dead-letter queue for failed ingestion jobs.

---

## 11. Environment Variables

```bash
DATABASE_URL=
REDIS_URL=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
OPENAI_API_KEY=
OPENAI_MODEL_PARSE=gpt-5.5
OPENAI_MODEL_FALLBACK=gpt-5.5
APP_BASE_URL=
```

---

## 12. MVP Delivery Plan (Sprint-Ready)

### Sprint 1: Foundation
- Setup Next.js app + auth + Prisma + Postgres
- Implement core schema migrations
- Build recipe CRUD pages + APIs
- Add tag CRUD + filtering

Acceptance:
- User can create/edit/delete recipes manually with ingredients/steps/tags.

### Sprint 2: Ingestion (Image + URL)
- Storage upload flow
- `ingestion_jobs` queue + worker
- OpenAI parse integration with schema validation
- Review UI for low-confidence parses

Acceptance:
- User can upload image/URL and get recipe saved or review-required flow.

### Sprint 3: Normalization + Planner
- Unit normalization service
- Recommendation endpoint + UI for “3 dinners for parents + kids”
- Shopping list consolidation + unit conversion display

Acceptance:
- Planner returns 3 ranked recipes and a merged shopping list in user measurement preference.

### Sprint 4: Hardening
- E2E tests (ingest, edit, recommend, shopping list)
- Retry/error UX
- Telemetry dashboard + basic cost controls

Acceptance:
- Target p95 planner API < 800ms (excluding ingestion), parse success > 80% without manual review for clean sources.

---

## 13. Open Questions (Decide Before Build Start)

- Multi-user family account vs single-user account in MVP?
- Should URL import preserve original attribution/author fields?
- Do we support imperial UK units in addition to metric-preferred UK display?
- Should planner include pantry-aware suggestions (Phase 2 candidate)?

---

## 14. Initial Backlog Tickets

1. `DB-001`: Implement Prisma schema and initial migration.
2. `API-001`: Auth middleware + recipe CRUD endpoints.
3. `UI-001`: Recipe list/detail/editor pages.
4. `INGEST-001`: Upload endpoint + storage integration.
5. `INGEST-002`: Queue worker with OpenAI parse + validation.
6. `INGEST-003`: Review/confirm parse UI.
7. `TAGS-001`: Auto-tag creation and manual tag API/UI.
8. `UNITS-001`: Normalize ingredient units to canonical form.
9. `PLAN-001`: Recommendation engine + `/planner/recommend` API.
10. `PLAN-002`: Shopping list consolidation + conversion output.
11. `QA-001`: E2E tests for ingest->save->plan flow.
12. `OPS-001`: Logging, metrics, retry, dead-letter queue.
