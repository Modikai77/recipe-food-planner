# Jarvis API

Jarvis should use a household API token, not a shared human login. Create one from Profile -> Household -> Jarvis API Token and store the token somewhere private in Jarvis/OpenClaw.

Use the token on every request:

```bash
Authorization: Bearer rfp_xxx
Content-Type: application/json
```

Recommended scopes:

- `recipes:read`
- `recipes:write`
- `shoppingLists:read`
- `shoppingLists:write`
- `mealPlans:read`

Do not grant recipe archive/delete scopes to Jarvis.

## Recipes

List recipes:

```http
GET /api/recipes
```

Create a manual recipe:

```http
POST /api/recipes
```

Load a recipe:

```http
GET /api/recipes/:id
```

Update a recipe:

```http
PATCH /api/recipes/:id
```

Archive/delete is intentionally blocked for the default Jarvis token:

```http
DELETE /api/recipes/:id
```

Expected response:

```json
{ "error": "Missing recipes:archive scope" }
```

## Imports

Import from a URL:

```http
POST /api/ingestion/url
```

Body:

```json
{ "url": "https://example.com/recipe" }
```

Check an import job:

```http
GET /api/ingestion/jobs/:id
```

## Shopping Lists

Generate a shopping list from recipe ids:

```http
POST /api/planner/shopping-list
```

Body:

```json
{
  "recipeIds": ["recipe_id_1", "recipe_id_2"],
  "title": "Jarvis list"
}
```

For API tokens, unit conversion uses the household defaults rather than a human user's personal profile.
