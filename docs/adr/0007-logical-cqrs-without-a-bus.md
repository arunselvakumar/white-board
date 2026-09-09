# Logical CQRS, no bus

Writes go through command handlers; reads go through query handlers. Both use the same Postgres database and the same Prisma client. Next.js Route Handlers call those handlers directly.

We are not introducing an in-process command/query mediator or a separate read store. “CQRS” here means a write/read seam in the application layer, not a message architecture. A bus can be added later if multiple callers need one.

Aggregates may still record domain events and dispatch them in-process after persist — that is [ADR-0008](./0008-in-process-domain-events.md), not a CQRS bus.

**Considered options:** logical CQRS with direct calls; in-process mediator; full CQRS with a separate read model.
