# CM-0014 — Attachments service and the Gallery index

- Status: accepted
- Date: 2026-10-10
- Tickets: CM-407 (attachments service), CM-408 (Drawings), CM-409 (Testing Reports), CM-410 (Gallery)
- Relates to: [CM-0001](CM-0001-app-and-schemas.md) (private Vercel Blob), [CM-0010](CM-0010-project-contract-details-and-documents.md) (direct browser uploads), [CM-0013](CM-0013-projects-structure-product-decisions.md) §8–10

CM-414 built a three-step direct upload (start → send to Blob → complete) for Project Documents, because Vercel refuses request bodies over 4.5 MB. M4 adds two more owners of files (drawings with revisions up to 100 MB, testing reports), and later milestones add many: worksheet photos, issue images, inspection images, petty-cash bills. Each must check permission, size, type and plan storage the same way, and the Gallery must list all of them for a Project without one context reading another's tables.

## Decision

**The direct upload becomes a kernel service: `src/shared-kernel/attachments`.** It owns the parts every owner repeats:

- An **upload policy** per purpose: accepted content (`images`, `pdf_or_image`, `any_but_programs`, `drawing` = PDF, images, DWG, DXF), the largest file, and the multipart threshold.
- **Start**: clean the file name, refuse programs by extension, check the size against the policy and the plan's storage (`PlanGate`), and mint the key `companies/<workspaceId>/<purpose>/<ownerId>/<uuid>.<ext>`.
- **Presign**: sign a short-lived private `put` for exactly that key after checking the Session again (unchanged from CM-0010).
- **Complete**: `head` the object, check its size, sniff the first bytes (programs refused, the served type decided from content), and return a `CheckedUpload` that the owning context records **in its own transaction** together with its `stored_files` row and audit event. Completion stays idempotent on the key.
- A browser hook, `useDirectUpload`, that runs the three steps with progress and cancel, used by every upload form.

The owning context keeps its own file rows (`documents`, `drawing_revisions`, `testing_reports`): the kernel never stores a business record. Project Documents move onto the service with no change of behaviour or of their keys.

**Thumbnails are made in the browser.** There is no image library on the server, and adding `sharp` to a Vercel Function only for thumbnails costs cold-start time. For an image, the browser draws a WebP at most 480 px on its longer side and sends it to our route (at most 300 KB) after completion; the server sniffs it as WebP, stores it at `<key>.thumb.webp`, and counts it in `stored_files`. A missing thumbnail is not an error: the Gallery falls back to the full image, and PDFs show a file icon.

**The Gallery is an index in the projects context: `construction_projects.media_items`.** One row per image or PDF attached anywhere in a Project: source module, source id, file key, thumbnail key, file name, content type, bytes, uploaded by and uploaded at, and a tombstone. The projects context writes the row in the same transaction as its own drawings, testing reports and documents. Later contexts raise `ProjectMediaAttached` and `ProjectMediaRemoved` (in-process events, root ADR-0008) and a projects listener writes the row, so no context reads another's tables. The migration backfills rows for existing Project Documents that are images or PDFs.

**Serving a file is the owner's route**, as for documents: it checks permission on the source (Drawings, Testing Reports, Documents), then redirects to a short-lived signed URL (Blob) or streams it (disk). The Gallery links to those routes; it has no file route of its own, so the Gallery's Read flag never exposes a file its source would hide.

## Consequences

- Drawings accept up to 100 MB, which only the direct path can carry; the 25 MB document limit is unchanged.
- An abandoned upload still leaves an orphan object (CM-0010); the clean-up job (M9) covers every purpose by listing `companies/*/<purpose>/` keys without a `stored_files` row.
- Old browsers without `OffscreenCanvas` or WebP encoding upload without a thumbnail.
- Labour and vendor photos and documents still go through our routes (≤ 10 MB); moving them to the service is a separate change.

## Considered options

- **One shared `attachments` table for every context**: the Gallery would be a single query, but every context would write into one table it doesn't own, and deleting a source would need a cross-context transaction. Rejected in favour of an index fed by events.
- **Thumbnails with `sharp` in the complete step**: exact and server-trusted, but a native dependency in the Function bundle. Revisit if browser thumbnails prove unreliable.
- **Vercel Image Optimization for thumbnails**: needs public URLs; our files are private.
