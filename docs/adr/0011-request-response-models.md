# HTTP contracts are RequestModel / ResponseModel

The HTTP adapter names types `CreateTodoRequestModel` / `CreateTodoResponseModel` (and the same pattern for Get/List/Update/Delete). We do not call these DTOs, and we do not use them as commands or queries.

Each write maps three types: RequestModel (Zod, Swagger) → Command → domain `Todo`. Each read: RequestModel → Query → ResponseModel. Route Handlers validate and map. Application handlers never import HTTP models.

No shared `TodoDto`. List and get have their own response models.

**Considered options:** three mapped types; request model as the command; command-only with ad-hoc Zod in the route.
