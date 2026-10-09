import type { AuditEvent } from "@/src/shared-kernel/audit";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import {
  checkImage,
  cleanFileName,
  companyFileKey,
  type NewStoredFile,
  type ObjectStorage,
  type StoredObject,
} from "@/src/shared-kernel/files";
import { checkDocument } from "@/src/shared-kernel/files/document-file";
import { newId } from "@/src/shared-kernel/ids";

/** Whose photo and "Other Documents" these are: a labourer or a vendor. */
export type PartyOwnerType = "labour" | "vendor";

export type PartyRef = {
  workspaceId: string;
  ownerType: PartyOwnerType;
  ownerId: string;
};

export type PartyDocument = {
  id: string;
  fileName: string;
  contentType: string;
  bytes: number;
  createdAt: Date;
  createdBy: string;
};

export type PartyDocumentRecord = PartyDocument & { fileKey: string };

const MB = 1024 * 1024;

/** A photo is at most 10 MB, like a Team Member's (`modules/01`). */
export const PARTY_PHOTO_MAX_BYTES = 10 * MB;
/** A PDF, PNG, JPEG or WebP document is at most 10 MB. */
export const PARTY_DOCUMENT_MAX_BYTES = 10 * MB;
export const MAX_DOCUMENTS_PER_PARTY = 20;

