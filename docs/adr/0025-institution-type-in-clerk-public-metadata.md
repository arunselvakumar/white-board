# Institution type lives in Clerk Organization public metadata

> **Superseded by [ADR-0034](./0034-identity-on-better-auth.md):** the Institution Type is the `institution_type` column of `identity.workspaces`, not Clerk public metadata.

A Workspace is still a Clerk Organization. Institution type is an attribute of that Workspace: School, Preschool, College, University, Training Institute, or Other. It is not secret, and the UI will read it to choose copy and defaults. Training Institute is the only type Workspace Creation can set today; the rest stay in the catalog as coming soon so the metadata contract does not change when they ship.

We store them on the Organization as `publicMetadata.institutionType` and, when the type is Other, `publicMetadata.institutionTypeOther`. The Frontend API cannot set public metadata, so Workspace Creation creates the Organization through the Backend API with the metadata included. Members can read it from the Organization on the client.

We do not put it in private metadata (members and the client could not read it). We do not copy it into Postgres: there is no Workspace table (ADR-0018). If it later becomes a domain invariant we query and enforce in our own models, promote it then — not now.

**Considered options:** Clerk public metadata; Clerk private metadata; a Workspace row in Postgres.
