import { describe, expect, it } from "vitest";

import { isProgram } from "./executable-file";
import { cleanFileName, fileExtension } from "./file-name";
import { firstBytes } from "./object-storage";

describe("cleanFileName", () => {
  it("keeps the last segment without control characters or quotes", () => {
    expect(cleanFileName("../../etc/passwd", "pdf")).toBe("passwd");
    expect(cleanFileName("C:\\scans\\LOA.pdf", "pdf")).toBe("LOA.pdf");
    expect(cleanFileName('Work "order"\u0000.pdf', "pdf")).toBe(
      "Work order.pdf",
    );
    expect(cleanFileName("  ", "pdf")).toBe("document.pdf");
    expect(cleanFileName(null, "bin")).toBe("document.bin");
    expect(cleanFileName("x".repeat(300), "bin")).toHaveLength(200);
  });
});

describe("fileExtension", () => {
  it("is the last extension, lowercased, ignoring trailing dots and spaces", () => {
    expect(fileExtension("BOQ.XLSX")).toBe("xlsx");
    expect(fileExtension("report.PDF.exe")).toBe("exe");
    expect(fileExtension("setup.exe. ")).toBe("exe");
    expect(fileExtension("README")).toBeNull();
    expect(fileExtension("archive.")).toBeNull();
  });
});

describe("isProgram", () => {
  const bytes = (...values: number[]) => Uint8Array.from(values);

  it("knows Windows, Linux and macOS programs by their first bytes", () => {
    expect(isProgram(bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(true);
    expect(isProgram(bytes(0x7f, 0x45, 0x4c, 0x46, 2))).toBe(true);
    expect(isProgram(bytes(0xcf, 0xfa, 0xed, 0xfe))).toBe(true);
    expect(isProgram(bytes(0xce, 0xfa, 0xed, 0xfe))).toBe(true);
    expect(isProgram(bytes(0xfe, 0xed, 0xfa, 0xcf))).toBe(true);
    expect(isProgram(bytes(0xca, 0xfe, 0xba, 0xbe))).toBe(true);
    expect(isProgram(bytes(0xbf, 0xba, 0xfe, 0xca))).toBe(true);
  });

  it("lets documents, zips and short files through", () => {
    expect(isProgram(new TextEncoder().encode("%PDF-1.7"))).toBe(false);
    expect(isProgram(bytes(0x50, 0x4b, 0x03, 0x04))).toBe(false);
    expect(isProgram(bytes(0x4d))).toBe(false);
    expect(isProgram(new Uint8Array())).toBe(false);
  });
});

describe("firstBytes", () => {
  it("reads only the prefix across chunks and stops the stream", async () => {
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(Uint8Array.from([pulled, pulled]));
        if (pulled === 10) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const prefix = await firstBytes(
      { body, contentType: "application/octet-stream", contentLength: 20 },
      3,
    );
    expect([...prefix]).toEqual([1, 1, 2]);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });

  it("returns a shorter object whole", async () => {
    const prefix = await firstBytes(
      {
        body: new Blob([Uint8Array.from([7, 8])]).stream(),
        contentType: "application/octet-stream",
        contentLength: 2,
      },
      64,
    );
    expect([...prefix]).toEqual([7, 8]);
  });
});