/** The rows behind photos and documents; each write is one transaction. */
export type PartyFilesStore = {
  /** The owner's photo key, or null when there is no such live owner. */
  owner(ref: PartyRef): Promise<{ photoKey: string | null } | null>;
  /**
   * Sets `photo_key` from `loadedKey` to `key` (compare-and-set, else
   * `PHOTO_CHANGED`), records the stored file and the audit event.
   */
  setPhoto(input: {
    ref: PartyRef;
    loadedKey: string | null;
    key: string | null;
    added: NewStoredFile | null;
    removedKey: string | null;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<void>;
  documents(ref: PartyRef): Promise<PartyDocumentRecord[]>;
  document(ref: PartyRef, id: string): Promise<PartyDocumentRecord | null>;
  addDocument(input: {
    ref: PartyRef;
    document: PartyDocumentRecord;
    file: NewStoredFile;
    audit: AuditEvent;
  }): Promise<void>;
  /** False when the document was already gone. */
  removeDocument(input: {
    ref: PartyRef;
    document: PartyDocumentRecord;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

const FOLDERS: Record<PartyOwnerType, { photo: string; document: string }> = {
  labour: { photo: "labour-photos", document: "labour-documents" },
  vendor: { photo: "vendor-photos", document: "vendor-documents" },
};

const NOUNS: Record<PartyOwnerType, string> = {
  labour: "Labour",
  vendor: "vendor",
};

function ownerNotFound(ownerType: PartyOwnerType): DomainError {
  return notFound(
    ownerType === "labour" ? "LABOUR_NOT_FOUND" : "VENDOR_NOT_FOUND",
    `This ${NOUNS[ownerType]} was not found.`,
  );
}

export const partyPhotoNotFound = () =>
  notFound("PHOTO_NOT_FOUND", "There is no photo.");

export const partyDocumentNotFound = () =>
  notFound("DOCUMENT_NOT_FOUND", "This document was not found.");

/**
 * Photo and "Other Documents" of a labourer or a vendor (CM-205, CM-208):
 * checks the file by content, uploads it under the Company's prefix, and
 * records it (`stored_files`) in the same transaction as the row that
 * points at it. A failed write deletes the new object; a replaced or
 * removed one is deleted after the write.
 */
export class PartyFiles {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly store: PartyFilesStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async owner(ref: PartyRef): Promise<{ photoKey: string | null }> {
    const found = await this.store.owner(ref);
    if (found == null) throw ownerNotFound(ref.ownerType);
    return found;
  }

  private audit(
    ref: PartyRef,
    by: string,
    action: string,
    now: Date,
    extra: Partial<AuditEvent>,
  ): AuditEvent {
    return {
      workspaceId: ref.workspaceId,
      actorUserId: by,
      action: `${ref.ownerType}.${action}`,
      entityType: ref.ownerType,
      entityId: ref.ownerId,
      occurredAt: now,
      ...extra,
    };
  }

  /** Best effort: a leftover object costs storage, not correctness. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      console.error(`Could not delete ${key} from storage`, error);
    }
  }

  async setPhoto(
    input: PartyRef & {
      bytes: Uint8Array;
      contentType: string | null;
      by: string;
    },
  ): Promise<{ photoKey: string }> {
    const { photoKey: loadedKey } = await this.owner(input);
    // The same rule as a Team Member's photo: PNG, JPEG or WebP, ≤ 10 MB.
    const image = checkImage("member_photo", input.bytes, input.contentType);
    const now = this.clock();
    const key = companyFileKey(
      input.workspaceId,
      FOLDERS[input.ownerType].photo,
      image.extension,
    );
    await this.storage.put(key, input.bytes, image.contentType);
    try {
      await this.store.setPhoto({
        ref: input,
        loadedKey,
        key,
        added: {
          workspaceId: input.workspaceId,
          key,
          kind: `${input.ownerType}_photo`,
          contentType: image.contentType,
          bytes: image.bytes,
          createdBy: input.by,
          createdAt: now,
        },
        removedKey: loadedKey,
        by: input.by,
        now,
        audit: this.audit(input, input.by, "photo_changed", now, {
          before: { photoKey: loadedKey },
          after: { photoKey: key },
        }),
      });
    } catch (error) {
      await this.discard(key);
      throw error;
    }
    if (loadedKey != null) await this.discard(loadedKey);
    return { photoKey: key };
  }

  /** Removing a photo that is not there is not an error. */
  async removePhoto(input: PartyRef & { by: string }): Promise<void> {
    const { photoKey: loadedKey } = await this.owner(input);
    if (loadedKey == null) return;
    const now = this.clock();
    await this.store.setPhoto({
      ref: input,
      loadedKey,
      key: null,
      added: null,
      removedKey: loadedKey,
      by: input.by,
      now,
      audit: this.audit(input, input.by, "photo_removed", now, {
        before: { photoKey: loadedKey },
        after: { photoKey: null },
      }),
    });
    await this.discard(loadedKey);
  }

  async photo(ref: PartyRef): Promise<StoredObject> {
    const { photoKey } = await this.owner(ref);
    if (photoKey == null) throw partyPhotoNotFound();
    const object = await this.storage.get(photoKey);
    if (object == null) throw partyPhotoNotFound();
    return object;
  }

  async documents(ref: PartyRef): Promise<PartyDocument[]> {
    await this.owner(ref);
    return (await this.store.documents(ref)).map(withoutKey);
  }

  async addDocument(
    input: PartyRef & {
      fileName: string | null;
      bytes: Uint8Array;
      contentType: string | null;
      by: string;
    },
  ): Promise<PartyDocument> {
    await this.owner(input);
    const checked = checkDocument(
      input.bytes,
      input.contentType,
      PARTY_DOCUMENT_MAX_BYTES,
    );
    const existing = await this.store.documents(input);
    if (existing.length >= MAX_DOCUMENTS_PER_PARTY)
      throw new DomainError(
        "DOCUMENTS_LIMIT",
        `Keep at most ${String(MAX_DOCUMENTS_PER_PARTY)} documents. Delete one first.`,
        { kind: "conflict" },
      );
    const now = this.clock();
    const key = companyFileKey(
      input.workspaceId,
      FOLDERS[input.ownerType].document,
      checked.extension,
    );
    const document: PartyDocumentRecord = {
      id: newId(now.getTime()),
      fileName: cleanFileName(input.fileName, checked.extension),
      contentType: checked.contentType,
      bytes: checked.bytes,
      createdAt: now,
      createdBy: input.by,
      fileKey: key,
    };
    await this.storage.put(key, input.bytes, checked.contentType);
    try {
      await this.store.addDocument({
        ref: input,
        document,
        file: {
          workspaceId: input.workspaceId,
          key,
          kind: `${input.ownerType}_document`,
          contentType: checked.contentType,
          bytes: checked.bytes,
          createdBy: input.by,
          createdAt: now,
        },
        audit: this.audit(input, input.by, "document_added", now, {
          after: {
            documentId: document.id,
            fileName: document.fileName,
            bytes: document.bytes,
          },
        }),
      });
    } catch (error) {
      await this.discard(key);
      throw error;
    }
    return withoutKey(document);
  }

  async readDocument(
    ref: PartyRef,
    documentId: string,
  ): Promise<{ document: PartyDocument; object: StoredObject }> {
    await this.owner(ref);
    const document = await this.store.document(ref, documentId);
    if (document == null) throw partyDocumentNotFound();
    const object = await this.storage.get(document.fileKey);
    if (object == null) throw partyDocumentNotFound();
    return { document: withoutKey(document), object };
  }

  async deleteDocument(
    input: PartyRef & { documentId: string; by: string },
  ): Promise<void> {
    await this.owner(input);
    const document = await this.store.document(input, input.documentId);
    if (document == null) throw partyDocumentNotFound();
    const now = this.clock();
    const removed = await this.store.removeDocument({
      ref: input,
      document,
      now,
      audit: this.audit(input, input.by, "document_deleted", now, {
        before: { documentId: document.id, fileName: document.fileName },
      }),
    });
    if (!removed) throw partyDocumentNotFound();
    await this.discard(document.fileKey);
  }
}

function withoutKey(record: PartyDocumentRecord): PartyDocument {
  return {
    id: record.id,
    fileName: record.fileName,
    contentType: record.contentType,
    bytes: record.bytes,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
  };
}
