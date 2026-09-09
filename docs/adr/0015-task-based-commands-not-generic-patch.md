# Domain operations are commands, not generic PATCH

The spike exposes five HTTP APIs: create, get, list, complete, delete. Completing a Todo is `POST /api/todos/:id/complete`, not `PATCH` with `{ "done": true }`. Completing twice is a domain error.

Later business APIs copy this: name the operation, don’t add a generic update because REST CRUD is familiar. No `PATCH /api/todos/:id` in this spike.

**Considered options:** create/get/list/complete/delete; full CRUD plus complete; create+get only.
