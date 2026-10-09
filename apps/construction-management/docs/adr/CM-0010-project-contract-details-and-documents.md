# CM-0010 — Project contract details, custom fields and documents

- Status: accepted
- Date: 2026-10-09
- Tickets: CM-413 (contract details and custom fields), CM-414 (Project documents)
- Relates to: [CM-0001](CM-0001-app-and-schemas.md) (files in private Vercel Blob)

Builders and contractors file every job under the papers that gave it to them. The contractor sends a numbered Quotation. The client accepts it with a Purchase Order or a Work Order. Government and EPC work adds a tender or RFQ reference, a Letter of Award and a signed Agreement. Every later bill quotes those numbers and dates, and the work order date often starts the completion clock. Owners asked to keep these numbers on the Project and to keep the scanned papers there too. Some owners also keep job facts no form will ever predict, such as "Site engineer" or "Architect".

## Decision

**Contract Details are optional columns on the Project.** The columns are:

- `client_name`
- `client_phone`, an Indian mobile stored as E.164
- `tender_ref`
- `quotation_no` and `quotation_date`
- `loa_no` and `loa_date`
- `client_order_no` and `client_order_date`
- `agreement_no` and `agreement_date`
- `order_value`, in paise as `BIGINT`, because a single order can pass ₹21.47 crore

Nothing is required, and no date has to come before another: quotations are revised and papers are entered late. On an edit, a field that is omitted keeps its stored value, and `null` or blank clears it, so an older client never wipes a field it doesn't know about. Order Value follows the Project menu's Financial flag. Without that flag the value is `null` in responses, and a value sent in an edit is ignored, so the stored value survives.

**The client's PO / WO is the Client Order.** On screen it is labelled "PO / WO". In code it is `clientOrder*` and `client_order`. The Purchase Order in procurement (CM-504) goes the other way, from the Company to a Supplier. Using one name for both would mix them up in reports and search.

**Custom Fields are per Project, text only, with suggestions.** They are stored in `construction_projects.custom_fields` as label, value and position, with at most 20 per Project. A label is unique on its Project ignoring case, enforced by a unique index on `lower(label)`. Saving the Project replaces the whole list in the same transaction, under the Project's `updatedAt` check. `GET …/projects/custom-field-labels` returns labels already used on the Company's live Projects, most used first, so the form can suggest "Site engineer" instead of letting "Site Engr" appear.

**Project Documents accept any file type except programs, up to 25 MB, with 50 per Project.** Each file is filed under a kind: `tender`, `quotation`, `loa`, `client_order`, `agreement` or `other`. Programs are refused twice: by file extension when the upload starts, and by content (`MZ`, ELF, Mach-O) when it completes. Zips are allowed and are not scanned, and the Documents tab says so. A file is served as what its content shows it to be. A PDF or image may open in the browser. Everything else is `application/octet-stream` and always downloads, with `nosniff`, so an uploaded HTML or SVG file can't run on our origin. Files count toward the Plan's storage (`stored_files`), and the PlanGate is asked before an upload starts. A Project with live documents can't be deleted, the same rule as one with labour on it.

**Large files go straight from the browser to private Blob.** Vercel Functions refuse request bodies over 4.5 MB, so documents can't pass through our routes the way photos do. An upload has three steps:

1. **Start.** We check permission, name, size, count and plan, and mint the key `companies/<workspaceId>/project-documents/<projectId>/<uuid>.<ext>`.
2. **Send the bytes.** The browser calls `uploadPresigned` from `@vercel/blob/client`. Our presign route signs a short-lived, private `put` for that exact key, after checking the Session again. Files of 8 MB or more upload in parts.
3. **Complete.** We `head` the object, check its size, read its first bytes to learn the type, and record the document, its `stored_files` row and the audit event in one transaction.

In development and tests there is no Blob, so step 2 posts the bytes to our own route, which stores them on disk. Completion is idempotent on the key, so a retry after a dropped response doesn't add a second row.

## Consequences

- The Project form groups its fields into four cards: Project, Client, Contract and Additional details. The optional cards start collapsed and show a one-line summary. Contract shows each paper as one row of number, date and attachments. Tender ref., LOA and Agreement appear on demand.
- Files picked on Add Project wait in the browser and upload as soon as the Project is created.
- An upload abandoned between steps 2 and 3 leaves an object in Blob with no `stored_files` row. It costs storage, not correctness. A clean-up job (M9 worker) can list `project-documents/` keys that have no row.
- Labour and vendor documents still upload through our routes, capped at 10 MB, so they fail between 4.5 and 10 MB on Vercel. Moving them to this flow is a separate change.
- CM-407 (attachments service) can grow from the pieces this adds to `src/shared-kernel/files`.

## Considered options

- **Company-wide custom fields set up in Settings:** more consistent, but needs a Settings screen before anyone can add a field. The owner chose per-Project fields with suggestions.
- **Typed custom fields (number, date):** useful only for sorting and reports we don't have. Text only for now.
- **Separate PO and WO fields:** clients use either word for the same paper. One Client Order field is enough.
- **Uploads through our route (as for photos):** simple, but capped at 4.5 MB on Vercel. Rejected.
- **`handleUpload` with an upload-completed callback:** the callback never reaches localhost, and it would record the file before we can sniff it. We record the document ourselves in step 3.
- **Allow every file type:** programs gain nothing on a construction job and make the store a malware host. Blocking executables was the owner's choice.
