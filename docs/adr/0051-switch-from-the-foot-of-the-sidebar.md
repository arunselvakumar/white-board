# Switching lives at the foot of the sidebar: one row, one modal

## Context

ADR-0050 put a switcher row at the top of the sidebar: the product mark, the Active Workspace or Company, the product's name, and chevrons. In use it read badly. "Construction Management" truncated in a 16 rem panel, and a row that changes something rarely held the first and most prominent place. The owner asked for a plain action instead, "just like we have My Profile at the bottom left", that opens a modal.

## Decision

**The switcher row goes.** `SidebarSwitcher` is removed. The account row is now the first row of the sidebar, as ADR-0049 had it.

**One switch row at the foot of the sidebar.** It is an ordinary sidebar row (icon and label) among the footer rows, so it takes the glide pill like its neighbours. Construction Management: My Profile, Switch Company, Sign out. Whiteboard: Switch Workspace, Dark mode, Sign out. Sign out stays last.

**It opens a modal, not a menu.** `SidebarSwitch` in `sidebar-chrome` draws the row and the modal; each app passes its words, its list and how to switch. Each row shows an initial tile, the name and the User's role there. The current one is marked Current. A longer list scrolls inside the modal.

- Picking another row switches at once, with no confirm step, and keeps the modal open with a spinner on that row until the app reloads.
- Picking the current row closes the modal.
- A switch that fails says so in the modal. Whiteboard already did this under the row; Construction Management used to fail silently.
- Construction Management keeps Create a Company, as the modal's footer. Whiteboard offers no create, since Workspace Creation is only for a User with no Workspace.

**Each app keeps its own word.** Whiteboard says Switch Workspace. Construction Management says Switch Company, because Company is its tenant and Workspace is already a main-menu area there (Central Store, Central Payment and the rest).

**The modal stays reachable with one Workspace or Company.** It shows the one there is; in Construction Management it is also the way to create another.

## Consequences

- The sidebar no longer shows the Active Workspace or Company on screen unless the modal is open. The switch row's accessible name carries it (`Switch Company. Active Company: NAC`), and tests read it there.
- The product mark and name leave the sidebar from `md` up. On a phone the slim bar keeps them. With no User, the account row falls back to them in both apps.
- On a phone the sidebar is a sheet, so the modal opens nested over it. Base UI draws no backdrop for a nested dialog, which left the bright sheet competing with the modal, so `DialogContent` gained `forceOverlay` and this modal sets it. Other nested dialogs are unchanged.
- The Storybook shell contracts and Construction Management's `AppShellPage` find the row by its name, and the list inside the `dialog` role, not `menu`.
