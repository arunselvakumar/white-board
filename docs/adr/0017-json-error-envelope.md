# HTTP errors use one JSON envelope

API errors are `{ "code": string, "message": string, "details"?: unknown }`. `details` is for Zod field errors.

| Case                                           | Status | Notes                     |
| ---------------------------------------------- | ------ | ------------------------- |
| No Session                                     | 401    | Not the Sign-in Flow      |
| No Active Workspace                            | 403    | Session exists            |
| Zod validation                                 | 400    | HTTP boundary             |
| Missing, or not in this Workspace              | 404    | Do not leak other tenants |
| Domain state conflict (e.g. already completed) | 409    | Not 400                   |
| Unexpected                                     | 500    | Generic body              |

Clients branch on `code`. We are not adopting RFC 7807 in this spike.

**Considered options:** one envelope; RFC 7807 problem+json; per-handler ad-hoc bodies.
