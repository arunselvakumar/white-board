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
 * streamed as the client reads it: each pull reads one more chunk of one
 * file, so a slow client never makes the server hold the archive, and a
 * client that goes away stops the reads. Receipts and PDFs are already
 * compressed,
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
  /** ZIP bytes made but not yet handed to the client. */
  const ready: Uint8Array[] = [];
  let finished = false;
  let failure: Error | null = null;
  const zip = new Zip((error, chunk, final) => {
    if (error != null)
      failure = error instanceof Error ? error : new Error(String(error));
    else ready.push(chunk);
    if (final) finished = true;
  });
  const counts = new Map<string, number>();
  let next = 0;
  let current: {
    entry: ZipPassThrough;
    reader: ReadableStreamDefaultReader<Uint8Array>;
  } | null = null;
  let ended = false;

  /** One step: open the next file, read one chunk, or end the archive. */
  async function advance(): Promise<void> {
    if (current != null) {
      const { done, value } = await current.reader.read();
      if (done) {
        current.entry.push(new Uint8Array(0), true);
        current = null;
      } else current.entry.push(value);
      return;
    }
    const file = files[next];
    if (file == null) {
      if (!ended) {
        ended = true;
        zip.end();
      }
      return;
    }
    next += 1;
    const object = await storage.get(file.fileKey);
    if (object == null) return;
    const index = (counts.get(file.number) ?? 0) + 1;
    counts.set(file.number, index);
    const entry = new ZipPassThrough(
      receiptEntryName(file.number, index, file.fileName),
    );
    zip.add(entry);
    current = { entry, reader: object.body.getReader() };
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (ready.length === 0 && !finished && failure == null)
          await advance();
        if (failure != null) throw failure;
        for (const chunk of ready.splice(0)) controller.enqueue(chunk);
        if (finished) controller.close();
      } catch (error) {
        await current?.reader.cancel().catch(() => undefined);
        current = null;
        controller.error(error);
      }
    },
    async cancel() {
      await current?.reader.cancel().catch(() => undefined);
      current = null;
      next = files.length;
    },
  });
}
