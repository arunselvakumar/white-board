import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { expect } from "vitest";

import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as completeUpload } from "./[type]/[id]/files/route";
import { POST as receiveUpload } from "./[type]/[id]/files/uploads/app/route";
import { POST as startUpload } from "./[type]/[id]/files/uploads/route";
import { POST as sendThumbnail } from "./[type]/[id]/files/uploads/thumbnail/route";

/**
 * HTTP-test helpers for the documents' thread and files (M5): documents
 * written straight to their tables (the documents' own routes are other
 * tickets'), and the browser's upload flow through our routes.
 */

const DAY = new Date("2026-10-08T00:00:00.000Z");

let sequence = 0;

function number(prefix: string): string {
  sequence += 1;
  return `${prefix}${randomUUID().slice(0, 6)}${String(sequence)}`;
}

const audit = (by: string) => ({ createdBy: by, updatedBy: by });

export type DocumentPlace = {
  /** PR, MR, DN: the Project. */
  projectId?: string;
  /** PO, GRN: the location. */
  location?: StockLocation;
  /** MT: the two sides. */
  from?: StockLocation;
  to?: StockLocation;
  /** MR, DN: the Store. */
  storeId?: string;
};

function required<T>(value: T | undefined, what: string): T {
  if (value == null) throw new Error(`The fixture needs ${what}`);
  return value;
}

/** A live document of `type`, with only the columns its table requires. */
export async function addDocument(
  workspaceId: string,
  by: string,
  type: ProcurementDocumentType,
  place: DocumentPlace,
): Promise<{ id: string; number: string }> {
  const id = randomUUID();
  switch (type) {
    case "purchase_request": {
      const value = number("PR");
      await prisma.constructionProcurementPurchaseRequest.create({
        data: {
          id,
          workspaceId,
          projectId: required(place.projectId, "a Project"),
          number: value,
          requestDate: DAY,
          ...audit(by),
        },
      });
      return { id, number: value };
    }
    case "purchase_order": {
      const location = required(place.location, "a location");
      const value = number("PO");
      await prisma.constructionProcurementPurchaseOrder.create({
        data: {
          id,
          workspaceId,
          locationKind: location.kind,
          locationId: location.id,
          number: value,
          orderDate: DAY,
          expectedDeliveryDate: DAY,
          supplierId: randomUUID(),
          supplierName: "Sri Murugan Traders",
          billingAddressId: randomUUID(),
          billingName: "Head office",
          billingAddress: "12 Anna Salai, Chennai",
          ...audit(by),
        },
      });
      return { id, number: value };
    }
    case "goods_receipt": {
      const location = required(place.location, "a location");
      const value = number("GRN");
      await prisma.constructionProcurementGoodsReceipt.create({
        data: {
          id,
          workspaceId,
          locationKind: location.kind,
          locationId: location.id,
          number: value,
          receiptDate: DAY,
          inventoryDate: DAY,
          supplierId: randomUUID(),
          supplierName: "Sri Murugan Traders",
          ...audit(by),
        },
      });
      return { id, number: value };
    }
    case "material_transfer": {
      const from = required(place.from, "a source");
      const to = required(place.to, "a destination");
      const value = number("MT");
      await prisma.constructionProcurementMaterialTransfer.create({
        data: {
          id,
          workspaceId,
          number: value,
          transferDate: DAY,
          fromKind: from.kind,
          fromId: from.id,
          toKind: to.kind,
          toId: to.id,
          ...audit(by),
        },
      });
      return { id, number: value };
    }
    case "material_request": {
      const value = number("MR");
      await prisma.constructionProcurementMaterialRequest.create({
        data: {
          id,
          workspaceId,
          projectId: required(place.projectId, "a Project"),
          storeId: required(place.storeId, "a Store"),
          number: value,
          requestDate: DAY,
          ...audit(by),
        },
      });
      return { id, number: value };
    }
    case "delivery_note": {
      const request = await addDocument(
        workspaceId,
        by,
        "material_request",
        place,
      );
      const value = number("DN");
      await prisma.constructionProcurementDeliveryNote.create({
        data: {
          id,
          workspaceId,
          number: value,
          materialRequestId: request.id,
          storeId: required(place.storeId, "a Store"),
          projectId: required(place.projectId, "a Project"),
          deliveryDate: DAY,
          ...audit(by),
        },
      });
      return { id, number: value };
    }
  }
}

