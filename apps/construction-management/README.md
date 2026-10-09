# Construction Management

The rebuild of BuildControl for Indian builders and contractors, as its own Next.js app in the monorepo (ADR [CM-0001](./docs/adr/CM-0001-app-and-schemas.md)). Product words: [`CONTEXT.md`](./CONTEXT.md). Product docs and the delivery board: [`docs/`](./docs/README.md).

## Run it

```sh
bun install
docker compose up -d              # Postgres (construction, construction_test), Mailpit
cp apps/construction-management/.env.example apps/construction-management/.env   # fill BETTER_AUTH_SECRET and CONSTRUCTION_PRIVATE_DATA_KEY
cp packages/db/construction/.env.example packages/db/construction/.env
bun run --filter @repo/construction-db migrate:deploy
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

Sign up at http://localhost:3002/sign-up with any email and a password; the verification code is in Mailpit (http://localhost:8025) or the server log, depending on `EMAIL_TRANSPORT`. Mobile OTP is off until SMS is switched on (`CONSTRUCTION_SMS=on`, ADR CM-0009); then any +91 mobile works locally with `OTP_TEST_CODE=000000`. Files go to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise to `apps/construction-management/.blob-local`.

APIs: http://localhost:3002/api/docs
