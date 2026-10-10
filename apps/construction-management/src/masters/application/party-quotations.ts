import {
  AttachmentUploads,
  storedFilesOf,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import type {
  NewStoredFile,
  ObjectStorage,
  StoredObject,
} from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { PARTY_KIND_INFO, partyNotFound, type PartyKind } from "../domain/party";
import {
  QUOTATION_FILE_KIND,
  QUOTATION_POLICY,
  QUOTATIONS_PER_PARTY_MAX,
  type Quotation,
} from "../domain/quotation";

export type StoredQuotation = Quotation & { deletedAt: Date | null };

/** A quotation with the names the screens show. */
export type QuotationView = Quotation & {
  partyName: string;
  /** A PDF or an image, which the browser shows. */
  viewable: boolean;
  createdByName: string | null;
};

export type QuotationListParams = {
  workspaceId: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
  partyKind?: PartyKind;
  /** Party or file name contains, ignoring case. */
  search?: string;
};

/** `construction_masters.quotations`, each write one transaction. */
export type QuotationStore = {
  /** The live party's name, or null when it is not a live party of the Company. */
  partyName(
    kind: PartyKind,
    workspaceId: string,
    partyId: string,
  ): Promise<string | null>;
  /** Live quotations of a party, newest first. */
  listForParty(
    kind: PartyKind,
    workspaceId: string,
    partyId: string,
  ): Promise<Quotation[]>;
  /** Live quotations of live parties, newest first (View Quotations). */
  list(
    params: QuotationListParams,
  ): Promise<{ items: (Quotation & { partyName: string })[]; total: number; hasMore: boolean }>;
  count(kind: PartyKind, workspaceId: string, partyId: string): Promise<number>;
  find(
    kind: PartyKind,
    workspaceId: string,
    partyId: string,
    id: string,
  ): Promise<Quotation | null>;
  findByKey(workspaceId: string, key: string): Promise<StoredQuotation | null>;
  /**
   * Inserts the quotation with its `stored_files` rows and audit event while
   * holding the party: 404 once it is gone, 409 `QUOTATIONS_LIMIT` at the
   * limit; `duplicate` when a row already has the key.
   */
  add(input: {
    quotation: Quotation;
    file: NewStoredFile;
    thumbnail?: NewStoredFile;
    audit: AuditEvent;
    max: number;
  }): Promise<"added" | "duplicate">;
  /** Tombstones it; false when it was already gone. */
  remove(input: {
    quotation: Quotation;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
  /** Team Member names by User id. */
  uploaderNames(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const quotationNotFound = () =>
  notFound("QUOTATION_NOT_FOUND", "This quotation was not found.");

type Party = { workspaceId: string; kind: PartyKind; partyId: string };

/**
 * Quotation files on Contractors and Suppliers (CM-501): a PDF or an
 * image, at most 10 MB, through the kernel's attachments service (start,
 * the bytes, complete), counted towards the Company's storage. Routes
 * check the Permission Matrix first.
 */
export class PartyQuotations {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly store: QuotationStore,
    storage: ObjectStorage,
    plan: PlanGate,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.uploads = new AttachmentUploads(storage, plan, clock);
  }

  private target(party: Party): UploadTarget {
    return {
      workspaceId: party.workspaceId,
      ownerId: party.partyId,
      policy: QUOTATION_POLICY,
    };
  }

  private async assertParty(party: Party): Promise<string> {
    const name = await this.store.partyName(
      party.kind,
      party.workspaceId,
      party.partyId,
    );
    if (name == null) throw partyNotFound(party.kind);
    return name;
  }

  private audit(
    quotation: Quotation,
    by: string,
    action: "quotation_added" | "quotation_deleted",
    now: Date,
  ): AuditEvent {
    const summary = {
      quotationId: quotation.id,
      fileName: quotation.fileName,
      bytes: quotation.bytes,
    };
    return {
      workspaceId: quotation.workspaceId,
      actorUserId: by,
      action: `${quotation.partyKind}.${action}`,
      entityType: quotation.partyKind,
      entityId: quotation.partyId,
      occurredAt: now,
      ...(action === "quotation_added"
        ? { after: summary }
        : { before: summary }),
    };
  }

  private async views(
    workspaceId: string,
    items: (Quotation & { partyName: string })[],
  ): Promise<QuotationView[]> {
    const names = await this.store.uploaderNames(workspaceId, [
      ...new Set(items.map((item) => item.createdBy)),
    ]);
    return items.map((item) => ({
      ...item,
      viewable: VIEWABLE.has(item.contentType),
      createdByName: names.get(item.createdBy) ?? null,
    }));
  }

  /** Step 1. 400 for a type or size the policy refuses, 409 `QUOTATIONS_LIMIT`, 402 past the plan. */
  async start(
    input: Party & { fileName: string; bytes: number },
  ): Promise<StartedUpload> {
    await this.assertParty(input);
    return this.uploads.start(this.target(input), {
      fileName: input.fileName,
      bytes: input.bytes,
      check: async () => {
        if (
          (await this.store.count(input.kind, input.workspaceId, input.partyId)) >=
          QUOTATIONS_PER_PARTY_MAX
        )
          throw quotationsLimit(input.kind);
      },
    });
  }

  /** Step 2, deployed: the `uploadPresigned()` handshake. */
  async answerDirectUpload(
    input: Party & { request: Request; body: unknown },
  ): Promise<unknown> {
    return this.uploads.answerDirectUpload(this.target(input), {
      request: input.request,
      body: input.body,
      authorize: async () => {
        await this.assertParty(input);
      },
    });
  }

  /** Step 2 in development and tests: the bytes through our route. */
  async receive(input: Party & { key: string; bytes: Uint8Array }) {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    await this.assertParty(input);
    await this.uploads.receive(this.target(input), input);
  }

  async receiveThumbnail(input: Party & { key: string; bytes: Uint8Array }) {
    await this.assertParty(input);
    await this.uploads.receiveThumbnail(this.target(input), input);
  }

  /** Step 3: records what arrived at `key`; a retry returns the same quotation. */
  async complete(
    input: Party & { key: string; fileName: string; by: string },
  ): Promise<{ quotation: QuotationView; created: boolean }> {
    const partyName = await this.assertParty(input);
    const { workspaceId } = input;
    const { value, created } = await this.uploads.complete<Quotation>(
      this.target(input),
      {
        key: input.key,
        fileName: input.fileName,
        recorded: async () => {
          const found = await this.store.findByKey(workspaceId, input.key);
          if (found == null) return null;
          return found.deletedAt == null
            ? { state: "live", value: found }
            : { state: "deleted" };
        },
        record: async (upload) => {
          const now = this.clock();
          const quotation: Quotation = {
            id: newId(now.getTime()),
            workspaceId,
            partyKind: input.kind,
            partyId: input.partyId,
            fileKey: upload.key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            createdAt: now,
            createdBy: input.by,
          };
          const [file, thumbnail] = storedFilesOf(upload, {
            workspaceId,
            kind: QUOTATION_FILE_KIND,
            by: input.by,
            now,
          });
          if (file == null) throw new Error("An upload has a stored file.");
          const result = await this.store.add({
            quotation,
            file,
            ...(thumbnail == null ? {} : { thumbnail }),
            audit: this.audit(quotation, input.by, "quotation_added", now),
            max: QUOTATIONS_PER_PARTY_MAX,
          });
          return result === "duplicate" ? "duplicate" : quotation;
        },
      },
    );
    const [view] = await this.views(workspaceId, [{ ...value, partyName }]);
    if (view == null) throw quotationNotFound();
    return { quotation: view, created };
  }

  /** The party's quotations, newest first. */
  async listForParty(party: Party): Promise<QuotationView[]> {
    const partyName = await this.assertParty(party);
    const items = await this.store.listForParty(
      party.kind,
      party.workspaceId,
      party.partyId,
    );
    return this.views(
      party.workspaceId,
      items.map((item) => ({ ...item, partyName })),
    );
  }

  /** View Quotations: every live party's quotations, newest first. */
  async list(params: QuotationListParams) {
    const page = await this.store.list(params);
    return {
      items: await this.views(params.workspaceId, page.items),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  private async live(party: Party, id: string): Promise<Quotation> {
    await this.assertParty(party);
    const found = await this.store.find(
      party.kind,
      party.workspaceId,
      party.partyId,
      id,
    );
    if (found == null) throw quotationNotFound();
    return found;
  }

  async read(
    party: Party,
    id: string,
  ): Promise<{ quotation: Quotation & { viewable: boolean }; object: StoredObject }> {
    const found = await this.live(party, id);
    const object = await this.uploads.read(found.fileKey);
    if (object == null) throw quotationNotFound();
    return {
      quotation: { ...found, viewable: VIEWABLE.has(found.contentType) },
      object,
    };
  }

  async readThumbnail(party: Party, id: string): Promise<StoredObject> {
    const found = await this.live(party, id);
    const object =
      found.thumbKey == null ? null : await this.uploads.read(found.thumbKey);
    if (object == null)
      throw notFound("THUMBNAIL_NOT_FOUND", "This file has no thumbnail.");
    return object;
  }

  /** Tombstone, then the object and its thumbnail go (best effort). */
  async delete(input: Party & { id: string; by: string }): Promise<void> {
    const quotation = await this.live(input, input.id);
    const now = this.clock();
    const removed = await this.store.remove({
      quotation,
      by: input.by,
      now,
      audit: this.audit(quotation, input.by, "quotation_deleted", now),
    });
    if (!removed) throw quotationNotFound();
    await this.uploads.discard(
      quotation.fileKey,
      ...(quotation.thumbKey == null ? [] : [quotation.thumbKey]),
    );
  }
}

export function quotationsLimit(kind: PartyKind) {
  return conflict(
    "QUOTATIONS_LIMIT",
    `Keep at most ${String(QUOTATIONS_PER_PARTY_MAX)} quotations on a ${PARTY_KIND_INFO[kind].label}. Remove one first.`,
  );
}
