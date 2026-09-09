# Zod is the HTTP validator, not the domain

Zod belongs to Request/Response models (runtime validation and OpenAPI). Commands, queries, and the domain do not import Zod. Aggregates and value objects enforce invariants in code.

Invalid HTTP input is a 400 from the adapter. A domain rule failure (complete twice, empty title constructed in the domain) is a domain error, mapped to HTTP in the adapter.

**Considered options:** Zod only at HTTP; Zod in the domain; domain schemas as the HTTP contract.
