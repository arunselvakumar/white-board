# Custom auth form over Clerk prebuilt UI

> **Amended by [ADR-0034](./0034-identity-on-better-auth.md):** the custom forms stay; they now use `@repo/auth` hooks on Better Auth instead of Clerk's `useSignIn` / `useSignUp`.

Whiteboard already had Clerk's prebuilt `<SignIn>` / `<SignUp>` cards. We replaced them with custom Sign-in, Sign-up, and Password Reset Flows (`useSignIn` / `useSignUp` + `@repo/ui`) so the Public Layout can match the v2 split-panel design, Urbanist, and `#595FAE`. Clerk's prebuilt components cannot be unstyled far enough to do that.

**Considered options:** restyle Clerk prebuilt cards; custom hooks + our primitives.

**Consequences:** we own error mapping, loading states, and any later factors (email verification, 2FA, OAuth). `<SignIn>`, `<SignUp>`, and catch-all `/sign-in` `/sign-up` routes go away.
