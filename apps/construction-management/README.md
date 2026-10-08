# Construction Management

The rebuild of BuildControl for Indian builders and contractors, as its own Next.js app in the monorepo (ADR [CM-0001](./docs/adr/CM-0001-app-and-schemas.md)). Product words: [`CONTEXT.md`](./CONTEXT.md). Product docs and the delivery board: [`docs/`](./docs/README.md).

## Run it

```sh
bun install
docker compose up -d              # Postgres (construction, construction_test), Mailpit
cp apps/construction-management/.env.example apps/construction-management/.env   # fill BETTER_AUTH_SECRET and CONSTRUCTION_PRIVATE_DATA_KEY; OTP_TEST_CODE=000000 signs any mobile in locally
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

Sign in at http://localhost:3002/sign-in with any +91 mobile; the code is printed in the server log (`SMS_TRANSPORT=log`). Files go to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise to `apps/construction-management/.blob-local`.

APIs: http://localhost:3002/api/docs
