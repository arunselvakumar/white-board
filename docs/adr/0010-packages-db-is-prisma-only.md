# `packages/db` is Prisma schema, migrations, and client

`packages/db` owns the Prisma schema, migrations, and generated client — one Postgres, one schema, all tables. It does not own repositories, domain types, or HTTP models.

Each context’s infrastructure implements that context’s repository port and may use only its own Prisma models. Other contexts are referenced by ID. No cross-context joins in Prisma.

**Considered options:** db package as schema+client only; db package also holds repositories; schema-per-context Prisma projects.
