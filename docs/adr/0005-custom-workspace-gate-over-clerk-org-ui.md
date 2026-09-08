# Custom Workspace Gate over Clerk organization widgets

Whiteboard is B2B: a Session may not enter the In-app Home without an Active Workspace. Clerk can enforce that with its choose-organization session task and `<CreateOrganization />` / `<TaskChooseOrganization />`.

We will not use those widgets. Workspace Creation (`/create-workspace`) and Workspace Selection (`/select-workspace`) are our Onboarding Layout, talking to Clerk's organization APIs (`createOrganization`, membership list, `setActive`). Same reason as ADR-0001: the product language is Workspace, the chrome is ours, Clerk is the store.

The Clerk instance has `force_organization_selection` off so Clerk does not inject its own choose-organization session task in front of our Gate.
