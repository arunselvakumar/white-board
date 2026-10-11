import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { ObjectStorage } from "@/src/shared-kernel/files";

import { receiptsZip, type ReceiptFile } from "./petty-cash-receipts";

/** Storage whose objects are `chunks` chunks of 4 bytes each, counting reads. */
function storage(chunks: number) {
  const opened: string[] = [];
  let reads = 0;
  const store: Pick<ObjectStorage, "get"> = {
    get(key) {
      opened.push(key);
      let left = chunks;
      return Promise.resolve({
        contentType: "image/jpeg",
        contentLength: chunks * 4,
        body: new ReadableStream<Uint8Array>({
          pull(controller) {
            reads += 1;
            if (left === 0) controller.close();
            else {
              left -= 1;
              controller.enqueue(new Uint8Array([1, 2, 3, 4]));
            }
          },
        }),
      });
    },
  };
  return { store, opened, reads: () => reads };
}

const files = (n: number): ReceiptFile[] =>
  Array.from({ length: n }, (_, index) => ({
    number: "PC/26-27/00001",
    fileName: `bill-${String(index)}.jpg`,
    fileKey: `key-${String(index)}`,
  }));

describe("receiptsZip (CM-703)", () => {
  it("builds a ZIP of every file, named by voucher number", async () => {
    const { store } = storage(3);
    const bytes = new Uint8Array(
      await new Response(receiptsZip(store, files(2))).arrayBuffer(),
    );
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual([
      "PC-26-27-00001 1.jpg",
      "PC-26-27-00001 2.jpg",
    ]);
    expect(entries["PC-26-27-00001 1.jpg"]).toHaveLength(12);
  });

  it("reads storage only as the client pulls, and stops when it cancels", async () => {
    const { store, opened } = storage(50);
    const reader = receiptsZip(store, files(20)).getReader();
    await reader.read();
    await reader.cancel();
    // One file opened for the first chunk; the other 19 never are.
    expect(opened.length).toBeLessThan(3);
  });
});
