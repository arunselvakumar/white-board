# OpenAPI is generated from Zod Request/Response models

Every exposed HTTP API is documented in Swagger. The OpenAPI document is generated from the same Zod Request/Response models that validate at runtime. A Route Handler is not done until it appears at `/api/docs`.

We do not hand-write a parallel `openapi.yaml` or JSDoc swagger comments as the source of truth.

During this spike, `/api/docs` is reachable without a **Session** so the architecture can be reviewed in a browser. That does not make the APIs themselves public.

**Considered options:** generate OpenAPI from Zod; hand-written OpenAPI plus Zod; swagger-jsdoc on routes.
