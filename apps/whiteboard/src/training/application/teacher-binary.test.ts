import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { decodeTeacherDocument, decodeTeacherPhoto } from "./teacher-binary";

const tinyPng = () => sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
async function tinyPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  return Buffer.from(await pdf.save());
}

describe("Teacher binary uploads", () => {
  it("accepts a bounded image matching its MIME type", async () => {
    const png = await tinyPng();
    expect((await decodeTeacherPhoto({ mimeType: "image/png", dataBase64: png.toString("base64") })).bytes).toEqual(png);
  });

  it("rejects a spoofed type and invalid base64", async () => {
    const png = await tinyPng();
    await expect(decodeTeacherPhoto({ mimeType: "image/jpeg", dataBase64: png.toString("base64") })).rejects.toThrow();
    await expect(decodeTeacherPhoto({ mimeType: "image/png", dataBase64: "not base64" })).rejects.toThrow();
  });

  it("rejects oversized uploads", async () => {
    const large = Buffer.concat([await tinyPng(), Buffer.alloc(2 * 1024 * 1024)]);
    await expect(decodeTeacherPhoto({ mimeType: "image/png", dataBase64: large.toString("base64") })).rejects.toThrow();
  });

  it("accepts PDF documents and rejects mismatched signatures", async () => {
    const pdf = await tinyPdf();
    const png = await tinyPng();
    expect((await decodeTeacherDocument({ mimeType: "application/pdf", dataBase64: pdf.toString("base64") })).bytes).toEqual(pdf);
    await expect(decodeTeacherDocument({ mimeType: "application/pdf", dataBase64: png.toString("base64") })).rejects.toThrow();
  });

  it("rejects truncated image and PDF files with valid prefixes", async () => {
    await expect(decodeTeacherPhoto({ mimeType: "image/jpeg", dataBase64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64") })).rejects.toThrow();
    await expect(decodeTeacherDocument({ mimeType: "application/pdf", dataBase64: Buffer.from("%PDF-").toString("base64") })).rejects.toThrow();
  });
});
