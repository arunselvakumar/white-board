# Construction Management

The rebuild of BuildControl for Indian builders and contractors, as its own Next.js app in the monorepo (ADR [CM-0001](./docs/adr/CM-0001-app-and-schemas.md)). Product words: [`CONTEXT.md`](./CONTEXT.md). Product docs and the delivery board: [`docs/`](./docs/README.md).

## Run it

```sh
bun install
docker compose up -d              # Postgres (construction, construction_test), Mailpit, S3 stand-in
cp apps/construction-management/.env.example apps/construction-management/.env   # then fill BETTER_AUTH_SECRET
DATABASE_URL=postgresql://whiteboard:whiteboard@localhost:5433/construction bun run --filter @repo/db migrate:deploy
bun run dev --filter=construction-management   # http://localhost:3002
```

An existing Postgres volume predates the `construction` database; create it once with `docker compose exec postgres psql -U whiteboard -c "CREATE DATABASE construction"`.

## Check it

```sh
bun run --cwd apps/construction-management test           # domain unit tests
bun run --cwd apps/construction-management test:http      # HTTP tests on construction_test
bun run --cwd apps/construction-management test-storybook # Storybook play functions
bun run --cwd apps/construction-management storybook      # http://localhost:6007
```

APIs: http://localhost:3002/api/docs
