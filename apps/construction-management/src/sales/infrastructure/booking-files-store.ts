import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import {
  BOOKING_FILES_MAX,
  bookingFilesLimit,
  bookingFormExists,
  bookingNotFoundForFiles,
  type BookingFile,
  type BookingFileStore,
} from "../application/booking-files";
import type { SalesDirectory } from "../application/ports";

type FileRow = Prisma.ConstructionSalesDocumentFileGetPayload<object>;

function toFile(row: FileRow): BookingFile & { deletedAt: Date | null } {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    bookingId: row.documentId,
    role: row.role === "booking_form" ? "booking_form" : "photo",
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    thumbKey: row.thumbKey,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    deletedAt: row.deletedAt,
  };
}

function live(row: FileRow): BookingFile {
  const { deletedAt: _deletedAt, ...file } = toFile(row);
  return file;
}

const ofBooking = (workspaceId: string, bookingId: string) => ({
  workspaceId,
  documentType: "booking" as const,
  documentId: bookingId,
});

const OLDEST_FIRST = [{ createdAt: "asc" as const }, { id: "asc" as const }];

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Booking files in `construction_sales.document_files` (CM-1006). Each
 * write is one transaction holding the booking's row, with its
 * `stored_files` rows and audit event.
 */
export class PrismaBookingFileStore implements BookingFileStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: SalesDirectory,
  ) {}

  async locate(workspaceId: string, bookingId: string) {
    const row = await this.db.constructionSalesBooking.findFirst({
      where: { id: bookingId, workspaceId, deletedAt: null },
      select: { id: true, workspaceId: true, projectId: true },
    });
    return row;
  }

  async files(workspaceId: string, bookingId: string) {
    const rows = await this.db.constructionSalesDocumentFile.findMany({
      where: { ...ofBooking(workspaceId, bookingId), deletedAt: null },
      orderBy: OLDEST_FIRST,
    });
    return rows.map(live);
  }

  count(workspaceId: string, bookingId: string) {
    return this.db.constructionSalesDocumentFile.count({
      where: { ...ofBooking(workspaceId, bookingId), deletedAt: null },
    });
  }

  async file(workspaceId: string, bookingId: string, fileId: string) {
    const row = await this.db.constructionSalesDocumentFile.findFirst({
      where: {
        id: fileId,
        ...ofBooking(workspaceId, bookingId),
        deletedAt: null,
      },
    });
    return row == null ? null : live(row);
  }

  async fileByKey(workspaceId: string, bookingId: string, key: string) {
    const row = await this.db.constructionSalesDocumentFile.findFirst({
      where: { fileKey: key, ...ofBooking(workspaceId, bookingId) },
    });
    return row == null ? null : toFile(row);
  }

  async add(
    input: Parameters<BookingFileStore["add"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { booking, file } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM construction_sales.bookings
          WHERE id = ${booking.id}::uuid AND workspace_id = ${booking.workspaceId}
            AND deleted_at IS NULL
          FOR UPDATE`);
        if (locked.length === 0) throw bookingNotFoundForFiles();
        const files = await tx.constructionSalesDocumentFile.findMany({
          where: {
            ...ofBooking(booking.workspaceId, booking.id),
            deletedAt: null,
          },
          select: { role: true },
        });
        if (files.length >= BOOKING_FILES_MAX) throw bookingFilesLimit();
        if (
          file.role === "booking_form" &&
          files.some((item) => item.role === "booking_form")
        )
          throw bookingFormExists();
        await tx.constructionSalesDocumentFile.create({
          data: {
            id: file.id,
            workspaceId: file.workspaceId,
            projectId: file.projectId,
            documentType: "booking",
            documentId: file.bookingId,
            role: file.role,
            fileKey: file.fileKey,
            fileName: file.fileName,
            contentType: file.contentType,
            bytes: file.bytes,
            thumbKey: file.thumbKey,
            createdAt: file.createdAt,
            createdBy: file.createdBy,
          },
        });
        for (const stored of input.storedFiles)
          await recordStoredFile(tx, stored);
        await recordAudit(tx, input.audit);
      });
      return "added";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async remove(
    input: Parameters<BookingFileStore["remove"]>[0],
  ): Promise<boolean> {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionSalesDocumentFile.updateMany({
        where: {
          id: file.id,
          ...ofBooking(file.workspaceId, file.bookingId),
          deletedAt: null,
        },
        data: { deletedAt: input.now, deletedBy: input.by },
      });
      if (written.count === 0) return false;
      await markStoredFileDeleted(
        tx,
        file.workspaceId,
        file.fileKey,
        input.now,
      );
      if (file.thumbKey != null)
        await markStoredFileDeleted(
          tx,
          file.workspaceId,
          file.thumbKey,
          input.now,
        );
      await recordAudit(tx, input.audit);
      return true;
    });
  }

  async namesOf(workspaceId: string, userIds: readonly string[]) {
    if (userIds.length === 0) return new Map<string, string>();
    return this.directory.userNames(this.db, workspaceId, userIds);
  }
}
