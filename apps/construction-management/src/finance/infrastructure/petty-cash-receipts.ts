import { Zip, ZipPassThrough } from "fflate";

import type { ObjectStorage } from "@/src/shared-kernel/files";

import {
  RECEIPTS_ZIP_MAX_FILES,
  receiptEntryName,
  tooManyReceipts,
} from "../domain/petty-cash";

export type ReceiptFile = {
  /** The voucher's number. */
  number: string;
  fileName: string;
  fileKey: string;
};

/**
 * Export Receipts (CM-0017 §9): the files of an account's vouchers as one
 * ZIP, each named `<voucher number> <n>.<ext>` (`PC-26-27-00012 1.jpg`;
 * the number's slashes become dashes, as a ZIP name cannot hold them),
 * streamed while it is built. Receipts and PDFs are already compressed,
 * so entries are stored, not deflated. 409 `TOO_MANY_RECEIPTS` above 500
 * files (M9 moves larger exports onto the job queue). A file missing from
 * storage is left out.
 */
export function receiptsZip(
  storage: Pick<ObjectStorage, "get">,
  files: readonly ReceiptFile[],
): ReadableStream<Uint8Array> {
  if (files.length > RECEIPTS_ZIP_MAX_FILES)
    throw tooManyReceipts(files.length);
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error != null) {
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        const counts = new Map<string, number>();
        for (const file of files) {
          const object = await storage.get(file.fileKey);
          if (object == null) continue;
          const index = (counts.get(file.number) ?? 0) + 1;
          counts.set(file.number, index);
          const entry = new ZipPassThrough(
            receiptEntryName(file.number, index, file.fileName),
          );
          zip.add(entry);
          const reader = object.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            entry.push(value);
          }
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