/** Tombstones a document as its own delete would. */
export async function deleteDocument(
  type: ProcurementDocumentType,
  id: string,
): Promise<void> {
  const data = { deletedAt: new Date(), deletedBy: "test" };
  if (type === "purchase_request")
    await prisma.constructionProcurementPurchaseRequest.update({
      where: { id },
      data,
    });
  else if (type === "purchase_order")
    await prisma.constructionProcurementPurchaseOrder.update({
      where: { id },
      data,
    });
  else if (type === "material_transfer")
    await prisma.constructionProcurementMaterialTransfer.update({
      where: { id },
      data,
    });
  else throw new Error(`deleteDocument does not cover ${type}`);
}

export const PDF = new TextEncoder().encode("%PDF-1.7\nPurchase Order\n%%EOF");
/** A RIFF/WEBP header: the app sniffs only the signature. */
export const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x20,
]);
/** An xlsx is a zip. */
export const XLSX = Uint8Array.from([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0,
]);
export const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0]);

export function documentBase(type: string, id: string): string {
  return `${TEST_ORIGIN}/api/construction/procurement/documents/${type}/${id}`;
}

export function documentParams(type: string, id: string) {
  return { params: Promise.resolve({ type, id }) };
}

export function fileParams(type: string, id: string, fileId: string) {
  return { params: Promise.resolve({ type, id, fileId }) };
}

export function jsonPost(url: string, cookie: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

export function get(url: string, cookie: string): Request {
  return new Request(url, { headers: { cookie } });
}

function raw(cookie: string, url: string, bytes: Uint8Array, type: string) {
  return new Request(`${TEST_ORIGIN}${url}`, {
    method: "POST",
    headers: { "content-type": type, cookie },
    body: Uint8Array.from(bytes),
  });
}

export type UploadedFile = {
  id: string;
  remarkId: string | null;
  fileName: string;
  contentType: string;
  bytes: number;
  viewable: boolean;
  url: string;
  thumbUrl: string | null;
  createdBy: string;
  createdByName: string | null;
  canRemove: boolean;
};

type Started = {
  key: string;
  fileName: string;
  upload: { via: "app"; url: string } | { via: "blob" };
  thumbnailUrl: string;
};

/** The browser's flow through the app: start, send, maybe a thumbnail, complete. */
export async function uploadFile(
  cookie: string,
  type: string,
  id: string,
  fileName: string,
  bytes: Uint8Array,
  options: { thumbnail?: Uint8Array } = {},
): Promise<UploadedFile> {
  const context = documentParams(type, id);
  const started = await startUpload(
    jsonPost(`${documentBase(type, id)}/files/uploads`, cookie, {
      fileName,
      bytes: bytes.byteLength,
    }),
    context,
  );
  expect(started.status).toBe(StatusCodes.CREATED);
  const body = (await started.json()) as Started;
  if (body.upload.via !== "app") throw new Error("Expected an app upload");
  const sent = await receiveUpload(
    raw(cookie, body.upload.url, bytes, "application/octet-stream"),
    context,
  );
  expect(sent.status).toBe(StatusCodes.NO_CONTENT);
  if (options.thumbnail != null) {
    const thumb = await sendThumbnail(
      raw(cookie, body.thumbnailUrl, options.thumbnail, "image/webp"),
      context,
    );
    expect(thumb.status).toBe(StatusCodes.NO_CONTENT);
  }
  const done = await completeUpload(
    jsonPost(`${documentBase(type, id)}/files`, cookie, {
      key: body.key,
      fileName: body.fileName,
    }),
    context,
  );
  expect(done.status).toBe(StatusCodes.CREATED);
  return (await done.json()) as UploadedFile;
}

/** Puts a Team Member on Projects (Project visibility, ADR CM-0003). */
export async function assign(
  memberId: string,
  ...projectIds: string[]
): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}
