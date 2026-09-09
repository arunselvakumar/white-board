# Aggregates record in-process domain events

This spike is the template for later business APIs, so aggregates record domain events (`TodoCreated`). After the command handler persists, it dispatches those events to in-process listeners. No broker, no outbox, no event sourcing. Prisma remains the source of truth.

Listeners may be no-ops today. The shape is what later resources will copy.

**Considered options:** no events until a second consumer exists; in-process dispatch after persist; transactional outbox.

**Consequences:** [ADR-0007](./0007-logical-cqrs-without-a-bus.md) still forbids a command/query mediator and a separate read store. It does not forbid domain events.
