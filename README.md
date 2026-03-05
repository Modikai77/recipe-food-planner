# Recipe and Food Planner

Web app to ingest recipes (image or URL), parse with OpenAI, store structured data, tag recipes, recommend meals, and generate consolidated shopping lists.

## Quick start

1. Copy env vars:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client and push schema:

```bash
npx prisma generate
npx prisma db push
```

4. Run app:

```bash
npm run dev
```

5. Run tests:

```bash
npm test
```

## Key routes

- `/recipes`: add/import recipes and view saved recipes
- `/planner`: generate dinner recommendations + shopping list

## API summary

- `POST /api/ingestion/upload`
- `POST /api/ingestion/url`
- `GET /api/ingestion/jobs/:id`
- `POST /api/ingestion/jobs/:id/confirm`
- `GET/POST /api/recipes`
- `GET/PATCH/DELETE /api/recipes/:id`
- `POST /api/recipes/:id/tags`
- `DELETE /api/recipes/:id/tags/:tagId`
- `POST /api/planner/recommend`
- `POST /api/planner/shopping-list`
